import {
  bounty,
  type CheckKind,
  type DealSpec,
  gig,
  LIMITS,
  lamportsToSol,
  silenceIsConsent,
  solToLamports,
} from "@pact/sdk";
import { isAddress } from "@solana/kit";

export type TemplateKey = "gig" | "bounty" | "silence";
export type Origin = TemplateKey | "ai";
export type PieceType = "after" | "signed" | "unsigned" | "attested";

export interface PartySlot {
  address: string;
  id: string;
  label: string;
  me: boolean;
  open: boolean;
}

export interface Reviewer {
  address: string;
  id: string;
  label: string;
}

export interface DraftCheck {
  binds: string | null;
  expect: string;
  id: string;
  kind: CheckKind;
  reviewers: Reviewer[];
  target: string;
  threshold: number;
}

export type DraftCondition =
  | { id: string; ts: number; type: "after" }
  | { id: string; party: string; type: "signed" | "unsigned" }
  | { check: string; id: string; type: "attested" };

export interface DraftPayout {
  bps: number;
  party: string;
}

export interface DraftRule {
  exit: boolean;
  id: string;
  pay: DraftPayout[];
  when: DraftCondition[];
}

export interface Draft {
  amount: string;
  checks: DraftCheck[];
  funder: string;
  origin: Origin;
  parties: PartySlot[];
  rules: DraftRule[];
  title: string;
}

export interface WireSlot {
  address: string | null;
  label: string;
  me?: boolean;
  open: boolean;
}

export type WireCondition =
  | { ts: number; type: "after" }
  | { party: number; type: "signed" | "unsigned" }
  | { check: number; type: "attested" };

export interface WireCheck {
  binds: number | null;
  expect: string;
  kind: CheckKind;
  target: string;
  threshold: number;
  witnesses: WireSlot[];
}

export interface WireRule {
  pay: { bps: number; party: number }[];
  summary: string;
  when: WireCondition[];
}

export interface WireDraft {
  amount: string | null;
  checks: WireCheck[];
  funder: number;
  parties: WireSlot[];
  rules: WireRule[];
  title: string;
}

export interface IdTable {
  checks: string[];
  parties: string[];
  rules: string[];
}

export const FULL = LIMITS.totalBps;
export const SHARE_STEP = 100;
export const MISSING = 255;

const HOUR = 3600;
const DAY = 86_400;
const ID_SIZE = 8;
const GIG_DAYS = 7;
const REVIEW_DAYS = 10;
const FINAL_DAYS = 14;
const DEFAULT_REVIEWERS = 3;

export const newId = () => crypto.randomUUID().slice(0, ID_SIZE);

export const emptyIds = (): IdTable => ({ checks: [], parties: [], rules: [] });

export const idsOf = (draft: Draft): IdTable => ({
  checks: draft.checks.map((check) => check.id),
  parties: draft.parties.map((party) => party.id),
  rules: draft.rules.map((rule) => rule.id),
});

const idAt = (list: string[], index: number) => {
  const known = list[index];
  if (known) {
    return known;
  }
  const created = newId();
  list[index] = created;
  return created;
};

export const isTimeOnly = (rule: { when: { type: string }[] }) =>
  rule.when.length > 0 &&
  rule.when.every((condition) => condition.type === "after");

const exitIndex = (rules: { when: { type: string }[] }[]) => {
  let found = -1;
  for (const [index, rule] of rules.entries()) {
    if (isTimeOnly(rule)) {
      found = index;
    }
  }
  return found;
};

export const exitLast = (rules: DraftRule[]) => [
  ...rules.filter((rule) => !rule.exit),
  ...rules.filter((rule) => rule.exit),
];

