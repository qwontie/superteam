import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { address, type KeyPairSigner } from "@solana/kit";
import {
  bounty,
  DEMO_WITNESS_NODES,
  type DealSpec,
  type DealState,
  evaluateDeal,
  exitTime,
  explorerAddress,
  fetchDeal,
  getAttestInstruction,
  getCancelInstruction,
  getCloseInstruction,
  getCreateDealInstruction,
  getExecuteInstruction,
  getFundInstruction,
  gig,
  newDealId,
  solToLamports,
  validateDealSpec,
} from "../packages/sdk/src";
import {
  agentsDir,
  cluster,
  PROD_HOST,
  PROD_URL,
  rpc,
  send,
  type WalletName,
  wallet,
  wallets,
} from "./demo-common";

const KINDS = [
  "votes",
  "one-short",
  "exit-soon",
  "bounty",
  "settled",
  "auto",
] as const;
type Kind = (typeof KINDS)[number];

const AMOUNT = solToLamports(process.env.DEMO_SOL ?? "0.02");
const WAIT_HOURS = Number(process.env.WAIT_HOURS ?? "24");
const EXIT_MINUTES = Number(process.env.EXIT_MINUTES ?? "3");
const PAGE_DIR = process.env.DEMO_PAGE_DIR ?? "/root/superteam-demo-page";
const PROOF_URL = `${PROD_URL}/proof/delivery.html`;
const REVIEW = "Landing page delivered as agreed";
const HTML_CHARS = /[<>&]/;
const LIST_ITEM = /<li>(.*)<\/li>/g;

const recordFile = join(agentsDir, "handoff", "demo-deals.json");
const listFile = join(agentsDir, "handoff", "demo-deals.md");

interface DemoDeal {
  address: string;
  created: string;
  kind: Kind;
  marker?: string;
  title: string;
}

const DESCRIPTIONS: Record<Kind, string> = {
  auto: `automated check: ${PROOF_URL} must contain the marker, demo witness nodes 2 of 3 vote and execute by themselves`,
  bounty:
    "funded bounty, winner slot open, reviewers witness1..3 name the winner, 2 of 3",
  "exit-soon": `funded gig, nobody acts, refund to the client opens ${EXIT_MINUTES} min after creation`,
  "one-short":
    "funded gig, witness1 voted yes, one more reviewer vote pays the freelancer",
  settled:
    "settled gig with full history: create and fund, two votes, execute by a third party",
  votes: "funded gig waiting for reviewer votes (witness1..3, 2 of 3)",
};

const TITLES: Record<Kind, string> = {
  auto: "Demo: landing page, checked by nodes",
  bounty: "Demo: bounty, winner open",
  "exit-soon": "Demo: nobody shows up, refund soon",
  "one-short": "Demo: landing page, one vote short",
  settled: "Demo: landing page, paid",
  votes: "Demo: landing page, waiting for review",
};

const load = (): DemoDeal[] =>
  existsSync(recordFile)
    ? (JSON.parse(readFileSync(recordFile, "utf8")) as DemoDeal[])
    : [];

const save = (deals: DemoDeal[]) => {
  mkdirSync(join(agentsDir, "handoff"), { recursive: true });
  writeFileSync(recordFile, `${JSON.stringify(deals, null, 2)}\n`);
};

const now = () => Math.floor(Date.now() / 1000);
const dealLink = (deal: string) => `${PROD_URL}/deals/${deal}`;

const specFor = (
  kind: Kind,
  signers: Record<WalletName, KeyPairSigner>,
  marker: string
): DealSpec => {
  const reviewers = [signers.witness1, signers.witness2, signers.witness3].map(
    (signer) => signer.address
  );
  const waitUntil = now() + Math.round(WAIT_HOURS * 3600);
  const base = {
    amount: AMOUNT,
    client: signers.client.address,
    freelancer: signers.freelancer.address,
    title: TITLES[kind],
  };
  if (kind === "bounty") {
    return bounty({
      amount: AMOUNT,
      check: {
        target: "Best landing page wins",
        threshold: 2,
        witnesses: reviewers,
      },
      deadline: waitUntil,
      sponsor: signers.client.address,
      title: TITLES[kind],
    });
  }
  if (kind === "auto") {
    return gig({
      ...base,
      check: {
        expect: marker,
        kind: "http_contains",
        target: PROOF_URL,
        threshold: DEMO_WITNESS_NODES.threshold,
        witnesses: [...DEMO_WITNESS_NODES.witnesses],
      },
      deadline: waitUntil,
    });
  }
  return gig({
    ...base,
    check: { target: REVIEW, threshold: 2, witnesses: reviewers },
    deadline: kind === "exit-soon" ? now() + EXIT_MINUTES * 60 : waitUntil,
  });
};

