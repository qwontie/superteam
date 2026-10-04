import { describe, expect, test } from "bun:test";
import {
  describeCheckFact,
  describeFact,
  FactError,
  factError,
  formatFact,
  parseFact,
  readFact,
  wikidataClaimsUrl,
} from "../src/facts";

const API = "https://api.example.com/jobs/7";

const ROUND_TRIP: [string, string][] = [
  ["https://pact.qwontie.dev/proof/delivery.html", "oracle 209993"],
  [`${API}#status`, "=done"],
  [`${API}#data.items[0].state`, "~ship"],
  [`${API}#[2].price`, ">10.5"],
  [`${API}#count`, "<3"],
  ["price:SOL-USD", ">200"],
  ["price:BTC-USD", "<50000"],
  ["wikidata:Q22686/P570", "exists"],
  ["wikidata:Q9696/P27", "=Q30"],
  ["wikidata:Q90/P1082", ">1000000"],
];

const fetcher =
  (pages: Record<string, string>) =>
  (url: string): Promise<string> => {
    const body = pages[url];
    return body === undefined
      ? Promise.reject(new Error(`HTTP 404 ${url}`))
      : Promise.resolve(body);
  };

const COINBASE = "https://api.coinbase.com/v2/prices/SOL-USD/spot";
const KRAKEN = "https://api.kraken.com/0/public/Ticker?pair=SOLUSD";
const BITSTAMP = "https://www.bitstamp.net/api/v2/ticker/solusd/";

const prices = (coinbase: string, kraken: string, bitstamp: string) => ({
  [BITSTAMP]: JSON.stringify({ last: bitstamp }),
  [COINBASE]: JSON.stringify({ data: { amount: coinbase } }),
  [KRAKEN]: JSON.stringify({ result: { SOLUSD: { c: [kraken, "1.0"] } } }),
});

describe("facts", () => {
  test("two strings round trip through the definition", () => {
    for (const [target, expectText] of ROUND_TRIP) {
      expect(formatFact(parseFact(target, expectText))).toEqual({
        expect: expectText,
        target,
      });
    }
  });

  test("a plain URL stays an old page check", () => {
    expect(parseFact("https://a.b/c", "=done")).toEqual({
      predicate: { op: "contains", value: "=done" },
      source: { type: "page", url: "https://a.b/c" },
    });
  });

  test("reads sources and predicates", () => {
    expect(parseFact(`${API}#data.items[0].state`, "=done")).toEqual({
      predicate: { op: "equals", value: "done" },
      source: { path: "data.items[0].state", type: "json", url: API },
    });
    expect(parseFact("price:ETH-USD", "<1500")).toEqual({
      predicate: { op: "below", value: "1500" },
      source: { pair: "ETH-USD", type: "price" },
    });
    expect(parseFact("wikidata:Q22686/P570", "exists")).toEqual({
      predicate: { op: "exists" },
      source: { entity: "Q22686", property: "P570", type: "wikidata" },
    });
  });

  test("refuses what the job cannot express, with a readable reason", () => {
    const refused: [string, string, string][] = [
      ["price:DOGE-USD", ">1", "unknown price pair"],
      ["price:SOL-USD", "=200", "only be checked with > or <"],
      ["price:SOL-USD", ">two hundred", "plain number"],
      ["price:SOL-USD", ">1e3", "plain number"],
      ["wikidata:Q22686", "exists", "wikidata:Q42/P570"],
      ["wikidata:Q1/P27", "=United States", "item"],
      ["wikidata:Q1/P27", "~x", "exists, =Q.., > or <"],
      [`${API}#a.b`, "exists", "=, >, < or ~"],
      [`${API}#a b`, "=1", "JSON path"],
      [`${API}#`, "=1", "JSON path"],
      [`${API}#a`, "done", "exists, =value"],
      [`${API}#a`, "=", "has no value"],
      ["http://example.com", "x", "https://"],
      ["ftp://example.com", "x", "https://"],
      [API, "", "empty"],
    ];
    for (const [target, wanted, reason] of refused) {
      expect(() => parseFact(target, wanted)).toThrow(FactError);
      expect(factError(target, wanted)).toContain(reason);
    }
  });

  test("keeps the on-chain limits", () => {
    const longest = `https://a.co/${"x".repeat(128 - 13)}`;
    expect(new TextEncoder().encode(longest).length).toBe(128);
    expect(factError(longest, "x")).toBeNull();
    expect(factError(`${longest}y`, "x")).toContain("128 bytes");
    expect(factError(API, "x".repeat(64))).toBeNull();
    expect(factError(API, "x".repeat(65))).toContain("64 bytes");
    expect(factError(API, "é".repeat(33))).toContain("64 bytes");
  });

  test("says in one line what is checked", () => {
    const lines: [string, string, string, string?][] = [
      ["price:SOL-USD", ">200", "SOL price is above 200 USD"],
      ["price:BTC-USD", "<50000", "BTC price is below 50000 USD"],
      [
        "wikidata:Q22686/P570",
        "exists",
        "Wikidata: Donald Trump has a date of death",
        "Donald Trump",
      ],
      [
        "wikidata:Q22686/P570",
        "exists",
        "Wikidata: Q22686 has a date of death",
      ],
      ["wikidata:Q1/P9999", "exists", "Wikidata: Q1 has a value for P9999"],
      [
        "wikidata:Q90/P1082",
        ">1000000",
        "Wikidata: Paris population is above 1000000",
        "Paris",
      ],
      [
        "wikidata:Q9696/P27",
        "=Q30",
        "Wikidata: Q9696 country of citizenship equals Q30",
      ],
      [`${API}#status`, "=done", "api.example.com: status equals done"],
      [`${API}#log`, "~shipped", 'api.example.com: log contains "shipped"'],
      [
        "https://pact.qwontie.dev/proof/delivery.html",
        "oracle 1",
        'pact.qwontie.dev: page contains "oracle 1"',
      ],
    ];
    for (const [target, wanted, line, label] of lines) {
      expect(describeFact(parseFact(target, wanted), { label })).toBe(line);
    }
    expect(describeCheckFact("price:DOGE-USD", ">1")).toBe(
      "price:DOGE-USD: >1"
    );
  });
});