const conditionFromWire = (
  condition: WireCondition,
  id: string,
  ids: IdTable
): DraftCondition => {
  if (condition.type === "after") {
    return { id, ts: condition.ts, type: "after" };
  }
  if (condition.type === "attested") {
    return { check: idAt(ids.checks, condition.check), id, type: "attested" };
  }
  return {
    id,
    party: idAt(ids.parties, condition.party),
    type: condition.type,
  };
};

export const draftFromWire = (
  wire: WireDraft,
  options: { ids: IdTable; origin: Origin; wallet: string | null }
): Draft => {
  const { ids, origin, wallet } = options;
  const parties = wire.parties.map((slot, index) => {
    const mine = wallet !== null && slot.address === wallet;
    return {
      address: slot.address ?? "",
      id: idAt(ids.parties, index),
      label: slot.label,
      me: !slot.open && (mine || slot.me === true),
      open: slot.open,
    };
  });
  const checks = wire.checks.map((check, index) => {
    const id = idAt(ids.checks, index);
    return {
      binds: check.binds === null ? null : idAt(ids.parties, check.binds),
      expect: check.expect,
      id,
      kind: check.kind,
      reviewers: check.witnesses.map((slot, position) => ({
        address: slot.address ?? "",
        id: `${id}-r${position}`,
        label: slot.label,
      })),
      target: check.target,
      threshold: check.threshold,
    };
  });
  const exit = exitIndex(wire.rules);
  const rules = wire.rules.map((rule, index) => {
    const id = idAt(ids.rules, index);
    return {
      exit: index === exit,
      id,
      pay: rule.pay.map((payout) => ({
        bps: payout.bps,
        party: idAt(ids.parties, payout.party),
      })),
      when: rule.when.map((condition, position) =>
        conditionFromWire(condition, `${id}-w${position}`, ids)
      ),
    };
  });
  return {
    amount: wire.amount ? lamportsToSol(wire.amount) : "",
    checks,
    funder: idAt(ids.parties, wire.funder),
    origin,
    parties,
    rules: exitLast(rules),
    title: wire.title,
  };
};

export const partyIndex = (draft: Draft, id: string) => {
  const index = draft.parties.findIndex((party) => party.id === id);
  return index < 0 ? MISSING : index;
};

export const checkIndex = (draft: Draft, id: string) => {
  const index = draft.checks.findIndex((check) => check.id === id);
  return index < 0 ? MISSING : index;
};

export const partyAddress = (party: PartySlot, wallet: string | null) => {
  if (party.open) {
    return null;
  }
  if (party.me) {
    return wallet ?? "";
  }
  return party.address.trim();
};

export const amountLamports = (amount: string) => {
  try {
    const lamports = solToLamports(amount);
    return lamports > 0n ? lamports.toString() : null;
  } catch {
    return null;
  }
};

const conditionToSpec = (draft: Draft, condition: DraftCondition) => {
  if (condition.type === "after") {
    return { ts: condition.ts, type: condition.type };
  }
  if (condition.type === "attested") {
    return { check: checkIndex(draft, condition.check), type: condition.type };
  }
  return { party: partyIndex(draft, condition.party), type: condition.type };
};

export const draftToSpec = (draft: Draft, wallet: string | null): DealSpec => ({
  amount: amountLamports(draft.amount) ?? "",
  checks: draft.checks.map((check) => ({
    binds: check.binds === null ? null : partyIndex(draft, check.binds),
    expect: check.expect.trim(),
    kind: check.kind,
    target: check.target.trim(),
    threshold: check.threshold,
    witnesses: check.reviewers.map((reviewer) => reviewer.address.trim()),
  })),
  funder: partyIndex(draft, draft.funder),
  parties: draft.parties.map((party) => partyAddress(party, wallet)),
  rules: draft.rules.map((rule) => ({
    pay: rule.pay.map((payout) => ({
      bps: payout.bps,
      party: partyIndex(draft, payout.party),
    })),
    when: rule.when.map((condition) => conditionToSpec(draft, condition)),
  })),
  title: draft.title.trim(),
});

