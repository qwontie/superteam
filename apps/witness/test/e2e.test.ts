import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  fetchDeal,
  getCreateDealInstruction,
  getFundInstruction,
  gig,
  newDealId,
  PACT_PROGRAM_ID,
  sendInstructions,
} from "@pact/sdk";
import {
  type Address,
  airdropFactory,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  generateKeyPairSigner,
  type KeyPairSigner,
  lamports,
} from "@solana/kit";
import { type Server, type Subprocess, serve, sleep, spawn, which } from "bun";
import { createGithub } from "../src/github";
import {
  createPageFetcher,
  DEFAULT_POLICY,
  type FetchPolicy,
} from "../src/guarded-fetch";
import { createNode, createVerifiers, type PassSummary } from "../src/node";

const ROOT = join(import.meta.dir, "..", "..", "..");
const PROGRAM_SO = join(ROOT, "target", "deploy", "pact.so");
const VALIDATOR =
  which("solana-test-validator") ??
  join(
    homedir(),
    ".local/share/solana/install/active_release/bin/solana-test-validator"
  );
const RPC_PORT = 18_899;
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;
const WS_URL = `ws://127.0.0.1:${RPC_PORT + 1}`;
const AMOUNT = 10_000_000n;
const MARKER = "pact-e2e-delivered";
const ready = existsSync(PROGRAM_SO) && existsSync(VALIDATOR);

const LOCAL_POLICY: FetchPolicy = {
  ...DEFAULT_POLICY,
  allowHttp: true,
  allowPrivate: true,
};

const rpc = createSolanaRpc(RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);

const waitForValidator = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: polling until the validator answers
    const health = await rpc
      .getHealth()
      .send()
      .catch(() => null);
    if (health === "ok") {
      return;
    }
    await sleep(500);
  }
  throw new Error("local validator did not start");
};

describe.skipIf(!ready)("witness nodes on a local validator", () => {
  let validator: Subprocess;
  let ledger = "";
  let server: Server<unknown>;
  let delivered = false;

  beforeAll(async () => {
    ledger = mkdtempSync(join(tmpdir(), "pact-witness-e2e-"));
    validator = spawn(
      [
        VALIDATOR,
        "--reset",
        "--quiet",
        "--ledger",
        ledger,
        "--bind-address",
        "127.0.0.1",
        "--rpc-port",
        String(RPC_PORT),
        "--faucet-port",
        "19900",
        "--gossip-port",
        "18001",
        "--dynamic-port-range",
        "18002-18040",
        "--bpf-program",
        PACT_PROGRAM_ID,
        PROGRAM_SO,
      ],
      { stderr: "ignore", stdout: "ignore" }
    );
    server = serve({
      fetch: () =>
        new Response(
          delivered
            ? `<html><body>Landing page. ${MARKER}</body></html>`
            : "<html><body>Coming soon</body></html>"
        ),
      hostname: "127.0.0.1",
      port: 0,
    });
    await waitForValidator();
  }, 90_000);

  afterAll(() => {
    server?.stop(true);
    validator?.kill();
    rmSync(ledger, { force: true, recursive: true });
  });

  test("two of three nodes attest and a node executes the payout", async () => {
    const airdrop = airdropFactory({ rpc, rpcSubscriptions });
    const [client, freelancer, ...witnesses] = (await Promise.all(
      Array.from({ length: 5 }, () => generateKeyPairSigner())
    )) as [KeyPairSigner, KeyPairSigner, ...KeyPairSigner[]];
    const [first, second] = witnesses as [KeyPairSigner, KeyPairSigner];
    await Promise.all(
      [client, first, second].map((signer) =>
        airdrop({
          commitment: "confirmed",
          lamports: lamports(1_000_000_000n),
          recipientAddress: signer.address,
        })
      )
    );

    const target = `http://127.0.0.1:${server.port}/delivery`;
    const spec = gig({
      amount: AMOUNT,
      check: {
        expect: MARKER,
        kind: "http_contains",
        target,
        threshold: 2,
        witnesses: witnesses.map((signer) => signer.address),
      },
      client: client.address,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      freelancer: freelancer.address,
      title: "Witness e2e",
    });
    const create = await getCreateDealInstruction({
      creator: client,
      dealId: newDealId(),
      spec,
    });
    await sendInstructions({
      feePayer: client,
      instructions: [
        create,
        getFundInstruction({ deal: create.deal, funder: client }),
      ],
      rpc,
      rpcSubscriptions,
    });

    const logs: string[] = [];
    const verifiers = createVerifiers({
      fetchPage: createPageFetcher(LOCAL_POLICY),
      github: createGithub({}),
      policy: LOCAL_POLICY,
    });
    const nodeFor = (signer: KeyPairSigner) =>
      createNode({
        autoExecute: true,
        cluster: "localnet",
        githubIntervalMs: 0,
        log: (line) => logs.push(line),
        rpc,
        rpcSubscriptions,
        signer,
        verifiers,
      });
    const firstNode = nodeFor(first);
    const nodes = [firstNode, nodeFor(second)];
    const tally = async (deal: Address) => {
      const state = await fetchDeal(rpc, deal);
      return { state, votes: state?.votes[0] };
    };

    for (const node of nodes) {
      // biome-ignore lint/performance/noAwaitInLoops: nodes vote one after another
      const pass = await node.runOnce();
      expect(pass.pending).toBe(1);
      expect(pass.votes).toEqual([]);
    }
    expect((await tally(create.deal)).votes?.yes).toBe(0);
    expect(logs.filter((line) => line.includes(" wait ")).length).toBe(2);

    delivered = true;
    const passes: PassSummary[] = [];
    for (const node of nodes) {
      // biome-ignore lint/performance/noAwaitInLoops: nodes vote one after another
      passes.push(await node.runOnce());
    }
    expect(passes.map((pass) => pass.votes.length)).toEqual([1, 1]);
    expect(passes.map((pass) => pass.executions.length)).toEqual([0, 1]);
    expect(passes[1]?.votes[0]).toContain("explorer.solana.com/tx/");

    const { state, votes } = await tally(create.deal);
    expect(votes?.byWitness).toEqual(["yes", "yes", null]);
    expect(state?.status).toBe("settled");
    expect(state?.settledRule).toBe(0);

    const idle = await firstNode.runOnce();
    expect(idle.pending).toBe(0);
    expect(idle.executions).toEqual([]);

    const { value: paid } = await rpc
      .getBalance(freelancer.address, { commitment: "confirmed" })
      .send();
    expect(paid).toBe(lamports(AMOUNT));
    expect(
      logs.some((line) => line.includes(` yes  deal=${create.deal}`))
    ).toBe(true);
    expect(
      logs.some((line) => line.includes(` exec deal=${create.deal} rule=0`))
    ).toBe(true);
  }, 120_000);
});
