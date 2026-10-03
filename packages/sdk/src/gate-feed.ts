import type { Address } from "@solana/kit";
import { findGateAddress, GATE_MIN_SIGNATURES } from "./gate";

export const GATE_CROSSBAR_URL = "https://crossbar.switchboardlabs.xyz";

const NAME_PREFIX = "pact gate: page contains ";
const NAME_MAX_CHARS = 64;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const HEX_PREFIX = /^0x/i;
const VARINT_SHIFT = 128;

export interface GateFeedDefinition {
  jobs: {
    tasks: [
      { httpTask: { url: string } },
      { regexExtractTask: { groupNumber: number; pattern: string } },
      {
        stringMapTask: {
          caseSensitive: boolean;
          defaultValue: string;
          mappings: { key: string; value: string }[];
        };
      },
    ];
  }[];
  maxJobRangePct: number;
  minJobResponses: number;
  minOracleSamples: number;
  name: string;
}

export interface GateFeed {
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

export const gateFeedDefinition = (
  url: string,
  text: string,
  oracles = GATE_MIN_SIGNATURES
): GateFeedDefinition => ({
  jobs: [
    {
      tasks: [
        { httpTask: { url } },
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
      ],
    },
  ],
  maxJobRangePct: 0,
  minJobResponses: 1,
  minOracleSamples: oracles,
  name: `${NAME_PREFIX}${text}`.slice(0, NAME_MAX_CHARS),
});

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
const REGEX_EXTRACT_TASK = 14;
const STRING_MAP_TASK = 76;

const encodeJob = ([
  http,
  regex,
  map,
]: GateFeedDefinition["jobs"][number]["tasks"]) =>
  [
    bytesField(HTTP_TASK, stringField(1, http.httpTask.url)),
    bytesField(REGEX_EXTRACT_TASK, [
      ...stringField(1, regex.regexExtractTask.pattern),
      ...uintField(2, regex.regexExtractTask.groupNumber),
    ]),
    bytesField(STRING_MAP_TASK, [
      ...map.stringMapTask.mappings.flatMap((mapping) =>
        bytesField(1, [
          ...stringField(1, mapping.key),
          ...stringField(2, mapping.value),
        ])
      ),
      ...stringField(2, map.stringMapTask.defaultValue),
      ...uintField(3, map.stringMapTask.caseSensitive ? 1 : 0),
    ]),
  ].flatMap((task) => bytesField(1, task));

export const encodeGateFeed = (feed: GateFeedDefinition) => {
  const body = [
    ...stringField(1, feed.name),
    ...feed.jobs.flatMap((job) => bytesField(2, encodeJob(job.tasks))),
    ...uintField(3, feed.minOracleSamples),
    ...uintField(4, feed.minJobResponses),
    ...uintField(5, feed.maxJobRangePct),
  ];
  return Uint8Array.from([...varint(body.length), ...body]);
};

const hex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const gateFeedFor = async (
  url: string,
  text: string,
  oracles = GATE_MIN_SIGNATURES
): Promise<GateFeed> => {
  const feed = gateFeedDefinition(url, text, oracles);
  const digest = await crypto.subtle.digest("SHA-256", encodeGateFeed(feed));
  const feedHash = `0x${hex(new Uint8Array(digest))}`;
  return { feed, feedHash, gateAddress: await findGateAddress(feedHash) };
};

export const storeGateFeed = async (
  url: string,
  text: string,
  options: { crossbarUrl?: string; oracles?: number } = {}
): Promise<GateFeed> => {
  const gate = await gateFeedFor(url, text, options.oracles);
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
  const { gateAddress } = await gateFeedFor(check.target, check.expect);
  return witness === gateAddress;
};