const wireAddress = (address: string | null) =>
  address && isAddress(address) ? address : null;

export const draftToWire = (
  draft: Draft,
  wallet: string | null,
  summaries: readonly string[]
): { ids: IdTable; wire: WireDraft } | null => {
  const spec = draftToSpec(draft, wallet);
  const kept = draft.rules
    .map((rule, index) => ({ index, rule }))
    .filter(({ index }) => {
      const rule = spec.rules[index];
      return (
        rule !== undefined &&
        rule.when.length > 0 &&
        rule.pay.length > 0 &&
        rule.pay.every((payout) => payout.bps > 0 && payout.party !== MISSING)
      );
    });
  if (kept.length === 0 || spec.funder === MISSING) {
    return null;
  }
  const wire: WireDraft = {
    amount: spec.amount || null,
    checks: draft.checks.map((check, index) => ({
      binds: spec.checks[index]?.binds ?? null,
      expect: check.expect.trim(),
      kind: check.kind,
      target: check.target.trim() || "To be described",
      threshold: Math.max(1, check.threshold),
      witnesses: check.reviewers.map((reviewer, position) => ({
        address: wireAddress(reviewer.address.trim()),
        label: reviewer.label.trim() || `Reviewer ${position + 1}`,
        open: false,
      })),
    })),
    funder: spec.funder,
    parties: draft.parties.map((party, index) => ({
      address: wireAddress(spec.parties[index] ?? null),
      label: party.label.trim() || `Party ${index + 1}`,
      open: party.open,
    })),
    rules: kept.map(({ index }) => ({
      pay: spec.rules[index]?.pay ?? [],
      summary: summaries[index] ?? "",
      when: (spec.rules[index]?.when ?? []) as WireCondition[],
    })),
    title: draft.title.trim() || "Untitled deal",
  };
  return {
    ids: {
      checks: draft.checks.map((check) => check.id),
      parties: draft.parties.map((party) => party.id),
      rules: kept.map(({ rule }) => rule.id),
    },
    wire,
  };
};

const nextHour = (now: number) => Math.ceil(now / HOUR) * HOUR;

const blankSlot = (label: string, extra: Partial<WireSlot> = {}): WireSlot => ({
  address: null,
  label,
  open: false,
  ...extra,
});

const wireFromSpec = (
  spec: DealSpec,
  labels: readonly string[],
  target: string
): WireDraft => ({
  amount: null,
  checks: spec.checks.map((check) => ({
    binds: check.binds ?? null,
    expect: "",
    kind: "manual",
    target,
    threshold: check.threshold,
    witnesses: check.witnesses.map((_, position) =>
      blankSlot(`Reviewer ${position + 1}`)
    ),
  })),
  funder: spec.funder,
  parties: spec.parties.map((party, index) =>
    blankSlot(labels[index] ?? `Party ${index + 1}`, {
      me: index === spec.funder,
      open: party === null,
    })
  ),
  rules: spec.rules.map((rule) => ({
    pay: rule.pay,
    summary: "",
    when: rule.when as WireCondition[],
  })),
  title: "",
});

const blankReviewers = () =>
  Array.from({ length: DEFAULT_REVIEWERS }, () => "");

export const templateDraft = (key: TemplateKey, now: number): Draft => {
  const start = nextHour(now);
  const options = { ids: emptyIds(), origin: key, wallet: null };
  if (key === "bounty") {
    const target = "This submission wins the bounty";
    const spec = bounty({
      amount: 1n,
      check: { target, witnesses: blankReviewers() },
      deadline: start + GIG_DAYS * DAY,
      sponsor: "",
      title: "",
    });
    return draftFromWire(
      wireFromSpec(spec, ["Sponsor", "Winner"], target),
      options
    );
  }
  if (key === "silence") {
    const spec = silenceIsConsent({
      amount: 1n,
      client: "",
      deliveryDeadline: start + GIG_DAYS * DAY,
      finalExit: start + FINAL_DAYS * DAY,
      freelancer: "",
      reviewEnd: start + REVIEW_DAYS * DAY,
      title: "",
    });
    return draftFromWire(
      wireFromSpec(spec, ["Client", "Freelancer"], ""),
      options
    );
  }
  const target = "The work is delivered as agreed";
  const spec = gig({
    amount: 1n,
    check: { target, witnesses: blankReviewers() },
    client: "",
    deadline: start + GIG_DAYS * DAY,
    freelancer: "",
    title: "",
  });
  return draftFromWire(
    wireFromSpec(spec, ["Client", "Freelancer"], target),
    options
  );
};

