import { generateKeyPairSync } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Cluster } from "@pact/sdk";
import { GATE_CROSSBAR_URL } from "@pact/sdk/gate-feed";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import { spawnSync } from "bun";

export const PUBLIC_DEVNET = "https://api.devnet.solana.com";
export const MIN_POLL_SECONDS = 20;
const DEFAULT_POLL_SECONDS = 30;
const DEFAULT_KEYPAIR = join(homedir(), ".config", "pact", "witness.json");
const QUOTES = /^["']|["']$/g;
const HTTP_SCHEME = /^http/;

export interface Config {
  autoExecute: boolean;
  cluster: Cluster;
  crossbarUrl: string;
  gateCrank: boolean;
  githubToken?: string;
  keypairPath: string;
  pollSeconds: number;
  rpcSource: string;
  rpcUrl: string;
  wsUrl: string;
}

const git = (...args: string[]) => {
  try {
    const result = spawnSync(["git", "rev-parse", ...args], {
      stderr: "ignore",
    });
    return result.exitCode === 0 ? result.stdout.toString().trim() : null;
  } catch {
    return null;
  }
};

const mainCheckoutEnv = () => {
  const commonDir = git("--path-format=absolute", "--git-common-dir");
  const file = commonDir ? join(dirname(commonDir), ".env") : null;
  if (!(file && existsSync(file))) {
    return null;
  }
  const value = readFileSync(file, "utf8")
    .split("\n")
    .find((row) => row.startsWith("RPC_URL="))
    ?.slice("RPC_URL=".length)
    .trim()
    .replace(QUOTES, "");
  return value || null;
};

const clusterOf = (url: string): Cluster =>
  url.includes("localhost") || url.includes("127.0.0.1")
    ? "localnet"
    : "devnet";

export const wsUrlFor = (rpcUrl: string) =>
  rpcUrl.replace(HTTP_SCHEME, "ws").replace(":8899", ":8900");

export const rpcHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "invalid URL";
  }
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const fromEnv = env.RPC_URL?.trim();
  const fromCheckout = fromEnv ? null : mainCheckoutEnv();
  const rpcUrl = fromEnv || fromCheckout || PUBLIC_DEVNET;
  let rpcSource = "public devnet, rate limited";
  if (fromEnv) {
    rpcSource = "RPC_URL";
  } else if (fromCheckout) {
    rpcSource = "RPC_URL in the main checkout .env";
  }
  const requested = Number(env.POLL_SECONDS ?? DEFAULT_POLL_SECONDS);
  const pollSeconds = Number.isFinite(requested)
    ? Math.max(MIN_POLL_SECONDS, requested)
    : DEFAULT_POLL_SECONDS;
  const base = git("--show-toplevel") ?? process.cwd();
  const keypair = env.WITNESS_KEYPAIR?.trim();
  const keypairPath = keypair ? resolve(base, keypair) : DEFAULT_KEYPAIR;
  return {
    autoExecute: env.AUTO_EXECUTE?.trim() !== "0",
    cluster: clusterOf(rpcUrl),
    crossbarUrl: env.GATE_CROSSBAR_URL?.trim() || GATE_CROSSBAR_URL,
    gateCrank: env.GATE_CRANK?.trim() === "1",
    githubToken: env.GITHUB_TOKEN?.trim() || undefined,
    keypairPath,
    pollSeconds,
    rpcSource,
    rpcUrl,
    wsUrl: env.RPC_WS_URL?.trim() || wsUrlFor(rpcUrl),
  };
};

const createKeypairFile = (path: string) => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const seed = Buffer.from(jwk.d ?? "", "base64url");
  const pub = Buffer.from(jwk.x ?? "", "base64url");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify([...seed, ...pub]), { mode: 0o600 });
  chmodSync(path, 0o600);
};

export const loadSigner = async (
  path: string
): Promise<{ created: boolean; signer: KeyPairSigner }> => {
  const created = !existsSync(path);
  if (created) {
    createKeypairFile(path);
  }
  const bytes = Uint8Array.from(
    JSON.parse(readFileSync(path, "utf8")) as number[]
  );
  return { created, signer: await createKeyPairSignerFromBytes(bytes) };
};
