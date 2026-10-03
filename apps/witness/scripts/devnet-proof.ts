import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CheckKind,
  evaluateDeal,
  explorerAddress,
  explorerTx,
  fetchDeal,
  getCloseInstruction,
  getCreateDealInstruction,
  getExecuteInstruction,
  getFundInstruction,
  gig,
  newDealId,
  sendInstructions,
  solToLamports,
  validateDealSpec,
} from "@pact/sdk";
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { spawnSync } from "bun";
import { loadConfig, wsUrlFor } from "../src/config";

const CHECKS: {
  expect: string;
  kind: CheckKind;
  target: string;
  title: string;
}[] = [
  {
    expect: "Example Domain",
    kind: "http_contains",
    target: "https://example.com",
    title: "Witness proof: page contains marker",
  },
  {
    expect: "success",
    kind: "github_checks",
    target: "solana-foundation/anchor@a91e5bebf5761db0d8cf419650379d80340e68c9",
    title: "Witness proof: CI green",
  },
  {
    expect: "",
    kind: "github_pr_merged",
    target: "solana-foundation/anchor#5125",
    title: "Witness proof: PR merged",
  },
];

const commonDir = spawnSync([
  "git",
  "rev-parse",
  "--path-format=absolute",
  "--git-common-dir",
])
  .stdout.toString()
  .trim();
const keysDir = process.env.KEYS_DIR ?? join(commonDir, "..", ".keys");
const config = loadConfig();
const rpc = createSolanaRpc(config.rpcUrl);
const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrlFor(config.rpcUrl));

const wallet = (name: string) =>
  createKeyPairSignerFromBytes(
    Uint8Array.from(
      JSON.parse(readFileSync(join(keysDir, `${name}.json`), "utf8"))
    )
  );

const send = async (
  step: string,
  feePayer: KeyPairSigner,
  instructions: Instruction[]
) => {
  const signature = await sendInstructions({
    feePayer,
    instructions,
    rpc,
    rpcSubscriptions,
  });
  console.log(`${step.padEnd(34)} ${explorerTx(signature, config.cluster)}`);
};

const create = async () => {
  const [client, freelancer, ...witnesses] = await Promise.all(
    ["client", "freelancer", "witness1", "witness2", "witness3"].map(wallet)
  );
  if (!(client && freelancer)) {
    throw new Error("demo wallets are missing");
  }
  const kinds = new Set(process.argv.slice(3));
  for (const check of CHECKS.filter(
    (entry) => kinds.size === 0 || kinds.has(entry.kind)
  )) {
    const spec = gig({
      amount: solToLamports("0.01"),
      check: {
        expect: check.expect,
        kind: check.kind,
        target: check.target,
        threshold: 2,
        witnesses: witnesses.map((signer) => signer.address),
      },
      client: client.address,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      freelancer: freelancer.address,
      title: check.title,
    });
    const validation = validateDealSpec(spec);
    if (!validation.ok) {
      throw new Error(JSON.stringify(validation));
    }
    // biome-ignore lint/performance/noAwaitInLoops: deals are created one after another
    const instruction = await getCreateDealInstruction({
      creator: client,
      dealId: newDealId(),
      spec,
    });
    await send(`create and fund ${check.kind}`, client, [
      instruction,
      getFundInstruction({ deal: instruction.deal, funder: client }),
    ]);
    console.log(
      `deal ${check.kind.padEnd(29)} ${explorerAddress(instruction.deal, config.cluster)}`
    );
  }
};

const settle = async () => {
  const client = await wallet("client");
  for (const deal of process.argv.slice(3)) {
    // biome-ignore lint/performance/noAwaitInLoops: settle deals in order
    const state = await fetchDeal(rpc, address(deal));
    if (!state) {
      console.log(`deal ${deal} not found`);
      continue;
    }
    const { executable } = evaluateDeal(state, Math.floor(Date.now() / 1000));
    console.log(
      `deal ${deal} ${state.status}, votes ${JSON.stringify(state.votes[0]?.byWitness)}, executable rules ${JSON.stringify(executable)}`
    );
    if (state.status === "funded" && executable.includes(0)) {
      await send("execute rule 0 (attested)", client, [
        getExecuteInstruction({
          deal: address(deal),
          executor: client,
          parties: state.spec.parties,
          rule: 0,
        }),
      ]);
    }
    const after = await fetchDeal(rpc, address(deal));
    if (after?.status === "settled" && process.env.CLOSE === "1") {
      await send("close (rent back)", client, [
        getCloseInstruction({ creator: client, deal: address(deal) }),
      ]);
    }
  }
};

const [, , command] = process.argv;
if (command === "create") {
  await create();
} else if (command === "settle") {
  await settle();
} else {
  console.log(
    "usage: bun scripts/devnet-proof.ts create [kind...] | settle <deal...>"
  );
}
process.exit(0);
