import { factShape } from "@/features/builder/facts";
import { withOracle } from "@/features/builder/gate";
import {
  addCondition,
  addParty,
  addPayout,
  addRule,
  canAddCheck,
  canAddParty,
  canAddRule,
  canTake,
  type Draft,
  type DraftCheck,
  type DraftCondition,
  type DraftPayout,
  exitLast,
  FULL,
  newCondition,
  newId,
  type PieceType,
  SHARE_STEP,
  setPay,
  splitEvenly,
  withDemoNodes,
} from "@/features/builder/model";

export type Category = "time" | "people" | "github" | "facts" | "money";

export type CheckBlock =
  | "vote"
  | "judges"
  | "merged"
  | "green"
  | "price"
  | "wikidata"
  | "page"
  | "api";

export type BlockKind = "after" | "signed" | "unsigned" | CheckBlock;
export type MoneyKind = "pay" | "split" | "refund";
export type PaletteKind = BlockKind | MoneyKind;

export type Part = string | { id?: string; slot: string };

interface BlockInfo {
  category: Category;
  name: string;
  parts: readonly Part[];
}

const slot = (text: string): Part => ({ slot: text });

export const BLOCKS: Record<PaletteKind, BlockInfo> = {
  after: {
    category: "time",
    name: "after a date",
    parts: ["after", slot("date")],
  },
  api: {
    category: "facts",
    name: "an API value",
    parts: ["API", slot("url"), slot("path"), slot("equals"), slot("value")],
  },
  green: {
    category: "github",
    name: "checks are green",
    parts: ["checks are green on", slot("owner/repo@ref")],
  },
  judges: {
    category: "people",
    name: "judges name the winner",
    parts: [
      slot("2"),
      "of",
      { id: "a", slot: "wallet" },
      { id: "b", slot: "wallet" },
      { id: "c", slot: "wallet" },
      "name the winner",
    ],
  },
  merged: {
    category: "github",
    name: "pull request is merged",
    parts: ["pull request", slot("owner/repo#12"), "is merged"],
  },
  page: {
    category: "facts",
    name: "a page contains a text",
    parts: [slot("url"), "contains", slot("text")],
  },
  pay: {
    category: "money",
    name: "pay a party",
    parts: ["pay", slot("100%"), "to", slot("party")],
  },
  price: {
    category: "facts",
    name: "a price level",
    parts: [slot("SOL"), "price is", slot("above"), slot("200"), "USD"],
  },
  refund: {
    category: "money",
    name: "refund",
    parts: ["refund", slot("party")],
  },
  signed: {
    category: "people",
    name: "a party signs",
    parts: [slot("party"), "signs"],
  },
  split: {
    category: "money",
    name: "split between parties",
    parts: ["split between", slot("parties")],
  },
  unsigned: {
    category: "people",
    name: "a party has not signed",
    parts: [slot("party"), "has not signed"],
  },
  vote: {
    category: "people",
    name: "people confirm a statement",
    parts: [
      slot("2"),
      "of",
      { id: "a", slot: "wallet" },
      { id: "b", slot: "wallet" },
      { id: "c", slot: "wallet" },
      "confirm",
      slot("statement"),
    ],
  },
  wikidata: {
    category: "facts",
    name: "a Wikidata fact",
    parts: ["Wikidata:", slot("who or what"), slot("has a winner")],
  },
};

export const CATEGORIES: readonly {
  blocks: readonly PaletteKind[];
  key: Category;
  name: string;
}[] = [
  { blocks: ["after"], key: "time", name: "Time" },
  {
    blocks: ["signed", "unsigned", "vote", "judges"],
    key: "people",
    name: "People",
  },
  { blocks: ["merged", "green"], key: "github", name: "GitHub" },
  { blocks: ["price", "wikidata", "page", "api"], key: "facts", name: "Facts" },
  { blocks: ["pay", "split", "refund"], key: "money", name: "Money" },
];

const MONEY: readonly PaletteKind[] = ["pay", "split", "refund"];
const WINNER_STATEMENT = "This submission wins the bounty";
const VOTERS = 3;
const MAJORITY = 2;

export const isMoney = (kind: PaletteKind): kind is MoneyKind =>
  MONEY.includes(kind);

export const pieceOf = (kind: BlockKind): PieceType => {
  if (kind === "after" || kind === "signed" || kind === "unsigned") {
    return kind;
  }
  return "attested";
};

export const checkBlockOf = (check: DraftCheck): CheckBlock => {
  if (check.kind === "manual") {
    return check.binds === null ? "vote" : "judges";
  }
  if (check.kind === "github_pr_merged") {
    return "merged";
  }
  if (check.kind === "github_checks") {
    return "green";
  }
  const shape = factShape(check.target, check.expect);
  return shape.type === "json" ? "api" : shape.type;
};

