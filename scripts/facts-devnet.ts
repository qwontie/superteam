import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Address,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  type Instruction,
  type KeyPairSigner,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { Connection, PublicKey } from "@solana/web3.js";
import { CrossbarClient, CrossbarNetwork } from "@switchboard-xyz/common";
import { AnchorUtils, Queue } from "@switchboard-xyz/on-demand";
import {
  describeCheckFact,
  explorerAddress,
  fetchDeal,
  GATE_MIN_SIGNATURES,
  getCloseInstruction,
  getCreateDealInstruction,
  getExecuteInstruction,
  getFundInstruction,
  getGateConfirmInstruction,
  gig,
  newDealId,
  pinQuoteInstruction,
  SWITCHBOARD_DEVNET_QUEUE,
  solToLamports,
  validateDealSpec,
} from "../packages/sdk/src";
import {
  GATE_CROSSBAR_URL,
  storeGateFeed,
} from "../packages/sdk/src/gate-feed";
import { cluster, PROD_URL, rpc, send } from "./demo-common";

const CROSSBAR_URL = process.env.CROSSBAR_URL ?? GATE_CROSSBAR_URL;
const AMOUNT = solToLamports(process.env.FACTS_SOL ?? "0.01");
const EXIT_MINUTES = Number(process.env.EXIT_MINUTES ?? "30");
const LOCKED_EXIT_SECONDS = Number(process.env.LOCKED_EXIT_SECONDS ?? "150");
const POLL_MS = 5000;
const CONFIRM_ATTEMPTS = 5;
const ERROR_CODE = /Error Code: (\w+)/;

const TRUE_FACTS: [string, string][] = [
  ["wikidata:Q9696/P570", "exists"],
  ["price:SOL-USD", ">100"],
];
const LOCKED_FACT: [string, string] = ["wikidata:Q22686/P570", "exists"];
const FALSE_PRICE: [string, string] = ["price:SOL-USD", ">500"];

const keysDir = process.env.KEYS_DIR ?? "";
const clusterUrl = process.env.CLUSTER_URL ?? "";

const keypairFile = (name: string) => {
  const file = join(keysDir, `${name}.json`);
  if (!existsSync(file)) {
    execFileSync("solana-keygen", [
      "new",
      "--no-bip39-passphrase",
      "--silent",
      "--outfile",
      file,
    ]);
  }
  return createKeyPairSignerFromBytes(
    Uint8Array.from(JSON.parse(readFileSync(file, "utf8")))
  );
};

const crossbar = new CrossbarClient(CROSSBAR_URL, true);
crossbar.setNetwork(CrossbarNetwork.SolanaDevnet);
const queue = new Queue(
  await AnchorUtils.loadProgramFromConnection(
    new Connection(clusterUrl, "confirmed")
  ),
  new PublicKey(SWITCHBOARD_DEVNET_QUEUE)
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchQuote = async (
  feed: string,
  signer: KeyPairSigner
): Promise<Instruction> => {
  const [ed25519] = await queue.fetchManagedUpdateIxs(crossbar, [feed], {
    numSignatures: GATE_MIN_SIGNATURES,
    payer: new PublicKey(signer.address),
  } as never);
  if (!ed25519) {
    throw new Error(`no quote for ${feed}`);
  }
  return pinQuoteInstruction(
    {
      data: Uint8Array.from(ed25519.data),
      programAddress: address(ed25519.programId.toBase58()),
    },
    0
  );
};

const simulate = async (signer: KeyPairSigner, instructions: Instruction[]) => {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (draft) => setTransactionMessageFeePayerSigner(signer, draft),
    (draft) => setTransactionMessageLifetimeUsingBlockhash(blockhash, draft),
    (draft) => appendTransactionMessageInstructions(instructions, draft)
  );
  const transaction = await signTransactionMessageWithSigners(message);
  const { value } = await rpc
    .simulateTransaction(getBase64EncodedWireTransaction(transaction), {
      encoding: "base64",
      sigVerify: false,
    })
    .send();
  const reason =
    (value.logs ?? [])
      .map((line) => line.match(ERROR_CODE)?.[1])
      .find(Boolean) ?? JSON.stringify(value.err);
  return { err: value.err, reason };
};

