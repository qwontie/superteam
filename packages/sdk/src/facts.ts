export const FACT_TARGET_BYTES = 128;
export const FACT_EXPECT_BYTES = 64;

export type FactSource =
  | { type: "page"; url: string }
  | { type: "json"; path: string; url: string }
  | { pair: PricePair; type: "price" }
  | { entity: string; property: string; type: "wikidata" };

export type FactPredicate =
  | { op: "contains"; value: string }
  | { op: "exists" }
  | { op: "equals"; value: string }
  | { op: "above"; value: string }
  | { op: "below"; value: string };

export interface Fact {
  predicate: FactPredicate;
  source: FactSource;
}

export interface PriceVenue {
  path: string;
  url: string;
}

export const PRICE_PAIRS = {
  "BTC-USD": [
    {
      path: "$.data.amount",
      url: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    },
    {
      path: "$.result.XXBTZUSD.c[0]",
      url: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
    },
    { path: "$.last", url: "https://www.bitstamp.net/api/v2/ticker/btcusd/" },
  ],
  "ETH-USD": [
    {
      path: "$.data.amount",
      url: "https://api.coinbase.com/v2/prices/ETH-USD/spot",
    },
    {
      path: "$.result.XETHZUSD.c[0]",
      url: "https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
    },
    { path: "$.last", url: "https://www.bitstamp.net/api/v2/ticker/ethusd/" },
  ],
  "SOL-USD": [
    {
      path: "$.data.amount",
      url: "https://api.coinbase.com/v2/prices/SOL-USD/spot",
    },
    {
      path: "$.result.SOLUSD.c[0]",
      url: "https://api.kraken.com/0/public/Ticker?pair=SOLUSD",
    },
    { path: "$.last", url: "https://www.bitstamp.net/api/v2/ticker/solusd/" },
  ],
} as const satisfies Record<string, readonly PriceVenue[]>;

export type PricePair = keyof typeof PRICE_PAIRS;

export const PRICE_MIN_VENUES = 2;

export const WIKIDATA_PROPERTIES: Record<string, string> = {
  P26: "spouse",
  P27: "country of citizenship",
  P39: "position held",
  P166: "award received",
  P569: "date of birth",
  P570: "date of death",
  P576: "dissolution date",
  P577: "publication date",
  P582: "end time",
  P1082: "population",
  P1128: "employee count",
  P1346: "winner",
};

export const WIKIDATA_USER_AGENT = "pact-gate/1.0 (https://pact.qwontie.dev)";
export const WIKIDATA_VALUE_MARKER = '"datavalue"';

export class FactError extends Error {
  override name = "FactError";
}

const PRICE_PREFIX = "price:";
const WIKIDATA_PREFIX = "wikidata:";
const WIKIDATA_TARGET = /^wikidata:(Q[1-9]\d*)\/(P[1-9]\d*)$/;
const WIKIDATA_ITEM = /^Q[1-9]\d*$/;
const JSON_PATH = /^(?:[\w-]+|\[\d+\])(?:\.[\w-]+|\[\d+\])*$/;
const PATH_STEP = /[^.[\]]+|\[(\d+)\]/g;
const NUMBER = /^-?\d+(\.\d+)?$/;
const RAW_JSON_WORDS = new Set(["true", "false", "null"]);
const OPS = {
  "<": "below",
  "=": "equals",
  ">": "above",
  "~": "contains",
} as const;

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

export const isNumberText = (value: string) => NUMBER.test(value);
export const isRawJsonWord = (value: string) => RAW_JSON_WORDS.has(value);

const parseSource = (target: string): FactSource => {
  if (target.startsWith(PRICE_PREFIX)) {
    const pair = target.slice(PRICE_PREFIX.length);
    if (!Object.hasOwn(PRICE_PAIRS, pair)) {
      throw new FactError(
        `unknown price pair ${pair}, use one of ${Object.keys(PRICE_PAIRS).join(", ")}`
      );
    }
    return { pair: pair as PricePair, type: "price" };
  }
  if (target.startsWith(WIKIDATA_PREFIX)) {
    const match = target.match(WIKIDATA_TARGET);
    if (!(match?.[1] && match[2])) {
      throw new FactError("wikidata target must look like wikidata:Q42/P570");
    }
    return { entity: match[1], property: match[2], type: "wikidata" };
  }
  if (!target.startsWith("https://")) {
    throw new FactError(
      "target must be an https:// URL, price:PAIR or wikidata:Q../P.."
    );
  }
  const hash = target.indexOf("#");
  if (hash === -1) {
    return { type: "page", url: target };
  }
  const url = target.slice(0, hash);
  const path = target.slice(hash + 1);
  if (!JSON_PATH.test(path)) {
    throw new FactError(
      "JSON path after # must be keys and [n] indexes, like data.items[0].state"
    );
  }
  return { path, type: "json", url };
};

