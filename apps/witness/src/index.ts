import { lamportsToSol, PACT_PROGRAM_ID } from "@pact/sdk";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { sleep } from "bun";
import { loadConfig, loadSigner, rpcHost } from "./config";
import { createGithub } from "./github";
import { createPageFetcher, DEFAULT_POLICY } from "./guarded-fetch";
import { createNode, createVerifiers } from "./node";
import { reason } from "./verdict";

const MAX_BACKOFF_MS = 300_000;
const GITHUB_ANONYMOUS_INTERVAL_MS = 120_000;

const config = loadConfig();
const { created, signer } = await loadSigner(config.keypairPath);
const rpc = createSolanaRpc(config.rpcUrl);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.wsUrl);
const verifiers = createVerifiers({
  fetchPage: createPageFetcher(DEFAULT_POLICY),
  github: createGithub({ token: config.githubToken }),
  policy: DEFAULT_POLICY,
});
const pollMs = config.pollSeconds * 1000;
const githubIntervalMs = config.githubToken
  ? pollMs
  : Math.max(pollMs, GITHUB_ANONYMOUS_INTERVAL_MS);

const redact = (text: string) =>
  text
    .replaceAll(config.rpcUrl, rpcHost(config.rpcUrl))
    .replace(/api-key=[^&\s"']+/gi, "api-key=***");
const log = (text: string) => console.log(redact(text));
const say = (text: string) => log(`${new Date().toISOString()} ${text}`);

say(
  `pact witness ${signer.address}${created ? ` (new key written to ${config.keypairPath})` : ""}`
);
say(
  `program ${PACT_PROGRAM_ID} on ${config.cluster}, rpc ${rpcHost(config.rpcUrl)} (${config.rpcSource})`
);
say(
  `kinds ${Object.keys(verifiers).sort().join(", ")}; poll every ${config.pollSeconds} s; ${config.autoExecute ? "executes rules its checks unlock" : "votes only"}; GitHub ${config.githubToken ? "with token" : `anonymous, at most every ${githubIntervalMs / 1000} s per check`}`
);
try {
  const { value } = await rpc.getBalance(signer.address).send();
  say(
    `balance ${lamportsToSol(value)} SOL${value === 0n ? ", fund this key with a little SOL to pay vote fees" : ""}`
  );
} catch (error) {
  say(`balance unknown: ${reason(error)}`);
}

const node = createNode({
  autoExecute: config.autoExecute,
  cluster: config.cluster,
  githubIntervalMs,
  log,
  rpc,
  rpcSubscriptions,
  signer,
  verifiers,
});

let delay = pollMs;
let watching = "";
for (;;) {
  try {
    // biome-ignore lint/performance/noAwaitInLoops: the poll loop is sequential by design
    const pass = await node.runOnce();
    const status = `watching ${pass.pending} open checks that name this key, ${pass.deals} deals on chain`;
    if (status !== watching) {
      watching = status;
      say(status);
    }
    delay = pollMs;
  } catch (error) {
    delay = Math.min(delay * 2, MAX_BACKOFF_MS);
    say(`scan failed (${reason(error)}), next try in ${delay / 1000} s`);
  }
  await sleep(delay);
}
