import { execFileSync } from "node:child_process";
import { address } from "@solana/kit";
import { DEMO_WITNESS_NODES, PACT_PROGRAM_ID } from "../packages/sdk/src";
import { PROD_HOST, PROD_URL, rpc, sol } from "./demo-common";

const NODES = ["witness1", "witness2", "witness3"];
const MIN_NODE_LAMPORTS = 20_000_000n;
const STALE_SECONDS = 120;

let failures = 0;
const report = (ok: boolean, what: string, detail: string) => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${what.padEnd(26)} ${detail}`);
};

const timed = async <T>(work: () => Promise<T>) => {
  const started = Date.now();
  const value = await work();
  return { ms: Date.now() - started, value };
};

const http = async (path: string) => {
  try {
    const { ms, value } = await timed(() =>
      fetch(`${PROD_URL}${path}`, { redirect: "manual" })
    );
    return { ms, status: value.status };
  } catch (error) {
    return { error: String(error), ms: 0, status: 0 };
  }
};

const site = await http("/");
report(
  site.status === 200,
  "web",
  `${PROD_URL}/ ${site.status} in ${site.ms} ms`
);
const deals = await http("/deals");
report(deals.status === 200, "deal list route", `/deals ${deals.status}`);
const api = await http("/api/health");
report(
  api.status === 200,
  "ai service",
  `/api/health ${api.status} in ${api.ms} ms`
);
const page = await http("/proof/delivery.html");
report(
  page.status === 200 || page.status === 404,
  "demo page container",
  `/proof/delivery.html ${page.status}${page.status === 404 ? " (empty, nothing delivered yet)" : ""}`
);

try {
  const { ms, value } = await timed(() => rpc.getSlot().send());
  report(true, "devnet rpc", `slot ${value} in ${ms} ms`);
  const program = await rpc
    .getAccountInfo(PACT_PROGRAM_ID, { encoding: "base64" })
    .send();
  report(
    program.value?.executable === true,
    "pact program",
    `${PACT_PROGRAM_ID} ${program.value?.executable ? "deployed" : "missing"}`
  );
} catch (error) {
  report(false, "devnet rpc", String(error));
}

const remote = (command: string) => {
  try {
    return execFileSync("ssh", [PROD_HOST, command], {
      encoding: "utf8",
      timeout: 20_000,
    });
  } catch (error) {
    return `ssh failed: ${String(error)}`;
  }
};

const states = remote(
  `cd /root/superteam && docker compose ps --format '{{.Service}} {{.State}} {{.RunningFor}}' ${NODES.join(" ")} demo-page`
);
for (const service of [...NODES, "demo-page"]) {
  const row = states.split("\n").find((line) => line.startsWith(`${service} `));
  report(
    Boolean(row?.includes(" running ")),
    `container ${service}`,
    row ?? "not found"
  );
}

const logs = remote(
  `cd /root/superteam && docker compose logs --no-log-prefix --since ${STALE_SECONDS}s ${NODES.join(" ")} | grep -c 'scan failed' || true`
);
const failedScans = Number.parseInt(logs.trim(), 10) || 0;
report(
  failedScans === 0,
  "node scans",
  `${failedScans} failed scans in the last ${STALE_SECONDS} s`
);

const balances = await Promise.all(
  DEMO_WITNESS_NODES.witnesses.map((key) => rpc.getBalance(address(key)).send())
);
for (const [index, key] of DEMO_WITNESS_NODES.witnesses.entries()) {
  const lamports = BigInt(balances[index]?.value ?? 0n);
  report(
    lamports >= MIN_NODE_LAMPORTS,
    `node key ${NODES[index]}`,
    `${key} ${sol(lamports)} SOL for vote fees`
  );
}

console.log(
  failures === 0
    ? "\npreflight green: run make demo-wallets for the wallets, make demo-deals-status for the deals"
    : `\n${failures} check(s) failed, see docs/agents/handoff/demo-ops.md`
);
process.exit(failures === 0 ? 0 : 1);
