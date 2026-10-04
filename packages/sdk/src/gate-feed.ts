import type { Address } from "@solana/kit";
import {
  type Fact,
  type FactPredicate,
  isNumberText,
  isRawJsonWord,
  jsonPathOf,
  PRICE_MIN_VENUES,
  PRICE_PAIRS,
  parseFact,
  WIKIDATA_USER_AGENT,
  WIKIDATA_VALUE_MARKER,
  wikidataClaimsUrl,
} from "./facts";
import { findGateAddress, GATE_MIN_SIGNATURES } from "./gate";

export const GATE_CROSSBAR_URL = "https://crossbar.switchboardlabs.xyz";

const PAGE_NAME_PREFIX = "pact gate: page contains ";
const FACT_NAME_PREFIX = "pact fact: ";
const NAME_MAX_CHARS = 64;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const HEX_PREFIX = /^0x/i;
const VARINT_SHIFT = 128;

export const COMPARISON = { above: 1, below: 2, equals: 0 } as const;

export interface GateHeader {
  key: string;
  value: string;
}

export type GateTask =
  | { httpTask: { headers?: GateHeader[]; url: string } }
  | { jsonParseTask: { path: string } }
  | { medianTask: { jobs: GateJob[]; minSuccessfulRequired: number } }
  | { regexExtractTask: { groupNumber: number; pattern: string } }
  | {
      comparisonTask: {
        lhs: GateJob;
        onFalseValue: string;
        onTrueValue: string;
        op: number;
        rhsValue: string;
      };
    }
  | {
      stringMapTask: {
        caseSensitive: boolean;
        defaultValue: string;
        mappings: { key: string; value: string }[];
      };
    };

export interface GateJob {
  tasks: GateTask[];
}

export interface GateFeedDefinition {
  jobs: GateJob[];
  maxJobRangePct: number;
  minJobResponses: number;
  minOracleSamples: number;
  name: string;
}

export interface GateFeed {
  fact: Fact;
  feed: GateFeedDefinition;
  feedHash: string;
  gateAddress: Address;
}

export interface GateCheckLike {
  expect: string;
  kind?: string;
  target: string;
  threshold: number;
  witnesses: readonly string[];
}

const http = (url: string, headers?: GateHeader[]): GateTask => ({
  httpTask: headers ? { headers, url } : { url },
});

const containsTasks = (text: string): GateTask[] => [
  {
    regexExtractTask: {
      groupNumber: 1,
      pattern: `(?s)(?:.*?(${text.replace(REGEX_SPECIAL, "\\$&")}))?`,
    },
  },
  {
    stringMapTask: {
      caseSensitive: true,
      defaultValue: "0",
      mappings: [{ key: text, value: "1" }],
    },
  },
];

const equalsTask = (key: string): GateTask => ({
  stringMapTask: {
    caseSensitive: true,
    defaultValue: "0",
    mappings: [{ key, value: "1" }],
  },
});

const numberJob = (
  venues: readonly { headers?: GateHeader[]; path: string; url: string }[],
  minSuccessfulRequired: number
): GateJob => ({
  tasks: [
    {
      medianTask: {
        jobs: venues.map((venue) => ({
          tasks: [
            http(venue.url, venue.headers),
            { jsonParseTask: { path: venue.path } },
          ],
        })),
        minSuccessfulRequired,
      },
    },
  ],
});

const compareTask = (
  op: "above" | "below" | "equals",
  lhs: GateJob,
  value: string
): GateTask => ({
  comparisonTask: {
    lhs,
    onFalseValue: "0",
    onTrueValue: "1",
    op: COMPARISON[op],
    rhsValue: value,
  },
});