describe("reading a fact", () => {
  test("API value with each predicate", async () => {
    const fetchText = fetcher({
      [API]: JSON.stringify({
        count: 2,
        data: { items: [{ state: "shipped today" }] },
        ok: true,
        price: "10.50",
        status: "done",
      }),
    });
    const read = (path: string, wanted: string) =>
      readFact(parseFact(`${API}#${path}`, wanted), fetchText);
    expect((await read("status", "=done")).holds).toBe(true);
    expect((await read("status", "=Done")).holds).toBe(false);
    expect((await read("count", "=2")).holds).toBe(true);
    expect((await read("ok", "=true")).holds).toBe(true);
    expect((await read("price", ">10")).holds).toBe(true);
    expect((await read("price", "<10")).holds).toBe(false);
    expect((await read("data.items[0].state", "~shipped")).holds).toBe(true);
    expect(await read("missing", "=done")).toEqual({
      holds: false,
      observed: "no value at missing",
    });
    await expect(read("status", ">1")).rejects.toThrow("not a number");
  });

  test("price is the median of the venues that answered", async () => {
    const fact = parseFact("price:SOL-USD", ">200");
    expect(await readFact(fact, fetcher(prices("210", "190", "205")))).toEqual({
      holds: true,
      observed: "205",
    });
    expect(
      (
        await readFact(
          parseFact("price:SOL-USD", "<200"),
          fetcher(prices("120", "119.9", "500"))
        )
      ).holds
    ).toBe(true);
    const twoVenues = prices("201", "203", "1");
    delete (twoVenues as Record<string, string>)[BITSTAMP];
    expect(await readFact(fact, fetcher(twoVenues))).toEqual({
      holds: true,
      observed: "202",
    });
    await expect(
      readFact(
        fact,
        fetcher({ [COINBASE]: JSON.stringify({ data: { amount: "300" } }) })
      )
    ).rejects.toThrow("only 1 of 3");
  });

  test("Wikidata exists, item and quantity", async () => {
    const dead = JSON.stringify({
      claims: {
        P570: [
          {
            mainsnak: {
              datavalue: { value: { time: "+1963-11-22T00:00:00Z" } },
            },
          },
        ],
      },
    });
    const fetchText = fetcher({
      [wikidataClaimsUrl("Q22686", "P570")]: '{"claims":{}}',
      [wikidataClaimsUrl("Q9696", "P27")]: JSON.stringify({
        claims: {
          P27: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }],
        },
      }),
      [wikidataClaimsUrl("Q9696", "P570")]: dead,
      [wikidataClaimsUrl("Q90", "P1082")]: JSON.stringify({
        claims: {
          P1082: [
            { mainsnak: { datavalue: { value: { amount: "+2145906" } } } },
          ],
        },
      }),
    });
    const read = (target: string, wanted: string) =>
      readFact(parseFact(target, wanted), fetchText);
    expect((await read("wikidata:Q9696/P570", "exists")).holds).toBe(true);
    expect(await read("wikidata:Q22686/P570", "exists")).toEqual({
      holds: false,
      observed: "no value",
    });
    expect((await read("wikidata:Q9696/P27", "=Q30")).holds).toBe(true);
    expect((await read("wikidata:Q9696/P27", "=Q31")).holds).toBe(false);
    expect((await read("wikidata:Q90/P1082", ">1000000")).holds).toBe(true);
    expect((await read("wikidata:Q90/P1082", "<1000000")).holds).toBe(false);
  });

  test("page contains", async () => {
    const fetchText = fetcher({ "https://a.co/p": "<h1>oracle 7</h1>" });
    expect(
      (await readFact(parseFact("https://a.co/p", "oracle 7"), fetchText)).holds
    ).toBe(true);
    expect(
      (await readFact(parseFact("https://a.co/p", "oracle 8"), fetchText)).holds
    ).toBe(false);
  });
});