const createOne = async (
  kind: Kind,
  signers: Record<WalletName, KeyPairSigner>
): Promise<DemoDeal> => {
  const dealId = newDealId();
  const marker = `delivered ${dealId.toString().slice(-6)}`;
  const spec = specFor(kind, signers, marker);
  const validation = validateDealSpec(spec);
  if (!validation.ok) {
    throw new Error(`${kind}: ${JSON.stringify(validation)}`);
  }
  console.log(`\n${kind}: ${DESCRIPTIONS[kind]}`);
  const create = await getCreateDealInstruction({
    creator: signers.client,
    dealId,
    spec,
  });
  const { deal } = create;
  await send("create and fund (client)", signers.client, [
    create,
    getFundInstruction({ deal, funder: signers.client }),
  ]);
  const vote = (who: "witness1" | "witness2") =>
    send(`vote yes (${who})`, signers[who], [
      getAttestInstruction({
        check: 0,
        deal,
        verdict: true,
        witness: signers[who],
      }),
    ]);
  if (kind === "one-short" || kind === "settled") {
    await vote("witness1");
  }
  if (kind === "settled") {
    await vote("witness2");
    await send("execute rule 0 (witness3)", signers.witness3, [
      getExecuteInstruction({
        deal,
        executor: signers.witness3,
        parties: spec.parties,
        rule: 0,
      }),
    ]);
  }
  console.log(`  deal page ${dealLink(deal)}`);
  console.log(`  explorer  ${explorerAddress(deal, cluster)}`);
  return {
    address: deal,
    created: new Date().toISOString(),
    kind,
    ...(kind === "auto" ? { marker } : {}),
    title: spec.title,
  };
};

const describe = (state: DealState | null, now_: number) => {
  if (!state) {
    return "closed";
  }
  const [votes] = state.votes;
  const tally = votes ? `, votes ${votes.yes} yes ${votes.no} no` : "";
  const { executable } = evaluateDeal(state, now_);
  const exit = state.spec.rules.map(exitTime).find((ts) => ts !== null);
  const exitText =
    exit && state.status === "funded"
      ? `, exit ${exit > now_ ? `in ${Math.ceil((exit - now_) / 60)} min` : "open now"}`
      : "";
  const ready =
    state.status === "funded" && executable.length > 0
      ? `, executable rules ${executable.join(",")}`
      : "";
  return `${state.status}${tally}${exitText}${ready}`;
};

const writeList = async (deals: DemoDeal[]) => {
  const at = now();
  const states = await Promise.all(
    deals.map((deal) => fetchDeal(rpc, address(deal.address)))
  );
  const rows = deals.map((deal, index) => {
    const state = states[index] ?? null;
    return `| ${deal.kind} | ${describe(state, at)} | [deal page](${dealLink(deal.address)}) | [explorer](${explorerAddress(deal.address, cluster)}) | \`${deal.address}\` |`;
  });
  const markers = deals
    .filter((deal) => deal.marker)
    .map((deal) => `- \`${deal.address}\` expects \`${deal.marker}\``);
  const text = [
    "# Demo deals on devnet",
    "",
    `Written by \`make demo-deals\` at ${new Date().toISOString()}. Program on devnet, client and freelancer are the demo wallets, reviewers witness1..3. Rerun \`make demo-deals-status\` for the live state.`,
    "",
    "| Kind | State when written | Deal page | Explorer | Address |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "## What each kind shows",
    "",
    ...KINDS.map((kind) => `- \`${kind}\`: ${DESCRIPTIONS[kind]}`),
    "",
    "## Flip the page of the automated check",
    "",
    `The page is ${PROOF_URL}, a static file on our server (\`${PAGE_DIR}/delivery.html\`, served by the \`demo-page\` container through the shared Caddy, no cache).`,
    "",
    "- `make demo-deliver` writes the marker of the newest automated deal into the page; the three nodes see it on their next scan (20 s), two vote yes, one executes rule 0, the freelancer is paid.",
    '- `make demo-deliver TEXT="..."` writes any text, for a deal created live in the builder.',
    "- `make demo-undeliver` empties the page again.",
    "",
    "Markers:",
    "",
    ...(markers.length > 0 ? markers : ["- none"]),
    "",
  ].join("\n");
  writeFileSync(listFile, text);
  console.log(`\nlist written to ${listFile}`);
};

const createAll = async (kinds: Kind[]) => {
  const signers = await wallets();
  const created: DemoDeal[] = [];
  for (const kind of kinds) {
    // biome-ignore lint/performance/noAwaitInLoops: deals are created one after another from the same wallet
    const deal = await createOne(kind, signers);
    created.push(deal);
    save([...load(), deal]);
  }
  await writeList(created);
};

const status = async () => {
  const deals = load();
  const at = now();
  for (const deal of deals) {
    // biome-ignore lint/performance/noAwaitInLoops: few deals, keeps the RPC calm
    const state = await fetchDeal(rpc, address(deal.address));
    console.log(
      `${deal.kind.padEnd(10)} ${describe(state, at).padEnd(60)} ${dealLink(deal.address)}`
    );
  }
  if (deals.length === 0) {
    console.log("no demo deals recorded, run make demo-deals");
  }
};