const valueTasks = (
  url: string,
  path: string,
  predicate: FactPredicate,
  headers?: GateHeader[]
): GateTask[] => {
  if (predicate.op === "exists") {
    throw new Error("exists has no value job");
  }
  if (
    predicate.op === "above" ||
    predicate.op === "below" ||
    (predicate.op === "equals" && isNumberText(predicate.value))
  ) {
    return [
      compareTask(
        predicate.op,
        numberJob([{ headers, path, url }], 1),
        predicate.value
      ),
    ];
  }
  const parsed: GateTask[] = [http(url, headers), { jsonParseTask: { path } }];
  if (predicate.op === "contains") {
    return [...parsed, ...containsTasks(predicate.value)];
  }
  return [
    ...parsed,
    equalsTask(
      isRawJsonWord(predicate.value)
        ? predicate.value
        : JSON.stringify(predicate.value)
    ),
  ];
};

export const factTasks = ({ predicate, source }: Fact): GateTask[] => {
  if (source.type === "page") {
    return [
      http(source.url),
      ...containsTasks(predicate.op === "exists" ? "" : predicate.value),
    ];
  }
  if (source.type === "json") {
    return valueTasks(source.url, jsonPathOf(source.path), predicate);
  }
  if (source.type === "price") {
    if (predicate.op !== "above" && predicate.op !== "below") {
      throw new Error("a price is checked with above or below");
    }
    return [
      compareTask(
        predicate.op,
        numberJob(PRICE_PAIRS[source.pair], PRICE_MIN_VENUES),
        predicate.value
      ),
    ];
  }
  const url = wikidataClaimsUrl(source.entity, source.property);
  const headers = [{ key: "User-Agent", value: WIKIDATA_USER_AGENT }];
  if (predicate.op === "exists") {
    return [http(url, headers), ...containsTasks(WIKIDATA_VALUE_MARKER)];
  }
  const leaf = predicate.op === "equals" ? "id" : "amount";
  return valueTasks(
    url,
    `$.claims.${source.property}[0].mainsnak.datavalue.value.${leaf}`,
    predicate,
    headers
  );
};

export const gateFeedDefinition = (
  target: string,
  expect: string,
  oracles = GATE_MIN_SIGNATURES
): GateFeedDefinition => {
  const fact = parseFact(target, expect);
  const name =
    fact.source.type === "page"
      ? `${PAGE_NAME_PREFIX}${expect}`
      : `${FACT_NAME_PREFIX}${target} ${expect}`;
  return {
    jobs: [{ tasks: factTasks(fact) }],
    maxJobRangePct: 0,
    minJobResponses: 1,
    minOracleSamples: oracles,
    name: name.slice(0, NAME_MAX_CHARS),
  };
};

const varint = (value: number) => {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= VARINT_SHIFT) {
    bytes.push((rest % VARINT_SHIFT) + VARINT_SHIFT);
    rest = Math.floor(rest / VARINT_SHIFT);
  }
  bytes.push(rest);
  return bytes;
};

const tag = (field: number, wireType: number) => varint(field * 8 + wireType);
const bytesField = (field: number, bytes: number[]) => [
  ...tag(field, 2),
  ...varint(bytes.length),
  ...bytes,
];
const stringField = (field: number, text: string) =>
  bytesField(field, [...new TextEncoder().encode(text)]);
const uintField = (field: number, value: number) => [
  ...tag(field, 0),
  ...varint(value),
];

const HTTP_TASK = 1;
const JSON_PARSE_TASK = 2;
const MEDIAN_TASK = 4;
const REGEX_EXTRACT_TASK = 14;
const COMPARISON_TASK = 44;
const STRING_MAP_TASK = 76;

