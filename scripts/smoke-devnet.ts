import { readFileSync } from "node:fs";
import {
  type Address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  bounty,
  type Cluster,
  type DealSpec,
  evaluateDeal,
  explorerAddress,
  explorerTx,
  fetchDeal,
  getAttestInstruction,
  getCloseInstruction,
  getCreateDealInstruction,
  getExecuteInstruction,
  getFundInstruction,
  gig,
  lamportsToSol,
  newDealId,
  sendInstructions,
  solToLamports,
  validateDealSpec,
} from "../packages/sdk/src";

const keysDir = process.env.KEYS_DIR;
const url = process.env.CLUSTER_URL;
if (!(keysDir && url)) {
  throw new Error(
    "KEYS_DIR and CLUSTER_URL are not set, run through make smoke-devnet"
  );
}

const AMOUNT = solToLamports("0.01");
const REFUND_DEADLINE_SECONDS = 20;
const cluster: Cluster =
  url.includes("localhost") || url.includes("127.0.0.1")
    ? "localnet"
    : "devnet";
const wsUrl = url.replace(/^http/, "ws").replace(":8899", ":8900");
const rpc = createSolanaRpc(url);
const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl);

const wallet = (name: string) =>
  createKeyPairSignerFromBytes(
    Uint8Array.from(JSON.parse(readFileSync(`${keysDir}/${name}.json`, "utf8")))
  );

const [client, freelancer, witness1, witness2, witness3] = (await Promise.all(
  ["client", "freelancer", "witness1", "witness2", "witness3"].map(wallet)
)) as [
  KeyPairSigner,
  KeyPairSigner,
  KeyPairSigner,
  KeyPairSigner,
  KeyPairSigner,
];

const send = async (
  step: string,
  feePayer: KeyPairSigner,
  instruction: Instruction
) => {
  const signature = await sendInstructions({
    feePayer,
    instructions: [instruction],
    rpc,
    rpcSubscriptions,
  });
  console.log(`${step.padEnd(28)} ${explorerTx(signature, cluster)}`);
};

const chainNow = async () => {
  const slot = await rpc.getSlot({ commitment: "confirmed" }).send();
  const time = await rpc.getBlockTime(slot).send();
  return Number(time);
};

const WITNESS_CHECK = {
  target: "Smoke test: landing page delivered as agreed",
  witnesses: [witness1.address, witness2.address, witness3.address],
};

const gigSpec = (title: string, deadline: number) =>
  gig({
    amount: AMOUNT,
    check: WITNESS_CHECK,
    client: client.address,
    deadline,
    freelancer: freelancer.address,
    title,
  });

const createAndFund = async (spec: DealSpec) => {
  const valid = validateDealSpec(spec, await chainNow());
  if (!valid.ok) {
    throw new Error(valid.problems.join("\n"));
  }
  const create = await getCreateDealInstruction({
    creator: client,
    dealId: newDealId(),
    spec,
  });
  console.log(
    `deal                         ${explorerAddress(create.deal, cluster)}`
  );
  await send("create_deal (client)", client, create);
  await send(
    "fund 0.01 SOL (client)",
    client,
    getFundInstruction({ deal: create.deal, funder: client })
  );
  return { deal: create.deal, parties: spec.parties };
};

const waitUntil = async (unixSeconds: number): Promise<void> => {
  if ((await chainNow()) >= unixSeconds) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return waitUntil(unixSeconds);
};

const balance = async (address: Address) =>
  (await rpc.getBalance(address, { commitment: "confirmed" }).send()).value;

const keepDeals = process.env.KEEP_DEALS === "1";

const closeDeal = async (deal: Address) => {
  if (keepDeals) {
    console.log("deal kept open (KEEP_DEALS=1)");
    return;
  }
  const before = await balance(client.address);
  await send(
    "close (client)",
    client,
    getCloseInstruction({ creator: client, deal })
  );
  const back = (await balance(client.address)) - before + 5000n;
  console.log(
    `rent back to the client ${lamportsToSol(back)} SOL, deal account closed: ${(await fetchDeal(rpc, deal)) === null}`
  );
};

