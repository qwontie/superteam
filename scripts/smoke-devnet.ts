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
  type Cluster,
  evaluateDeal,
  explorerAddress,
  explorerTx,
  fetchDeal,
  freelanceWithCheck,
  getAttestInstruction,
  getCreateDealInstruction,
  getExecuteInstruction,
  getFundInstruction,
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

const createAndFund = async (title: string, deadline: number) => {
  const spec = freelanceWithCheck({
    amount: AMOUNT,
    check: {
      target: "Smoke test: landing page delivered as agreed",
      witnesses: [witness1.address, witness2.address, witness3.address],
    },
    client: client.address,
    deadline,
    freelancer: freelancer.address,
    title,
  });
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
const gig = await createAndFund(
  "Smoke: gig paid on 2 of 3",
  (await chainNow()) + 3600
);
await send(
  "attest yes (witness1)",
  witness1,
  getAttestInstruction({
    check: 0,
    deal: gig.deal,
    verdict: true,
    witness: witness1,
  })
);
await send(
  "attest yes (witness2)",
  witness2,
  getAttestInstruction({
    check: 0,
    deal: gig.deal,
    verdict: true,
    witness: witness2,
  })
);
const ready = await fetchDeal(rpc, gig.deal);
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
    deal: gig.deal,
    executor: freelancer,
    parties: gig.parties,
    rule: 0,
  })
);
const paid = await report(gig.deal);
console.log(
  `freelancer balance change ${lamportsToSol((await balance(freelancer.address)) - freelancerBefore + 5000n)} SOL plus the 5000 lamport fee`
);
if (paid.status !== "settled" || paid.settledRule !== 0) {
  throw new Error("run 1 did not settle on rule 0");
}

console.log(
  `\nRun 2: nobody shows up, after a ${REFUND_DEADLINE_SECONDS} s deadline a witness executes the refund`
);
const refundDeadline = (await chainNow()) + REFUND_DEADLINE_SECONDS;
const refund = await createAndFund(
  "Smoke: refund after deadline",
  refundDeadline
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