const encodeTask = (task: GateTask): number[] => {
  if ("httpTask" in task) {
    return bytesField(HTTP_TASK, [
      ...stringField(1, task.httpTask.url),
      ...(task.httpTask.headers ?? []).flatMap((header) =>
        bytesField(3, [
          ...stringField(1, header.key),
          ...stringField(2, header.value),
        ])
      ),
    ]);
  }
  if ("jsonParseTask" in task) {
    return bytesField(JSON_PARSE_TASK, stringField(1, task.jsonParseTask.path));
  }
  if ("medianTask" in task) {
    return bytesField(MEDIAN_TASK, [
      ...task.medianTask.jobs.flatMap((job) => bytesField(2, encodeJob(job))),
      ...uintField(3, task.medianTask.minSuccessfulRequired),
    ]);
  }
  if ("regexExtractTask" in task) {
    return bytesField(REGEX_EXTRACT_TASK, [
      ...stringField(1, task.regexExtractTask.pattern),
      ...uintField(2, task.regexExtractTask.groupNumber),
    ]);
  }
  if ("comparisonTask" in task) {
    const compare = task.comparisonTask;
    return bytesField(COMPARISON_TASK, [
      ...uintField(1, compare.op),
      ...bytesField(2, encodeJob(compare.lhs)),
      ...stringField(5, compare.rhsValue),
      ...stringField(7, compare.onTrueValue),
      ...stringField(9, compare.onFalseValue),
    ]);
  }
  const map = task.stringMapTask;
  return bytesField(STRING_MAP_TASK, [
    ...map.mappings.flatMap((mapping) =>
      bytesField(1, [
        ...stringField(1, mapping.key),
        ...stringField(2, mapping.value),
      ])
    ),
    ...stringField(2, map.defaultValue),
    ...uintField(3, map.caseSensitive ? 1 : 0),
  ]);
};

const encodeJob = (job: GateJob): number[] =>
  job.tasks.flatMap((task) => bytesField(1, encodeTask(task)));

export const encodeGateFeed = (feed: GateFeedDefinition) => {
  const body = [
    ...stringField(1, feed.name),
    ...feed.jobs.flatMap((job) => bytesField(2, encodeJob(job))),
    ...uintField(3, feed.minOracleSamples),
    ...uintField(4, feed.minJobResponses),
    ...uintField(5, feed.maxJobRangePct),
  ];
  return Uint8Array.from([...varint(body.length), ...body]);
};

const hex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const gateFeedFor = async (
  target: string,
  expect: string,
  oracles = GATE_MIN_SIGNATURES
): Promise<GateFeed> => {
  const fact = parseFact(target, expect);
  const feed = gateFeedDefinition(target, expect, oracles);
  const digest = await crypto.subtle.digest("SHA-256", encodeGateFeed(feed));
  const feedHash = `0x${hex(new Uint8Array(digest))}`;
  return { fact, feed, feedHash, gateAddress: await findGateAddress(feedHash) };
};

export const storeGateFeed = async (
  target: string,
  expect: string,
  options: { crossbarUrl?: string; oracles?: number } = {}
): Promise<GateFeed> => {
  const gate = await gateFeedFor(target, expect, options.oracles);
  let response: Response;
  try {
    response = await fetch(
      `${options.crossbarUrl ?? GATE_CROSSBAR_URL}/v2/store`,
      {
        body: JSON.stringify({ feed: gate.feed }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );
  } catch (cause) {
    throw new Error("Switchboard Crossbar is not reachable, try again later", {
      cause,
    });
  }
  if (!response.ok) {
    throw new Error(
      `Switchboard Crossbar refused the job (HTTP ${response.status})`
    );
  }
  const { feedId } = (await response.json()) as { feedId?: string };
  const stored = (feedId ?? "").replace(HEX_PREFIX, "").toLowerCase();
  if (stored !== gate.feedHash.slice(2)) {
    throw new Error(`Switchboard Crossbar stored another feed hash: ${feedId}`);
  }
  return gate;
};

export const isGateCheck = async (check: GateCheckLike) => {
  const [witness] = check.witnesses;
  if (
    check.witnesses.length !== 1 ||
    check.threshold !== 1 ||
    (check.kind !== undefined && check.kind !== "http_contains")
  ) {
    return false;
  }
  try {
    const { gateAddress } = await gateFeedFor(check.target, check.expect);
    return witness === gateAddress;
  } catch {
    return false;
  }
};
