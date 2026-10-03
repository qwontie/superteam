import { describe, expect, test } from "bun:test";
import { address } from "@solana/kit";
import { FeedHash, OracleFeedUtils } from "@switchboard-xyz/common";
import { findGateAddress } from "../src";
import {
  encodeGateFeed,
  gateFeedDefinition,
  gateFeedFor,
  isGateCheck,
} from "../src/gate-feed";

const URL = "https://pact.qwontie.dev/proof/delivery.html";
const CASES: [string, string, number][] = [
  [URL, "oracle 209993", 3],
  [URL, "Delivery page", 1],
  ["https://example.com/a?b=c&d=é", "price: $1.00 (final) [ok] ünïcode", 3],
  [URL, "x".repeat(200), 5],
];

describe("gate feed", () => {
  test("encodes exactly like the Switchboard library", () => {
    for (const [url, text, oracles] of CASES) {
      const feed = gateFeedDefinition(url, text, oracles);
      expect(Buffer.from(encodeGateFeed(feed))).toEqual(
        Buffer.from(OracleFeedUtils.serializeOracleFeed(feed as never))
      );
    }
  });

  test("hashes like the Switchboard library and the live gate deal", async () => {
    const hashes = await Promise.all(
      CASES.map(([url, text, oracles]) => gateFeedFor(url, text, oracles))
    );
    hashes.forEach(({ feedHash }, index) => {
      const [url, text, oracles] = CASES[index] ?? CASES[0];
      const expected = FeedHash.computeOracleFeedId(
        gateFeedDefinition(url, text, oracles) as never
      ).toString("hex");
      expect(feedHash).toBe(`0x${expected}`);
    });
    const live = await gateFeedFor(URL, "oracle 209993");
    expect(live.feedHash).toBe(
      "0x35673ad51a13a1ed725cacb36584a6b31de0436260448b3af3046bf3d90eb2f9"
    );
    expect(live.gateAddress).toBe(await findGateAddress(live.feedHash));
    expect(live.gateAddress).toBe(
      address("H9vJB6ES14kyf1iPvY1KVYAXensZ8GmSLCBua9jRXkjd")
    );
  });

  test("recognises a gate check by its own target and expect", async () => {
    const { gateAddress } = await gateFeedFor(URL, "oracle 209993");
    const check = {
      expect: "oracle 209993",
      kind: "http_contains",
      target: URL,
      threshold: 1,
      witnesses: [gateAddress],
    };
    expect(await isGateCheck(check)).toBe(true);
    expect(await isGateCheck({ ...check, expect: "oracle 209994" })).toBe(
      false
    );
    expect(await isGateCheck({ ...check, threshold: 2 })).toBe(false);
    expect(await isGateCheck({ ...check, kind: "manual" })).toBe(false);
    expect(
      await isGateCheck({ ...check, witnesses: [gateAddress, gateAddress] })
    ).toBe(false);
  });
});
