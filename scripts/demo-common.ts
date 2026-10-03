import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  type Cluster,
  explorerTx,
  sendInstructions,
} from "../packages/sdk/src";

export const WALLETS = [
  "treasury",
  "client",
  "freelancer",
  "witness1",
  "witness2",
  "witness3",
] as const;
export type WalletName = (typeof WALLETS)[number];

export const PROD_URL = process.env.PROD_URL ?? "https://pact.qwontie.dev";
export const PROD_HOST = process.env.PROD_HOST ?? "personal-main-contabo";

const keysDir = process.env.KEYS_DIR;
const url = process.env.CLUSTER_URL;
if (!(keysDir && url)) {
  throw new Error("KEYS_DIR and CLUSTER_URL are not set, run through make");
}

export const cluster: Cluster =
  url.includes("localhost") || url.includes("127.0.0.1")
    ? "localnet"
    : "devnet";
export const rpc = createSolanaRpc(url);
export const rpcSubscriptions = createSolanaRpcSubscriptions(
  url.replace(/^http/, "ws").replace(":8899", ":8900")
);

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
export const agentsDir = join(repoRoot, "docs", "agents");

export const wallet = async (name: WalletName): Promise<KeyPairSigner> =>
  createKeyPairSignerFromBytes(
    Uint8Array.from(
      JSON.parse(readFileSync(join(keysDir, `${name}.json`), "utf8"))
    )
  );

export const wallets = async () => {
  const signers = await Promise.all(WALLETS.map(wallet));
  return Object.fromEntries(
    WALLETS.map((name, index) => [name, signers[index]])
  ) as Record<WalletName, KeyPairSigner>;
};

export const send = async (
  step: string,
  feePayer: KeyPairSigner,
  instructions: Instruction[]
) => {
  const started = Date.now();
  const signature = await sendInstructions({
    feePayer,
    instructions,
    rpc,
    rpcSubscriptions,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `  ${step.padEnd(30)} ${seconds}s ${explorerTx(signature, cluster)}`
  );
  return signature;
};

export const sol = (lamports: bigint) => (Number(lamports) / 1e9).toFixed(4);