export const defaultDeadline = (draft: Draft, now: number) => {
  const times = draft.rules.flatMap((rule) =>
    rule.when.flatMap((condition) =>
      condition.type === "after" ? [condition.ts] : []
    )
  );
  const soonest = times.length > 0 ? Math.min(...times) : null;
  return soonest && soonest > now ? soonest : nextHour(now) + GIG_DAYS * DAY;
};

export const newCondition = (
  type: PieceType,
  draft: Draft,
  now: number
): DraftCondition | null => {
  const id = newId();
  if (type === "after") {
    return { id, ts: defaultDeadline(draft, now), type };
  }
  if (type === "attested") {
    const [check] = draft.checks;
    return check ? { check: check.id, id, type } : null;
  }
  const party =
    draft.parties.find((entry) => !entry.open) ?? draft.parties[0] ?? null;
  return party ? { id, party: party.id, type } : null;
};

const mapRule = (
  draft: Draft,
  ruleId: string,
  change: (rule: DraftRule) => DraftRule
): Draft => ({
  ...draft,
  rules: draft.rules.map((rule) => (rule.id === ruleId ? change(rule) : rule)),
});

export const canTake = (rule: DraftRule, type: PieceType) =>
  rule.when.length < LIMITS.maxConditions && (!rule.exit || type === "after");

export const addCondition = (
  draft: Draft,
  ruleId: string,
  condition: DraftCondition
) =>
  mapRule(draft, ruleId, (rule) =>
    canTake(rule, condition.type)
      ? { ...rule, when: [...rule.when, condition] }
      : rule
  );

export const updateCondition = (
  draft: Draft,
  ruleId: string,
  condition: DraftCondition
) =>
  mapRule(draft, ruleId, (rule) => ({
    ...rule,
    when: rule.when.map((entry) =>
      entry.id === condition.id ? condition : entry
    ),
  }));

export const canRemoveCondition = (rule: DraftRule) =>
  !rule.exit || rule.when.length > 1;

export const removeCondition = (
  draft: Draft,
  ruleId: string,
  conditionId: string
) =>
  mapRule(draft, ruleId, (rule) =>
    canRemoveCondition(rule)
      ? {
          ...rule,
          when: rule.when.filter((entry) => entry.id !== conditionId),
        }
      : rule
  );

export const moveCondition = (
  draft: Draft,
  fromRule: string,
  toRule: string,
  conditionId: string
): Draft => {
  const source = draft.rules.find((rule) => rule.id === fromRule);
  const target = draft.rules.find((rule) => rule.id === toRule);
  const condition = source?.when.find((entry) => entry.id === conditionId);
  if (!(source && target && condition) || fromRule === toRule) {
    return draft;
  }
  if (!(canRemoveCondition(source) && canTake(target, condition.type))) {
    return draft;
  }
  return addCondition(
    removeCondition(draft, fromRule, conditionId),
    toRule,
    condition
  );
};

export const canAddRule = (draft: Draft) =>
  draft.rules.length < LIMITS.maxRules;