const parsePredicate = (expect: string): FactPredicate => {
  if (expect === "exists") {
    return { op: "exists" };
  }
  const op = OPS[expect.charAt(0) as keyof typeof OPS];
  const value = expect.slice(1);
  if (!op) {
    throw new FactError(
      "expect must be exists, =value, >number, <number or ~text"
    );
  }
  if (value.length === 0) {
    throw new FactError(`expect ${expect} has no value`);
  }
  if ((op === "above" || op === "below") && !isNumberText(value)) {
    throw new FactError(
      `${expect.charAt(0)} needs a plain number, like 200 or 0.5`
    );
  }
  return { op, value };
};

const checkPair = (source: FactSource, predicate: FactPredicate) => {
  if (
    source.type === "price" &&
    predicate.op !== "above" &&
    predicate.op !== "below"
  ) {
    throw new FactError("a price can only be checked with > or <");
  }
  if (source.type === "json" && predicate.op === "exists") {
    throw new FactError("an API value is checked with =, >, < or ~");
  }
  if (
    source.type === "wikidata" &&
    predicate.op === "equals" &&
    !WIKIDATA_ITEM.test(predicate.value)
  ) {
    throw new FactError("a Wikidata value is compared with an item, like =Q30");
  }
  if (source.type === "wikidata" && predicate.op === "contains") {
    throw new FactError(
      "a Wikidata value is checked with exists, =Q.., > or <"
    );
  }
};

export const parseFact = (target: string, expect: string): Fact => {
  if (utf8Bytes(target) > FACT_TARGET_BYTES) {
    throw new FactError(`target must be at most ${FACT_TARGET_BYTES} bytes`);
  }
  if (utf8Bytes(expect) > FACT_EXPECT_BYTES) {
    throw new FactError(`expect must be at most ${FACT_EXPECT_BYTES} bytes`);
  }
  const source = parseSource(target);
  if (source.type === "page") {
    if (expect.length === 0) {
      throw new FactError("the text to look for is empty");
    }
    return { predicate: { op: "contains", value: expect }, source };
  }
  const predicate = parsePredicate(expect);
  checkPair(source, predicate);
  return { predicate, source };
};

