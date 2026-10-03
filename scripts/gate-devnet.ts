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
  explorerAddress,
  fetchDeal,
  findGateAddress,
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
const PROOF_URL = `${PROD_URL}/proof/delivery.html`;
const PAGE_HEADING = "Delivery page";
const AMOUNT = solToLamports(process.env.GATE_SOL ?? "0.01");
const WAIT_MINUTES = Number(process.env.WAIT_MINUTES ?? "20");
const EXIT_MINUTES = Number(process.env.EXIT_MINUTES ?? "30");
const POLL_MS = 5000;
const CONFIRM_ATTEMPTS = 5;
const ERROR_CODE = /Error Code: (\w+)/;
const PANIC = /panicked at (.*)/;

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
const connection = new Connection(clusterUrl, "confirmed");
const queue = new Queue(
  await AnchorUtils.loadProgramFromConnection(connection),
  new PublicKey(SWITCHBOARD_DEVNET_QUEUE)
);

const storeFeed = async (needle: string, oracles: number) =>
  (
    await storeGateFeed(PROOF_URL, needle, {
      crossbarUrl: CROSSBAR_URL,
      oracles,
    })
  ).feedHash;

const fetchQuote = async (
  feed: string,
  signer: KeyPairSigner,
  numSignatures: number
): Promise<Instruction> => {
  const [ed25519] = await queue.fetchManagedUpdateIxs(crossbar, [feed], {
    numSignatures,
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
      .map((line) => line.match(ERROR_CODE)?.[1] ?? line.match(PANIC)?.[0])
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
    `  ${ok ? "refused" : "UNEXPECTED"} ${label.padEnd(44)} ${err ? reason : "accepted"}`
  );
  if (!ok) {
    throw new Error(
      `${label}: expected ${wanted}, got ${err ? reason : "success"}`
    );
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pageContains = async (needle: string) => {
  const response = await fetch(PROOF_URL, { cache: "no-store" });
  return response.ok && (await response.text()).includes(needle);
};

const waitForPage = async (needle: string, until: number): Promise<void> => {
  if (await pageContains(needle)) {
    return;
  }
  if (Date.now() > until) {
    throw new Error(`the page never contained "${needle}"`);
  }
  await sleep(POLL_MS);
  return waitForPage(needle, until);
};

const deliver = async (needle: string) => {
  try {
    execFileSync("bun", ["scripts/demo-deals.ts", "deliver", needle], {
      stdio: "inherit",
    });
  } catch {
    console.log(
      "  cannot write the page from here. On the machine with prod access run:"
    );
    console.log(`    make demo-deliver TEXT="${needle}"`);
  }
  await waitForPage(needle, Date.now() + WAIT_MINUTES * 60_000);
  console.log(`  page ${PROOF_URL} contains "${needle}"`);
};

const confirmInstructions = async (
  signer: KeyPairSigner,
  deal: Address,
  feed: string
) => [
  await fetchQuote(feed, signer, GATE_MIN_SIGNATURES),
  await getGateConfirmInstruction({ check: 0, deal, feedHash: feed }),
];

const confirmByOracles = async (
  signer: KeyPairSigner,
  deal: Address,
  feed: string,
  attempt = 1
): Promise<string> => {
  const instructions = await confirmInstructions(signer, deal, feed);
  const { err, reason } = await simulate(signer, instructions);
  if (!err) {
    return send(
      `confirm (${GATE_MIN_SIGNATURES} oracles)`,
      signer,
      instructions
    );
  }
  console.log(`  attempt ${attempt}: ${reason}`);
  if (attempt === CONFIRM_ATTEMPTS) {
    throw new Error("the oracles did not confirm");
  }
  await sleep(POLL_MS);
  return confirmByOracles(signer, deal, feed, attempt + 1);
};

const settleAndClose = async (signer: KeyPairSigner, deal: Address) => {
  const state = await fetchDeal(rpc, deal);
  if (!state) {
    console.log(`  ${deal} is already closed`);
    return;
  }
  console.log(
    `  status ${state.status}, check 0 yes votes ${state.votes[0]?.yes ?? 0}`
  );
  if (state.status === "funded") {
    const { parties } = state.spec;
    const executable = await Promise.all(
      state.spec.rules.map(async (_, rule) => ({
        rule,
        ...(await simulate(signer, [
          getExecuteInstruction({ deal, executor: signer, parties, rule }),
        ])),
      }))
    );
    const ready = executable.find(({ err }) => err === null);
    if (!ready) {
      console.log("  no rule can execute yet, run again after the exit time");
      return;
    }
    await send(`execute rule ${ready.rule}`, signer, [
      getExecuteInstruction({
        deal,
        executor: signer,
        parties,
        rule: ready.rule,
      }),
    ]);
  }
  await send("close", signer, [getCloseInstruction({ creator: signer, deal })]);
};

const run = async (payer: KeyPairSigner) => {
  const freelancer = keypairFile("gate-freelancer");
  const dealId = newDealId();
  const marker = process.env.MARKER ?? `oracle ${dealId.toString().slice(-6)}`;

  console.log("feeds (Crossbar store, content addressed)");
  const feedHash = await storeFeed(marker, GATE_MIN_SIGNATURES);
  const otherFeed = await storeFeed(PAGE_HEADING, GATE_MIN_SIGNATURES);
  const singleFeed = await storeFeed(PAGE_HEADING, 1);
  const gate = await findGateAddress(feedHash);
  console.log(
    `  deal feed   ${feedHash} (page contains "${marker}", ${GATE_MIN_SIGNATURES} oracles)`
  );
  console.log(`  other feed  ${otherFeed} (page contains "${PAGE_HEADING}")`);
  console.log(`  single feed ${singleFeed} (same, 1 oracle)`);
  console.log(`  gate        ${gate} ${explorerAddress(gate, cluster)}`);

  const spec = gig({
    amount: AMOUNT,
    check: {
      expect: marker,
      kind: "http_contains",
      target: PROOF_URL,
      threshold: 1,
      witnesses: [gate],
    },
    client: payer.address,
    deadline: Math.floor(Date.now() / 1000) + EXIT_MINUTES * 60,
    freelancer: (await freelancer).address,
    title: "Switchboard oracle gate",
  });
  const validation = validateDealSpec(spec);
  if (!validation.ok) {
    throw new Error(JSON.stringify(validation));
  }

  console.log("\ndeal");
  const create = await getCreateDealInstruction({
    creator: payer,
    dealId,
    spec,
  });
  const { deal } = create;
  await send("create and fund", payer, [
    create,
    getFundInstruction({ deal, funder: payer }),
  ]);
  console.log(`  deal ${deal} ${explorerAddress(deal, cluster)}`);
  console.log(`  deal page ${PROD_URL}/deals/${deal}`);

  const confirm = (feed: string) =>
    getGateConfirmInstruction({ check: 0, deal, feedHash: feed });

  console.log("\nrefused (simulated, nothing sent)");
  if (await pageContains(marker)) {
    throw new Error(
      `the page already contains "${marker}", pick another MARKER`
    );
  }
  const earlyQuote = await fetchQuote(
    feedHash,
    payer,
    GATE_MIN_SIGNATURES
  ).catch((error: Error) => {
    console.log(
      `  refused ${"page does not contain the marker yet".padEnd(44)} no quote: ${error.message}`
    );
    return null;
  });
  if (earlyQuote) {
    await expectRefused(
      "page does not contain the marker yet",
      "NotTrue",
      payer,
      [earlyQuote, await confirm(feedHash)]
    );
  }
  const otherQuote = await fetchQuote(otherFeed, payer, GATE_MIN_SIGNATURES);
  await expectRefused("true quote of another feed hash", "WrongFeed", payer, [
    otherQuote,
    await confirm(feedHash),
  ]);
  await expectRefused(
    "gate of another feed, not a witness",
    "NotAWitness",
    payer,
    [otherQuote, await confirm(otherFeed)]
  );
  await expectRefused(
    "true quote with 1 oracle signature",
    "TooFewSignatures",
    payer,
    [await fetchQuote(singleFeed, payer, 1), await confirm(singleFeed)]
  );
  await expectRefused("confirm without a quote", "MissingQuote", payer, [
    await confirm(feedHash),
  ]);

  console.log("\ndelivery");
  await deliver(marker);

  console.log("\nconfirm by the oracles, then execute and close");
  await confirmByOracles(payer, deal, feedHash);
  await settleAndClose(payer, deal);
  console.log(`\ndone: ${spec.parties[1]} paid by the oracle gate`);
};

const runner = await keypairFile(process.env.GATE_PAYER ?? "gate-payer");
const [, , command, target] = process.argv;
if (command === "finish" && target) {
  await settleAndClose(runner, address(target));
} else {
  await run(runner);
}
