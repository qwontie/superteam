import { describe, expect, test } from "bun:test";
import { type DealState, gig, votesFromBitmaps } from "@pact/sdk";
import { gateFeedFor } from "@pact/sdk/gate-feed";
import { generateKeyPairSigner } from "@solana/kit";
import { createGateCrank, gateChecksOf, gatePlan } from "../src/gate-crank";

const CLIENT = "8aBswR9arwLWu7YnG94Qswv7yfNfL6vahzrNqi898QbX";
const FREELANCER = "3iKMsEWGThBcMqviN4FCsqj3um9TacshQXXZCnjcG8YM";
const NODE = "3LsndN1YHY4stDPH3Mzm3SMG86tEe2ifseCohiiB7XgY";
const URL = "https://pact.qwontie.dev/proof/delivery.html";
const MARKER = "oracle 123456";
const DEADLINE = 1_790_000_000;

const deal = async (
  witness: "gate" | "node",
  yes = 0,
  status: DealState["status"] = "funded",
  fact: [string, string] = [URL, MARKER]
): Promise<DealState> => {
  const [target, wanted] = fact;
  const { gateAddress } = await gateFeedFor(target, wanted);
  const spec = gig({
    amount: 10_000_000n,
    check: {
      expect: wanted,
      kind: "http_contains",
      target,
      threshold: 1,
      witnesses: [witness === "gate" ? gateAddress : NODE],
    },
    client: CLIENT,
    deadline: DEADLINE,
    freelancer: FREELANCER,
    title: "Gate",
  });
  return {
    address: "11111111111111111111111111111111",
    creator: CLIENT,
    dealId: 1n,
    lamports: BigInt(spec.amount),
    settledRule: null,
    signals: spec.parties.map(() => null),
    spec,
    status,
    votes: spec.checks.map((check) =>
      votesFromBitmaps(yes, 0, check.witnesses.length, [])
    ),
  };
};

const NOW = DEADLINE - 600;

describe("gate crank plan", () => {
  test("finds the gate check by its own target and expect", async () => {
    expect(await gateChecksOf(await deal("gate"))).toEqual([0]);
    expect(await gateChecksOf(await deal("node"))).toEqual([]);
  });

  test("finds gate checks of any fact", async () => {
    for (const fact of [
      ["price:SOL-USD", ">200"],
      ["wikidata:Q22686/P570", "exists"],
      ["https://api.example.com/job#status", "=done"],
    ] as [string, string][]) {
      // biome-ignore lint/performance/noAwaitInLoops: a handful of hashes
      expect(await gateChecksOf(await deal("gate", 0, "funded", fact))).toEqual(
        [0]
      );
    }
  });

  test("confirms an open gate check, nothing to execute yet", async () => {
    expect(gatePlan(await deal("gate"), [0], NOW)).toEqual({
      confirm: [0],
      rule: null,
    });
  });

  test("executes the rule a confirmed gate check unlocks", async () => {
    expect(gatePlan(await deal("gate", 1), [0], NOW)).toEqual({
      confirm: [],
      rule: 0,
    });
  });

  test("leaves the exit rule to the parties and settled deals alone", async () => {
    expect(gatePlan(await deal("gate", 0), [0], DEADLINE + 1).rule).toBeNull();
    expect(gatePlan(await deal("gate", 1, "settled"), [0], NOW)).toEqual({
      confirm: [],
      rule: null,
    });
  });
});

describe("gate crank", () => {
  test("waits quietly while the oracles return no quote", async () => {
    const lines: string[] = [];
    const stored: string[] = [];
    let quotes = 0;
    const crank = createGateCrank({
      cluster: "devnet",
      fetchQuote: () => {
        quotes += 1;
        return Promise.reject(
          new Error("Gateway.fetchQuote failed (status 500)")
        );
      },
      log: (line) => lines.push(line),
      now: () => NOW * 1000,
      rpc: {} as never,
      rpcSubscriptions: {} as never,
      signer: await generateKeyPairSigner(),
      storeFeed: (url, text) => {
        stored.push(`${url} ${text}`);
        return Promise.resolve();
      },
    });
    const deals = [await deal("gate"), await deal("node")];
    const refresh = () => Promise.resolve(null);
    const first = await crank.runOnce(deals, refresh);
    const second = await crank.runOnce(deals, refresh);
    expect(first).toEqual({ confirmations: [], executions: [], gates: 1 });
    expect(second.confirmations).toEqual([]);
    expect(quotes).toBe(2);
    expect(stored).toEqual([`${URL} ${MARKER}`]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("oracles do not see it yet");
  });

  test("retries the Crossbar store until it works", async () => {
    const lines: string[] = [];
    let stores = 0;
    const crank = createGateCrank({
      cluster: "devnet",
      fetchQuote: () => Promise.reject(new Error("no quote")),
      log: (line) => lines.push(line),
      rpc: {} as never,
      rpcSubscriptions: {} as never,
      signer: await generateKeyPairSigner(),
      storeFeed: () => {
        stores += 1;
        return stores === 1
          ? Promise.reject(new Error("Crossbar down"))
          : Promise.resolve();
      },
    });
    const deals = [await deal("gate")];
    await crank.runOnce(deals, () => Promise.resolve(null));
    await crank.runOnce(deals, () => Promise.resolve(null));
    await crank.runOnce(deals, () => Promise.resolve(null));
    expect(stores).toBe(2);
    expect(lines[0]).toContain("job not stored: Crossbar down");
    expect(lines[1]).toContain("oracles do not see it yet");
  });
});