export const blockOf = (condition: DraftCondition, draft: Draft): BlockKind => {
  if (condition.type !== "attested") {
    return condition.type;
  }
  const check = draft.checks.find((entry) => entry.id === condition.check);
  return check ? checkBlockOf(check) : "vote";
};

export const blankVoters = (word: string, count = VOTERS) =>
  Array.from({ length: count }, (_, position) => ({
    address: "",
    id: newId(),
    label: `${word} ${position + 1}`,
  }));

const blank = (patch: Partial<DraftCheck>): DraftCheck => ({
  binds: null,
  expect: "",
  id: newId(),
  kind: "manual",
  reviewers: [],
  target: "",
  threshold: 1,
  ...patch,
});

const fact = (target: string, expect: string) =>
  withOracle(blank({ expect, kind: "http_contains", target }));

const winnerOf = (draft: Draft) => {
  const open = draft.parties.find((party) => party.open);
  if (open) {
    return { draft, winner: open.id };
  }
  if (!canAddParty(draft)) {
    return null;
  }
  const next = addParty(draft, true);
  const winner = next.parties.at(-1)?.id;
  return winner ? { draft: next, winner } : null;
};

const checkFor = (
  draft: Draft,
  kind: CheckBlock
): { check: DraftCheck; draft: Draft } | null => {
  switch (kind) {
    case "vote":
      return {
        check: blank({
          reviewers: blankVoters("Reviewer"),
          threshold: MAJORITY,
        }),
        draft,
      };
    case "judges": {
      const found = winnerOf(draft);
      return found
        ? {
            check: blank({
              binds: found.winner,
              reviewers: blankVoters("Judge"),
              target: WINNER_STATEMENT,
              threshold: MAJORITY,
            }),
            draft: found.draft,
          }
        : null;
    }
    case "merged":
      return {
        check: withDemoNodes(blank({ kind: "github_pr_merged" })),
        draft,
      };
    case "green":
      return {
        check: withDemoNodes(
          blank({ expect: "success", kind: "github_checks" })
        ),
        draft,
      };
    case "price":
      return { check: fact("price:SOL-USD", ">"), draft };
    case "wikidata":
      return { check: fact("wikidata:/P1346", "exists"), draft };
    case "api":
      return { check: fact("#", "="), draft };
    default:
      return { check: fact("", ""), draft };
  }
};

export const canPlace = (draft: Draft, kind: PaletteKind) => {
  if (isMoney(kind)) {
    return true;
  }
  if (pieceOf(kind) !== "attested") {
    return true;
  }
  if (!canAddCheck(draft)) {
    return false;
  }
  return (
    kind !== "judges" ||
    canAddParty(draft) ||
    draft.parties.some((party) => party.open)
  );
};

const conditionFor = (
  draft: Draft,
  kind: BlockKind,
  now: number
): { condition: DraftCondition; draft: Draft } | null => {
  const piece = pieceOf(kind);
  if (piece !== "attested") {
    const condition = newCondition(piece, draft, now);
    return condition ? { condition, draft } : null;
  }
  if (!canAddCheck(draft)) {
    return null;
  }
  const made = checkFor(draft, kind as CheckBlock);
  if (!made) {
    return null;
  }
  return {
    condition: { check: made.check.id, id: newId(), type: "attested" },
    draft: { ...made.draft, checks: [...made.draft.checks, made.check] },
  };
};

const payee = (draft: Draft, taken: readonly DraftPayout[]) => {
  const used = new Set(taken.map((payout) => payout.party));
  const free = draft.parties.filter(
    (party) => !used.has(party.id) && party.id !== draft.funder
  );
  return free.find((party) => !party.open) ?? free[0] ?? null;
};

const applyMoney = (draft: Draft, ruleId: string, kind: MoneyKind): Draft => {
  const rule = draft.rules.find((entry) => entry.id === ruleId);
  if (!rule) {
    return draft;
  }
  if (kind === "refund") {
    return setPay(draft, ruleId, [{ bps: FULL, party: draft.funder }]);
  }
  if (kind === "split") {
    const named = draft.parties.filter((party) => !party.open);
    const everyone = named.length > 1 ? named : draft.parties;
    return setPay(
      draft,
      ruleId,
      splitEvenly(everyone.map((party) => ({ bps: 0, party: party.id })))
    );
  }
  const [only] = rule.pay;
  const fresh =
    rule.pay.length === 0 ||
    (rule.pay.length === 1 && only?.party === draft.funder);
  const found = payee(draft, fresh ? [] : rule.pay);
  if (found) {
    return setPay(
      draft,
      ruleId,
      fresh ? [{ bps: FULL, party: found.id }] : addPayout(rule.pay, found.id)
    );
  }
  if (!canAddParty(draft)) {
    return draft;
  }
  const next = addParty(draft, false);
  const created = next.parties.at(-1);
  return created
    ? setPay(next, ruleId, addPayout(fresh ? [] : rule.pay, created.id))
    : draft;
};