export const addRule = (
  draft: Draft,
  condition: DraftCondition | null
): Draft => {
  const recipient =
    draft.parties.find((party) => party.id !== draft.funder && !party.open) ??
    draft.parties.find((party) => party.id !== draft.funder) ??
    draft.parties[0];
  if (!(recipient && canAddRule(draft))) {
    return draft;
  }
  const rule: DraftRule = {
    exit: false,
    id: newId(),
    pay: [{ bps: FULL, party: recipient.id }],
    when: condition ? [condition] : [],
  };
  return { ...draft, rules: exitLast([...draft.rules, rule]) };
};

export const removeRule = (draft: Draft, ruleId: string): Draft => ({
  ...draft,
  rules: draft.rules.filter((rule) => rule.exit || rule.id !== ruleId),
});

export const reorderRules = (
  draft: Draft,
  fromId: string,
  toId: string
): Draft => {
  const from = draft.rules.findIndex((rule) => rule.id === fromId);
  const to = draft.rules.findIndex((rule) => rule.id === toId);
  const moved = draft.rules[from];
  if (!moved || to < 0 || from === to) {
    return draft;
  }
  const rest = draft.rules.filter((rule) => rule.id !== fromId);
  rest.splice(to, 0, moved);
  return { ...draft, rules: exitLast(rest) };
};

const largest = (pay: DraftPayout[]) => {
  let best = 0;
  for (const [index, payout] of pay.entries()) {
    if (payout.bps > (pay[best]?.bps ?? 0)) {
      best = index;
    }
  }
  return best;
};

export const splitEvenly = (pay: DraftPayout[]): DraftPayout[] => {
  if (pay.length === 0) {
    return pay;
  }
  const base = Math.floor(FULL / pay.length / SHARE_STEP) * SHARE_STEP;
  const rest = FULL - base * pay.length;
  return pay.map((payout, index) => ({
    ...payout,
    bps: index === 0 ? base + rest : base,
  }));
};

export const addPayout = (pay: DraftPayout[], party: string): DraftPayout[] => {
  if (pay.length >= LIMITS.maxPayouts || pay.some((p) => p.party === party)) {
    return pay;
  }
  if (pay.length === 0) {
    return [{ bps: FULL, party }];
  }
  const donor = largest(pay);
  const given =
    Math.floor((pay[donor]?.bps ?? 0) / 2 / SHARE_STEP) * SHARE_STEP;
  if (given < SHARE_STEP) {
    return pay;
  }
  return [
    ...pay.map((payout, index) =>
      index === donor ? { ...payout, bps: payout.bps - given } : payout
    ),
    { bps: given, party },
  ];
};

export const removePayout = (
  pay: DraftPayout[],
  party: string
): DraftPayout[] => {
  const gone = pay.find((payout) => payout.party === party);
  const rest = pay.filter((payout) => payout.party !== party);
  if (!gone || rest.length === 0) {
    return rest;
  }
  const heir = largest(rest);
  return rest.map((payout, index) =>
    index === heir ? { ...payout, bps: payout.bps + gone.bps } : payout
  );
};

export const moveDivider = (
  pay: DraftPayout[],
  index: number,
  leftBps: number
): DraftPayout[] => {
  const left = pay[index];
  const right = pay[index + 1];
  if (!(left && right)) {
    return pay;
  }
  const pair = left.bps + right.bps;
  const snapped = Math.round(leftBps / SHARE_STEP) * SHARE_STEP;
  const next = Math.min(pair - SHARE_STEP, Math.max(SHARE_STEP, snapped));
  return pay.map((payout, position) => {
    if (position === index) {
      return { ...payout, bps: next };
    }
    if (position === index + 1) {
      return { ...payout, bps: pair - next };
    }
    return payout;
  });
};

export const setPay = (draft: Draft, ruleId: string, pay: DraftPayout[]) =>
  mapRule(draft, ruleId, (rule) => ({ ...rule, pay }));

export const canAddParty = (draft: Draft) =>
  draft.parties.length < LIMITS.maxParties;

