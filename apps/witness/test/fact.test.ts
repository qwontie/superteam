import { describe, expect, test } from "bun:test";
import { wikidataClaimsUrl } from "@pact/sdk/facts";
import type { PageFetcher } from "../src/guarded-fetch";
import { verifyHttpContains } from "../src/kinds/http-contains";
import { fixtureText, page } from "./helpers";

const COINBASE = "https://api.coinbase.com/v2/prices/SOL-USD/spot";
const KRAKEN = "https://api.kraken.com/0/public/Ticker?pair=SOLUSD";
const BITSTAMP = "https://www.bitstamp.net/api/v2/ticker/solusd/";

const recorded: Record<string, string> = {
  [BITSTAMP]: fixtureText("bitstamp-sol-usd.json"),
  [COINBASE]: fixtureText("coinbase-sol-usd.json"),
  [KRAKEN]: fixtureText("kraken-sol-usd.json"),
  [wikidataClaimsUrl("Q22686", "P570")]: fixtureText(
    "wikidata-q22686-p570.json"
  ),
  [wikidataClaimsUrl("Q9696", "P570")]: fixtureText("wikidata-q9696-p570.json"),
};

const fetchRecorded = (
  overrides: Record<string, number> = {}
): PageFetcher & { calls: string[] } => {
  const calls: string[] = [];
  const fetchPage = (url: string) => {
    calls.push(url);
    const body = recorded[url];
    if (body === undefined) {
      return Promise.reject(new Error(`no fixture for ${url}`));
    }
    return Promise.resolve(page(body, { status: overrides[url] ?? 200, url }));
  };
  return Object.assign(fetchPage, { calls });
};

const verify = (target: string, wanted: string, fetchPage = fetchRecorded()) =>
  verifyHttpContains(target, wanted, fetchPage);

describe("facts on recorded sources", () => {
  test("Wikidata: a person with a date of death", async () => {
    const verdict = await verify("wikidata:Q9696/P570", "exists");
    expect(verdict.kind).toBe("yes");
    expect(verdict.evidence).toContain("Wikidata: Q9696 has a date of death");
    expect(verdict.evidence).toContain("wbgetclaims");
  });

  test("Wikidata: no date of death means wait, never no", async () => {
    const verdict = await verify("wikidata:Q22686/P570", "exists");
    expect(verdict.kind).toBe("wait");
    expect(verdict.evidence).toContain("no value");
  });

  test("price above and below the recorded median", async () => {
    expect((await verify("price:SOL-USD", ">100")).kind).toBe("yes");
    expect((await verify("price:SOL-USD", ">500")).kind).toBe("wait");
    expect((await verify("price:SOL-USD", "<500")).kind).toBe("yes");
    const fetchPage = fetchRecorded();
    await verify("price:SOL-USD", ">100", fetchPage);
    expect(fetchPage.calls.sort()).toEqual([BITSTAMP, COINBASE, KRAKEN].sort());
  });

  test("price still reads with one venue down, waits with two down", async () => {
    expect(
      (await verify("price:SOL-USD", ">100", fetchRecorded({ [KRAKEN]: 503 })))
        .kind
    ).toBe("yes");
    const verdict = await verify(
      "price:SOL-USD",
      ">100",
      fetchRecorded({ [BITSTAMP]: 503, [KRAKEN]: 429 })
    );
    expect(verdict.kind).toBe("wait");
    expect(verdict.evidence).toContain("only 1 of 3");
  });

  test("API value through the JSON path", async () => {
    expect((await verify(`${COINBASE}#data.base`, "=SOL")).kind).toBe("yes");
    expect((await verify(`${COINBASE}#data.base`, "=BTC")).kind).toBe("wait");
    expect((await verify(`${COINBASE}#data.amount`, ">1")).kind).toBe("yes");
    expect((await verify(`${KRAKEN}#result.SOLUSD.c[0]`, ">1")).kind).toBe(
      "yes"
    );
  });

  test("a fact that cannot be a job is refused", async () => {
    const verdict = await verify("price:DOGE-USD", ">1");
    expect(verdict.kind).toBe("no");
    expect(verdict.evidence).toContain("unknown price pair");
  });

  test("the guard still applies to fact sources", async () => {
    const fetchPage = fetchRecorded();
    const verdict = await verify("https://127.0.0.1/x#a", "=1", fetchPage);
    expect(verdict.kind).toBe("wait");
    expect(verdict.evidence).toContain("private or reserved");
    expect(fetchPage.calls).toEqual([]);
  });
});