export const placeBlock = (
  draft: Draft,
  kind: PaletteKind,
  ruleId: string | null,
  now: number
): { draft: Draft; ruleId: string | null } => {
  const rule = draft.rules.find((entry) => entry.id === ruleId);
  if (isMoney(kind)) {
    return rule
      ? { draft: applyMoney(draft, rule.id, kind), ruleId: rule.id }
      : { draft, ruleId };
  }
  const made = conditionFor(draft, kind, now);
  if (!made) {
    return { draft, ruleId };
  }
  if (rule && canTake(rule, made.condition.type)) {
    return {
      draft: addCondition(made.draft, rule.id, made.condition),
      ruleId: rule.id,
    };
  }
  if (!canAddRule(made.draft)) {
    return { draft, ruleId };
  }
  const next = addRule(made.draft, made.condition);
  const created = next.rules.find((entry) =>
    entry.when.some((condition) => condition.id === made.condition.id)
  );
  return { draft: next, ruleId: created?.id ?? ruleId };
};

export const setShare = (
  draft: Draft,
  pay: readonly DraftPayout[],
  party: string,
  bps: number
): DraftPayout[] => {
  const wanted = Math.round(bps / SHARE_STEP) * SHARE_STEP;
  const others = pay.filter((payout) => payout.party !== party);
  if (others.length === 0) {
    const rest = payee(draft, pay)?.id ?? draft.funder;
    const heir = party === draft.funder ? rest : draft.funder;
    if (wanted >= FULL || wanted < SHARE_STEP || heir === party) {
      return [{ bps: FULL, party }];
    }
    return [
      { bps: wanted, party },
      { bps: FULL - wanted, party: heir },
    ];
  }
  const floor = (others.length - 1) * SHARE_STEP;
  const fixed = others.reduce((sum, payout) => sum + payout.bps, 0);
  let [donor] = others;
  for (const payout of others) {
    if (donor && payout.bps > donor.bps) {
      donor = payout;
    }
  }
  if (!donor) {
    return [...pay];
  }
  const kept = fixed - donor.bps;
  const next = Math.min(FULL - kept - SHARE_STEP, Math.max(SHARE_STEP, wanted));
  if (kept < floor) {
    return [...pay];
  }
  return pay.map((payout) => {
    if (payout.party === party) {
      return { ...payout, bps: next };
    }
    return payout.party === donor.party
      ? { ...payout, bps: FULL - kept - next }
      : payout;
  });
};

const copyCheck = (check: DraftCheck): DraftCheck => ({
  ...check,
  id: newId(),
  reviewers: check.reviewers.map((reviewer) => ({ ...reviewer, id: newId() })),
});

export const duplicateCondition = (
  draft: Draft,
  ruleId: string,
  conditionId: string
): Draft => {
  const rule = draft.rules.find((entry) => entry.id === ruleId);
  const source = rule?.when.find((entry) => entry.id === conditionId);
  if (!(rule && source)) {
    return draft;
  }
  let next = draft;
  let copy: DraftCondition = { ...source, id: newId() };
  if (source.type === "attested") {
    const check = draft.checks.find((entry) => entry.id === source.check);
    if (!(check && canAddCheck(draft))) {
      return draft;
    }
    const twin = copyCheck(check);
    next = { ...draft, checks: [...draft.checks, twin] };
    copy = { check: twin.id, id: copy.id, type: "attested" };
  }
  if (canTake(rule, copy.type)) {
    return addCondition(next, ruleId, copy);
  }
  return canAddRule(next) ? addRule(next, copy) : draft;
};

export const canDuplicate = (draft: Draft, condition: DraftCondition) =>
  condition.type !== "attested" || canAddCheck(draft);

export const duplicateRule = (draft: Draft, ruleId: string): Draft => {
  const index = draft.rules.findIndex((entry) => entry.id === ruleId);
  const rule = draft.rules[index];
  if (!(rule && canAddRule(draft))) {
    return draft;
  }
  const twin = {
    exit: false,
    id: newId(),
    pay: rule.pay.map((payout) => ({ ...payout })),
    when: rule.when.map((condition) => ({ ...condition, id: newId() })),
  };
  const rules = [...draft.rules];
  rules.splice(index + 1, 0, twin);
  return { ...draft, rules: exitLast(rules) };
};