const expectRefused = async (
  label: string,
  wanted: string,
  signer: KeyPairSigner,
  instructions: Instruction[]
) => {
  const { err, reason } = await simulate(signer, instructions);
  const ok = err !== null && reason.includes(wanted);
  console.log(
    `  ${ok ? "refused" : "UNEXPECTED"} ${label.padEnd(48)} ${err ? reason : "accepted"}`
  );
  if (!ok) {
    throw new Error(`${label}: expected ${wanted}, got ${reason}`);
  }
};

const expectNoQuote = async (
  label: string,
  feed: string,
  signer: KeyPairSigner
) => {
  const quote = await fetchQuote(feed, signer).catch((error: Error) => {
    console.log(`  refused ${label.padEnd(48)} no quote: ${error.message}`);
    return null;
  });
  if (quote) {
    throw new Error(`${label}: the oracles signed a quote`);
  }
};

const chainNow = async () => {
  const slot = await rpc.getSlot().send();
  return Number(await rpc.getBlockTime(slot).send());
};

interface FactDeal {
  deal: Address;
  fact: [string, string];
  feedHash: string;
}

const openDeal = async (
  payer: KeyPairSigner,
  freelancer: Address,
  fact: [string, string],
  exitSeconds: number
): Promise<FactDeal> => {
  const [target, wanted] = fact;
  const now = await chainNow();
  const { feedHash, gateAddress } = await storeGateFeed(target, wanted, {
    crossbarUrl: CROSSBAR_URL,
  });
  const spec = gig({
    amount: AMOUNT,
    check: {
      expect: wanted,
      kind: "http_contains",
      target,
      threshold: 1,
      witnesses: [gateAddress],
    },
    client: payer.address,
    deadline: now + exitSeconds,
    freelancer,
    title: describeCheckFact(target, wanted).slice(0, 48),
  });
  const validation = validateDealSpec(spec, now);
  if (!validation.ok) {
    throw new Error(JSON.stringify(validation));
  }
  const create = await getCreateDealInstruction({
    creator: payer,
    dealId: newDealId(),
    spec,
  });
  console.log(`\n${describeCheckFact(target, wanted)}  [${target} ${wanted}]`);
  console.log(`  feed ${feedHash}`);
  console.log(`  gate ${gateAddress} ${explorerAddress(gateAddress, cluster)}`);
  await send("create and fund", payer, [
    create,
    getFundInstruction({ deal: create.deal, funder: payer }),
  ]);
  console.log(`  deal ${create.deal} ${explorerAddress(create.deal, cluster)}`);
  console.log(`  deal page ${PROD_URL}/deals/${create.deal}`);
  return { deal: create.deal, fact, feedHash };
};

const confirmByOracles = async (
  payer: KeyPairSigner,
  { deal, feedHash }: FactDeal,
  attempt = 1
): Promise<string> => {
  const instructions = [
    await fetchQuote(feedHash, payer),
    await getGateConfirmInstruction({ check: 0, deal, feedHash }),
  ];
  const { err, reason } = await simulate(payer, instructions);
  if (!err) {
    return send(
      `confirm (${GATE_MIN_SIGNATURES} oracles)`,
      payer,
      instructions
    );
  }
  console.log(`  attempt ${attempt}: ${reason}`);
  if (attempt === CONFIRM_ATTEMPTS) {
    throw new Error("the oracles did not confirm");
  }
  await sleep(POLL_MS);
  return confirmByOracles(
    payer,
    { deal, fact: ["", ""], feedHash },
    attempt + 1
  );
};

const settleAndClose = async (payer: KeyPairSigner, deal: Address) => {
  const state = await fetchDeal(rpc, deal);
  if (!state) {
    console.log(`  ${deal} is already closed`);
    return false;
  }
  if (state.status === "funded") {
    const { parties } = state.spec;
    const simulated = await Promise.all(
      state.spec.rules.map(async (_, rule) => ({
        rule,
        ...(await simulate(payer, [
          getExecuteInstruction({ deal, executor: payer, parties, rule }),
        ])),
      }))
    );
    const ready = simulated.find(({ err }) => err === null);
    if (!ready) {
      return false;
    }
    await send(`execute rule ${ready.rule}`, payer, [
      getExecuteInstruction({
        deal,
        executor: payer,
        parties,
        rule: ready.rule,
      }),
    ]);
  }
  await send("close", payer, [getCloseInstruction({ creator: payer, deal })]);
  return true;
};