const report = async (deal: Address) => {
  const state = await fetchDeal(rpc, deal);
  if (!state) {
    throw new Error(`deal ${deal} not found`);
  }
  console.log(
    `status ${state.status}, settled by rule ${state.settledRule}, deal holds ${lamportsToSol(state.lamports)} SOL of rent`
  );
  return state;
};

console.log("Run 1: witnesses confirm delivery, the freelancer is paid");
const paidRun = await createAndFund(
  gigSpec("Smoke: gig paid on 2 of 3", (await chainNow()) + 3600)
);
await send(
  "attest yes (witness1)",
  witness1,
  getAttestInstruction({
    check: 0,
    deal: paidRun.deal,
    verdict: true,
    witness: witness1,
  })
);
await send(
  "attest yes (witness2)",
  witness2,
  getAttestInstruction({
    check: 0,
    deal: paidRun.deal,
    verdict: true,
    witness: witness2,
  })
);
const ready = await fetchDeal(rpc, paidRun.deal);
if (!ready) {
  throw new Error("deal vanished");
}
console.log(
  `rules that can fire now: ${evaluateDeal(ready, await chainNow()).executable.join(", ")}`
);
const freelancerBefore = await balance(freelancer.address);
await send(
  "execute rule 0 (freelancer)",
  freelancer,
  getExecuteInstruction({
    deal: paidRun.deal,
    executor: freelancer,
    parties: paidRun.parties,
    rule: 0,
  })
);
const paid = await report(paidRun.deal);
console.log(
  `freelancer balance change ${lamportsToSol((await balance(freelancer.address)) - freelancerBefore + 5000n)} SOL plus the 5000 lamport fee`
);
if (paid.status !== "settled" || paid.settledRule !== 0) {
  throw new Error("run 1 did not settle on rule 0");
}
await closeDeal(paidRun.deal);

console.log(
  `\nRun 2: nobody shows up, after a ${REFUND_DEADLINE_SECONDS} s deadline a witness executes the refund`
);
const refundDeadline = (await chainNow()) + REFUND_DEADLINE_SECONDS;
const refund = await createAndFund(
  gigSpec("Smoke: refund after deadline", refundDeadline)
);
await waitUntil(refundDeadline);
const clientBefore = await balance(client.address);
await send(
  "execute rule 2 (witness3)",
  witness3,
  getExecuteInstruction({
    deal: refund.deal,
    executor: witness3,
    parties: refund.parties,
    rule: 2,
  })
);
const refunded = await report(refund.deal);
console.log(
  `client balance change ${lamportsToSol((await balance(client.address)) - clientBefore)} SOL`
);
if (refunded.status !== "settled" || refunded.settledRule !== 2) {
  throw new Error("run 2 did not settle on rule 2");
}
await closeDeal(refund.deal);

console.log(
  "\nRun 3: bounty, 2 of 3 reviewers name the winner, the winner is paid"
);
const bountyRun = await createAndFund(
  bounty({
    amount: AMOUNT,
    check: { ...WITNESS_CHECK, target: "Smoke test: best landing page wins" },
    deadline: (await chainNow()) + 3600,
    sponsor: client.address,
    title: "Smoke: bounty",
  })
);
const nominate = (name: string, witness: KeyPairSigner) =>
  send(
    `nominate freelancer (${name})`,
    witness,
    getAttestInstruction({
      check: 0,
      deal: bountyRun.deal,
      nominee: freelancer.address,
      verdict: true,
      witness,
    })
  );
await nominate("witness1", witness1);
await nominate("witness2", witness2);
const won = await fetchDeal(rpc, bountyRun.deal);
console.log(`winner slot filled with ${won?.spec.parties[1]}`);
await send(
  "execute rule 0 (witness3)",
  witness3,
  getExecuteInstruction({
    deal: bountyRun.deal,
    executor: witness3,
    parties: won?.spec.parties ?? [],
    rule: 0,
  })
);
const awarded = await report(bountyRun.deal);
if (
  awarded.status !== "settled" ||
  awarded.spec.parties[1] !== freelancer.address
) {
  throw new Error("run 3 did not pay the nominated winner");
}
await closeDeal(bountyRun.deal);