export const factError = (target: string, expect: string) => {
  try {
    parseFact(target, expect);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const SYMBOLS = { above: ">", below: "<", contains: "~", equals: "=" } as const;

const targetOf = (source: FactSource) => {
  switch (source.type) {
    case "page":
      return source.url;
    case "json":
      return `${source.url}#${source.path}`;
    case "price":
      return `${PRICE_PREFIX}${source.pair}`;
    default:
      return `${WIKIDATA_PREFIX}${source.entity}/${source.property}`;
  }
};

export const formatFact = ({ predicate, source }: Fact) => {
  const target = targetOf(source);
  if (source.type === "page") {
    return { expect: predicate.op === "exists" ? "" : predicate.value, target };
  }
  const expect =
    predicate.op === "exists"
      ? "exists"
      : `${SYMBOLS[predicate.op]}${predicate.value}`;
  return { expect, target };
};

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const VERBS = {
  above: (value: string) => `is above ${value}`,
  below: (value: string) => `is below ${value}`,
  contains: (value: string) => `contains "${value}"`,
  equals: (value: string) => `equals ${value}`,
};

export const describeFact = (fact: Fact, options: { label?: string } = {}) => {
  const { predicate, source } = fact;
  if (source.type === "page") {
    return `${hostOf(source.url)}: page contains "${predicate.op === "exists" ? "" : predicate.value}"`;
  }
  if (source.type === "price") {
    const [base, quote] = source.pair.split("-");
    const value = predicate.op === "exists" ? "" : predicate.value;
    return `${base} price is ${predicate.op === "below" ? "below" : "above"} ${value} ${quote}`;
  }
  if (source.type === "json") {
    const verb =
      predicate.op === "exists"
        ? "has a value"
        : VERBS[predicate.op](predicate.value);
    return `${hostOf(source.url)}: ${source.path} ${verb}`;
  }
  const subject = options.label ?? source.entity;
  const property = WIKIDATA_PROPERTIES[source.property];
  if (predicate.op === "exists") {
    return `Wikidata: ${subject} has ${property ? `a ${property}` : `a value for ${source.property}`}`;
  }
  return `Wikidata: ${subject} ${property ?? source.property} ${VERBS[predicate.op](predicate.value)}`;
};

export const describeCheckFact = (
  target: string,
  expect: string,
  options: { label?: string } = {}
) => {
  try {
    return describeFact(parseFact(target, expect), options);
  } catch {
    return `${target}: ${expect}`;
  }
};

export const wikidataClaimsUrl = (entity: string, property: string) =>
  `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${entity}&property=${property}&format=json`;

export const fetchWikidataLabel = async (entity: string, language = "en") => {
  const response = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entity}&props=labels&languages=${language}&format=json&origin=*`
  );
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as {
    entities?: Record<string, { labels?: Record<string, { value?: string }> }>;
  };
  return body.entities?.[entity]?.labels?.[language]?.value ?? null;
};

export const jsonPathOf = (path: string) =>
  path.startsWith("[") ? `$${path}` : `$.${path}`;

export const readJsonPath = (body: unknown, path: string): unknown => {
  let current = body;
  for (const [step, index] of path.matchAll(PATH_STEP)) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    const key = index ?? step;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

export type FactFetch = (url: string) => Promise<string>;

export interface FactReading {
  holds: boolean;
  observed: string;
}

const compare = (predicate: FactPredicate, value: unknown): boolean => {
  if (predicate.op === "exists") {
    return value !== undefined && value !== null;
  }
  if (predicate.op === "contains") {
    return (typeof value === "string" ? value : JSON.stringify(value)).includes(
      predicate.value
    );
  }
  if (predicate.op === "equals" && !isNumberText(predicate.value)) {
    return isRawJsonWord(predicate.value)
      ? JSON.stringify(value) === predicate.value
      : value === predicate.value;
  }
  const number = Number(value);
  if (value === null || value === "" || !Number.isFinite(number)) {
    throw new FactError(`value ${JSON.stringify(value)} is not a number`);
  }
  const wanted = Number(predicate.value);
  if (predicate.op === "above") {
    return number > wanted;
  }
  return predicate.op === "below" ? number < wanted : number === wanted;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const readPrice = async (pair: PricePair, fetchText: FactFetch) => {
  const venues = PRICE_PAIRS[pair];
  const settled = await Promise.allSettled(
    venues.map(async (venue) =>
      Number(
        readJsonPath(
          JSON.parse(await fetchText(venue.url)),
          venue.path.slice(2)
        )
      )
    )
  );
  const prices = settled.flatMap((result) =>
    result.status === "fulfilled" && Number.isFinite(result.value)
      ? [result.value]
      : []
  );
  if (prices.length < PRICE_MIN_VENUES) {
    throw new FactError(
      `only ${prices.length} of ${venues.length} price sources answered`
    );
  }
  return median(prices);
};

const readWikidata = async (
  source: Extract<FactSource, { type: "wikidata" }>,
  predicate: FactPredicate,
  fetchText: FactFetch
): Promise<FactReading> => {
  const body = await fetchText(
    wikidataClaimsUrl(source.entity, source.property)
  );
  if (predicate.op === "exists") {
    const holds = body.includes(WIKIDATA_VALUE_MARKER);
    return { holds, observed: holds ? "a value is set" : "no value" };
  }
  const value = readJsonPath(
    JSON.parse(body),
    `claims.${source.property}[0].mainsnak.datavalue.value.${predicate.op === "equals" ? "id" : "amount"}`
  );
  if (value === undefined) {
    return { holds: false, observed: "no value" };
  }
  return { holds: compare(predicate, value), observed: String(value) };
};

export const readFact = async (
  fact: Fact,
  fetchText: FactFetch
): Promise<FactReading> => {
  const { predicate, source } = fact;
  if (source.type === "page") {
    const body = await fetchText(source.url);
    const holds = compare(predicate, body);
    return { holds, observed: holds ? "text found" : "text not found" };
  }
  if (source.type === "price") {
    const price = await readPrice(source.pair, fetchText);
    return { holds: compare(predicate, price), observed: String(price) };
  }
  if (source.type === "wikidata") {
    return readWikidata(source, predicate, fetchText);
  }
  const value = readJsonPath(
    JSON.parse(await fetchText(source.url)),
    source.path
  );
  if (value === undefined) {
    return { holds: false, observed: `no value at ${source.path}` };
  }
  return { holds: compare(predicate, value), observed: JSON.stringify(value) };
};
