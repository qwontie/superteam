import {
  bounty,
  DEMO_WITNESS_NODES,
  type DealSpec,
  gig,
  nowSeconds,
  silenceIsConsent,
} from "@pact/sdk";
import {
  type Draft,
  draftFromWire,
  emptyIds,
  type WireCondition,
  type WireDraft,
} from "@/features/builder/model";

export type StarterKey =
  | "gig"
  | "bounty"
  | "merged"
  | "price"
  | "fact"
  | "silence";

export interface Starter {
  key: StarterKey;
  label: string;
  labels: readonly string[];
  name: string;
  spec: DealSpec;
}

export const ORACLE_WITNESS = "Switchboard oracles";
export const STARTER_FACT_LABELS: Record<string, string> = { Q270: "Warsaw" };

const HOUR = 3600;
const DAY = 86_400;
const SOL = 1_000_000_000n;
const ALL = 10_000;
const WEEK = 7;
const REVIEW_DAYS = 10;
const FINAL_DAYS = 14;
const BLANK = ["", "", ""];

type SpecCheck = DealSpec["checks"][number];

const payOnCheck = (check: SpecCheck, deadline: number): DealSpec => ({
  amount: SOL.toString(),
  checks: [check],
  funder: 0,
  parties: ["", ""],
  rules: [
    { pay: [{ bps: ALL, party: 1 }], when: [{ check: 0, type: "attested" }] },
    { pay: [{ bps: ALL, party: 0 }], when: [{ ts: deadline, type: "after" }] },
  ],
  title: "",
});

const byOracles = (target: string, expect: string): SpecCheck => ({
  binds: null,
  expect,
  kind: "http_contains",
  target,
  threshold: 1,
  witnesses: [""],
});

const byNodes = (kind: SpecCheck["kind"], target: string): SpecCheck => ({
  binds: null,
  expect: "",
  kind,
  target,
  threshold: DEMO_WITNESS_NODES.threshold,
  witnesses: [...DEMO_WITNESS_NODES.witnesses],
});

const INFO: Record<
  StarterKey,
  { label: string; labels: readonly string[]; name: string }
> = {
  bounty: {
    label: "Post a bounty",
    labels: ["Sponsor", "Winner"],
    name: "Bounty",
  },
  fact: {
    label: "Pay on a public fact",
    labels: ["Payer", "Receiver"],
    name: "Public fact",
  },
  gig: { label: "Post a gig", labels: ["Client", "Freelancer"], name: "Gig" },
  merged: {
    label: "Pay for a merged pull request",
    labels: ["Sponsor", "Contributor"],
    name: "Merged pull request",
  },
  price: {
    label: "Pay at a price level",
    labels: ["Payer", "Receiver"],
    name: "Price level",
  },
  silence: {
    label: "Silence is consent",
    labels: ["Client", "Freelancer"],
    name: "Silence is consent",
  },
};

export const STARTER_KEYS: readonly StarterKey[] = [
  "gig",
  "bounty",
  "merged",
  "price",
  "fact",
  "silence",
];

export const isStarterKey = (value: unknown): value is StarterKey =>
  STARTER_KEYS.includes(value as StarterKey);

export const starterSpec = (key: StarterKey, now: number): DealSpec => {
  const start = Math.ceil(now / HOUR) * HOUR;
  const deadline = start + WEEK * DAY;
  switch (key) {
    case "bounty":
      return bounty({
        amount: SOL,
        check: { target: "This submission wins the bounty", witnesses: BLANK },
        deadline,
        sponsor: "",
        title: "",
      });
    case "silence":
      return silenceIsConsent({
        amount: SOL,
        client: "",
        deliveryDeadline: deadline,
        finalExit: start + FINAL_DAYS * DAY,
        freelancer: "",
        reviewEnd: start + REVIEW_DAYS * DAY,
        title: "",
      });
    case "merged":
      return payOnCheck(byNodes("github_pr_merged", ""), deadline);
    case "price":
      return payOnCheck(byOracles("price:SOL-USD", ">200"), deadline);
    case "fact":
      return payOnCheck(
        byOracles("wikidata:Q270/P1082", ">1500000"),
        start + FINAL_DAYS * DAY
      );
    default:
      return gig({
        amount: SOL,
        check: { target: "The work is delivered as agreed", witnesses: BLANK },
        client: "",
        deadline,
        freelancer: "",
        title: "",
      });
  }
};

const witnessLabel = (check: SpecCheck, position: number) => {
  if (check.kind === "manual") {
    return `Reviewer ${position + 1}`;
  }
  return check.kind === "http_contains" && check.witnesses.length === 1
    ? ORACLE_WITNESS
    : `Node ${position + 1}`;
};

const wireFromSpec = (
  spec: DealSpec,
  labels: readonly string[]
): WireDraft => ({
  amount: null,
  checks: spec.checks.map((check) => ({
    binds: check.binds ?? null,
    expect: check.expect,
    kind: check.kind,
    target: check.target,
    threshold: check.threshold,
    witnesses: check.witnesses.map((address, position) => ({
      address: address || null,
      label: witnessLabel(check, position),
      open: false,
    })),
  })),
  funder: spec.funder,
  parties: spec.parties.map((party, index) => ({
    address: null,
    label: labels[index] ?? `Party ${index + 1}`,
    me: index === spec.funder,
    open: party === null,
  })),
  rules: spec.rules.map((rule) => ({
    pay: rule.pay,
    summary: "",
    when: rule.when as WireCondition[],
  })),
  title: "",
});

export const starterDraft = (key: StarterKey, now: number): Draft =>
  draftFromWire(wireFromSpec(starterSpec(key, now), INFO[key].labels), {
    ids: emptyIds(),
    origin: key,
    wallet: null,
  });

export const blankDraft = (now: number): Draft => {
  const deadline = Math.ceil(now / HOUR) * HOUR + WEEK * DAY;
  const spec: DealSpec = {
    amount: SOL.toString(),
    checks: [],
    funder: 0,
    parties: ["", ""],
    rules: [
      { pay: [{ bps: ALL, party: 1 }], when: [] },
      {
        pay: [{ bps: ALL, party: 0 }],
        when: [{ ts: deadline, type: "after" }],
      },
    ],
    title: "",
  };
  return draftFromWire(wireFromSpec(spec, ["Payer", "Receiver"]), {
    ids: emptyIds(),
    origin: "scratch",
    wallet: null,
  });
};

export const FEATURED: readonly StarterKey[] = ["gig", "bounty", "merged"];

export const STARTERS: readonly Starter[] = STARTER_KEYS.map((key) => ({
  key,
  ...INFO[key],
  spec: starterSpec(key, nowSeconds()),
}));