const waitAndClose = async (
  payer: KeyPairSigner,
  deal: Address,
  until: number
): Promise<void> => {
  if (await settleAndClose(payer, deal)) {
    return;
  }
  if (Date.now() > until) {
    console.log(
      `  no rule can execute yet, run: source scripts/env.sh && bun scripts/facts-devnet.ts finish ${deal}`
    );
    return;
  }
  await sleep(POLL_MS * 2);
  return waitAndClose(payer, deal, until);
};

const run = async (payer: KeyPairSigner) => {
  const freelancer = (await keypairFile("gate-freelancer")).address;

  const settled: FactDeal[] = [];
  for (const fact of TRUE_FACTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one deal at a time keeps the log readable
    settled.push(await openDeal(payer, freelancer, fact, EXIT_MINUTES * 60));
  }
  const locked = await openDeal(
    payer,
    freelancer,
    LOCKED_FACT,
    LOCKED_EXIT_SECONDS
  );

  console.log("\nrefused (simulated, nothing sent)");
  await expectNoQuote(
    describeCheckFact(...LOCKED_FACT),
    locked.feedHash,
    payer
  );
  const falsePrice = await storeGateFeed(...FALSE_PRICE, {
    crossbarUrl: CROSSBAR_URL,
  });
  await expectNoQuote(
    describeCheckFact(...FALSE_PRICE),
    falsePrice.feedHash,
    payer
  );
  const [wikidataDeal, priceDeal] = settled as [FactDeal, FactDeal];
  const trueQuote = await fetchQuote(wikidataDeal.feedHash, payer);
  await expectRefused(
    "true Wikidata quote on the Trump deal",
    "WrongFeed",
    payer,
    [
      trueQuote,
      await getGateConfirmInstruction({
        check: 0,
        deal: locked.deal,
        feedHash: locked.feedHash,
      }),
    ]
  );
  await expectRefused(
    "gate of the Wikidata fact on the Trump deal",
    "NotAWitness",
    payer,
    [
      trueQuote,
      await getGateConfirmInstruction({
        check: 0,
        deal: locked.deal,
        feedHash: wikidataDeal.feedHash,
      }),
    ]
  );
  await expectRefused(
    "gate of the Wikidata fact on the price deal",
    "NotAWitness",
    payer,
    [
      trueQuote,
      await getGateConfirmInstruction({
        check: 0,
        deal: priceDeal.deal,
        feedHash: wikidataDeal.feedHash,
      }),
    ]
  );

  for (const entry of settled) {
    console.log(
      `\n${describeCheckFact(...entry.fact)}: confirm, execute, close`
    );
    // biome-ignore lint/performance/noAwaitInLoops: one transaction at a time
    await confirmByOracles(payer, entry);
    await settleAndClose(payer, entry.deal);
  }

  console.log(
    `\n${describeCheckFact(...LOCKED_FACT)}: still locked, the exit rule refunds the client`
  );
  const state = await fetchDeal(rpc, locked.deal);
  console.log(
    `  status ${state?.status}, yes votes ${state?.votes[0]?.yes ?? 0}, rule 0 (pay on the fact) not executable`
  );
  await expectRefused(
    "pay on the fact before it is confirmed",
    "ConditionNotMet",
    payer,
    [
      getExecuteInstruction({
        deal: locked.deal,
        executor: payer,
        parties: state?.spec.parties ?? [],
        rule: 0,
      }),
    ]
  );
  await waitAndClose(
    payer,
    locked.deal,
    Date.now() + (LOCKED_EXIT_SECONDS + 120) * 1000
  );
};

const runner = await keypairFile(process.env.GATE_PAYER ?? "gate-payer");
const [, , command, target] = process.argv;
if (command === "finish" && target) {
  await settleAndClose(runner, address(target));
} else {
  await run(runner);
}