export const addParty = (draft: Draft, open: boolean): Draft => {
  if (!canAddParty(draft)) {
    return draft;
  }
  const label = open ? "Winner" : `Party ${draft.parties.length + 1}`;
  return {
    ...draft,
    parties: [
      ...draft.parties,
      { address: "", id: newId(), label, me: false, open },
    ],
  };
};

export const updateParty = (
  draft: Draft,
  id: string,
  patch: Partial<PartySlot>
): Draft => {
  const parties = draft.parties.map((party) => {
    if (party.id === id) {
      return { ...party, ...patch };
    }
    return patch.me ? { ...party, me: false } : party;
  });
  const opened = patch.open === true;
  return {
    ...draft,
    checks: draft.checks.map((check) =>
      patch.open === false && check.binds === id
        ? { ...check, binds: null }
        : check
    ),
    funder:
      opened && draft.funder === id
        ? (parties.find((party) => !party.open)?.id ?? draft.funder)
        : draft.funder,
    parties,
  };
};

export const canRemoveParty = (draft: Draft) =>
  draft.parties.length > LIMITS.minParties;

export const removeParty = (draft: Draft, id: string): Draft => {
  if (!canRemoveParty(draft)) {
    return draft;
  }
  const parties = draft.parties.filter((party) => party.id !== id);
  return {
    ...draft,
    checks: draft.checks.map((check) =>
      check.binds === id ? { ...check, binds: null } : check
    ),
    funder:
      draft.funder === id
        ? (parties.find((party) => !party.open)?.id ?? draft.funder)
        : draft.funder,
    parties,
    rules: draft.rules.map((rule) => ({
      ...rule,
      pay: removePayout(rule.pay, id),
      when: rule.when.filter(
        (condition) =>
          !(
            (condition.type === "signed" || condition.type === "unsigned") &&
            condition.party === id
          )
      ),
    })),
  };
};

export const canAddCheck = (draft: Draft) =>
  draft.checks.length < LIMITS.maxChecks;

export const addCheck = (draft: Draft): Draft => {
  if (!canAddCheck(draft)) {
    return draft;
  }
  const id = newId();
  return {
    ...draft,
    checks: [
      ...draft.checks,
      {
        binds: null,
        expect: "",
        id,
        kind: "manual",
        reviewers: [{ address: "", id: newId(), label: "Reviewer 1" }],
        target: "",
        threshold: 1,
      },
    ],
  };
};

export const updateCheck = (
  draft: Draft,
  id: string,
  change: (check: DraftCheck) => DraftCheck
): Draft => ({
  ...draft,
  checks: draft.checks.map((check) => {
    if (check.id !== id) {
      return check;
    }
    const next = change(check);
    const max = Math.max(1, next.reviewers.length);
    return { ...next, threshold: Math.min(max, Math.max(1, next.threshold)) };
  }),
});

export const removeCheck = (draft: Draft, id: string): Draft => ({
  ...draft,
  checks: draft.checks.filter((check) => check.id !== id),
  rules: draft.rules.map((rule) => ({
    ...rule,
    when: rule.when.filter(
      (condition) => !(condition.type === "attested" && condition.check === id)
    ),
  })),
});

export const canAddReviewer = (check: DraftCheck) =>
  check.reviewers.length < LIMITS.maxWitnesses;

export const addReviewer = (check: DraftCheck): DraftCheck =>
  canAddReviewer(check)
    ? {
        ...check,
        reviewers: [
          ...check.reviewers,
          {
            address: "",
            id: newId(),
            label: `Reviewer ${check.reviewers.length + 1}`,
          },
        ],
      }
    : check;

export const removeReviewer = (check: DraftCheck, id: string): DraftCheck =>
  check.reviewers.length > LIMITS.minWitnesses
    ? {
        ...check,
        reviewers: check.reviewers.filter((reviewer) => reviewer.id !== id),
      }
    : check;