const clean = async () => {
  const signers = await wallets();
  const kept: DemoDeal[] = [];
  const at = now();
  for (const deal of load()) {
    const target = address(deal.address);
    // biome-ignore lint/performance/noAwaitInLoops: one deal at a time
    let state = await fetchDeal(rpc, target);
    console.log(`${deal.kind} ${deal.address}: ${describe(state, at)}`);
    if (!state) {
      continue;
    }
    if (state.status === "draft") {
      await send("cancel (rent back)", signers.client, [
        getCancelInstruction({ creator: signers.client, deal: target }),
      ]);
      continue;
    }
    if (state.status === "funded") {
      const [rule] = evaluateDeal(state, at).executable;
      if (rule === undefined) {
        kept.push(deal);
        continue;
      }
      await send(`execute rule ${rule}`, signers.client, [
        getExecuteInstruction({
          deal: target,
          executor: signers.client,
          parties: state.spec.parties,
          rule,
        }),
      ]);
      state = await fetchDeal(rpc, target);
    }
    if (state?.status === "settled") {
      await send("close (rent back)", signers.client, [
        getCloseInstruction({ creator: signers.client, deal: target }),
      ]);
    }
  }
  save(kept);
  console.log(
    kept.length > 0
      ? `${kept.length} funded deal(s) kept: their exit time has not come, run make demo-clean after it`
      : "every demo deal is closed"
  );
};

const vote = async (deal: string, who: string, nominee?: string) => {
  if (!["witness1", "witness2", "witness3"].includes(who)) {
    throw new Error("AS must be witness1, witness2 or witness3");
  }
  const signer = await wallet(who as WalletName);
  await send(`vote yes (${who})`, signer, [
    getAttestInstruction({
      check: 0,
      deal: address(deal),
      nominee: nominee ?? null,
      verdict: true,
      witness: signer,
    }),
  ]);
  const state = await fetchDeal(rpc, address(deal));
  console.log(`${deal}: ${describe(state, now())}`);
};

const pagePath = `${PAGE_DIR}/delivery.html`;

const writePage = (lines: string[]) => {
  const items = lines.map((line) => `    <li>${line}</li>`).join("\n");
  const html = `<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <title>Pact demo delivery page</title>
  <h1>Delivery page</h1>
  <p>This page is the agreed source of an automated check in the Pact demo. Witness nodes read it and vote on chain when it lists the deal's marker.</p>
  <ul>
${items}
  </ul>
</html>
`;
  execFileSync(
    "ssh",
    [
      PROD_HOST,
      `mkdir -p ${PAGE_DIR} && cat > ${pagePath}.tmp && chmod 644 ${pagePath}.tmp && mv ${pagePath}.tmp ${pagePath}`,
    ],
    { input: html, stdio: ["pipe", "inherit", "inherit"] }
  );
};

const readPageLines = () => {
  const html = execFileSync(
    "ssh",
    [PROD_HOST, `cat ${pagePath} 2>/dev/null || true`],
    { encoding: "utf8" }
  );
  return [...html.matchAll(LIST_ITEM)].map((match) => match[1] ?? "");
};

const deliver = (text?: string) => {
  const marker =
    text?.trim() ||
    load()
      .filter((deal) => deal.marker)
      .at(-1)?.marker;
  if (!marker) {
    throw new Error("no automated demo deal recorded, pass TEXT=...");
  }
  if (HTML_CHARS.test(marker)) {
    throw new Error("the text cannot contain <, > or &");
  }
  const lines = readPageLines().filter((line) => line !== marker);
  writePage([...lines, marker]);
  console.log(`page ${PROOF_URL} now contains "${marker}"`);
};

const undeliver = () => {
  writePage([]);
  console.log(`page ${PROOF_URL} lists no markers`);
};

const [, , command, ...rest] = process.argv;
if (command === "create") {
  const wanted = rest.length > 0 ? rest : [...KINDS];
  const unknown = wanted.filter((kind) => !KINDS.includes(kind as Kind));
  if (unknown.length > 0) {
    throw new Error(
      `unknown kind ${unknown.join(", ")}, kinds: ${KINDS.join(", ")}`
    );
  }
  await createAll(wanted as Kind[]);
} else if (command === "status") {
  await status();
} else if (command === "clean") {
  await clean();
} else if (command === "vote" && rest[0] && rest[1]) {
  await vote(rest[0], rest[1], rest[2]);
} else if (command === "deliver") {
  deliver(rest.join(" "));
} else if (command === "undeliver") {
  undeliver();
} else {
  console.log(
    `usage: bun scripts/demo-deals.ts create [${KINDS.join("|")}...] | status | clean | vote <deal> <witnessN> [nominee] | deliver [text] | undeliver`
  );
  process.exit(1);
}
process.exit(0);
