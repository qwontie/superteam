import { lamportsToSol } from "@pact/sdk";
import { describeCheckFact } from "@pact/sdk/facts";
import { checkBlockOf } from "@/features/builder/blocks";
import { factGap, factShape, knownLabel } from "@/features/builder/facts";
import type {
  Draft,
  DraftCheck,
  DraftCondition,
  DraftPayout,
  DraftRule,
} from "@/features/builder/model";
import { amountLamports, FULL } from "@/features/builder/model";
import { formatShare, formatWhen } from "@/lib/format";
import {
  type ConditionRole,
  type ConditionText,
  payoutLamports,
} from "@/lib/pact";

const FIRST_LETTER = /^[a-z]/;

export const partyName = (draft: Draft, id: string) => {
  const index = draft.parties.findIndex((party) => party.id === id);
  if (index < 0) {
    return "someone removed";
  }
  return draft.parties[index]?.label.trim() || `Party ${index + 1}`;
};

export const checkName = (draft: Draft, id: string) => {
  const index = draft.checks.findIndex((check) => check.id === id);
  return index < 0 ? "a removed check" : `Check ${index + 1}`;
};

export const slotGap = (check: DraftCheck) =>
  check.kind === "http_contains"
    ? factGap(factShape(check.target, check.expect))
    : check.target.trim() === "";

const entityOf = (check: DraftCheck) => {
  const shape = factShape(check.target, check.expect);
  return shape.type === "wikidata" ? shape.entity : "";
};

export const checkLabel = (check: DraftCheck, short = false) => {
  const count = `${check.threshold} of ${check.reviewers.length}`;
  switch (checkBlockOf(check)) {
    case "vote":
      return short
        ? `${count} people confirm`
        : `${count} people confirm "${check.target.trim()}"`;
    case "judges":
      return `${count} judges name the winner`;
    case "merged":
      return `pull request ${check.target.trim()} is merged`;
    case "green":
      return `checks are green on ${check.target.trim()}`;
    default:
      return describeCheckFact(check.target.trim(), check.expect.trim(), {
        label: knownLabel(entityOf(check)),
      });
  }
};

export const conditionRoleOf = (condition: DraftCondition): ConditionRole => {
  if (condition.type === "after") {
    return "time";
  }
  if (condition.type === "attested") {
    return "proof";
  }
  return "people";
};

export const conditionText = (
  condition: DraftCondition,
  draft: Draft,
  short = false
): ConditionText => {
  const role = conditionRoleOf(condition);
  if (condition.type === "after") {
    return { detail: null, label: `after ${formatWhen(condition.ts)}`, role };
  }
  if (condition.type === "attested") {
    const check = draft.checks.find((entry) => entry.id === condition.check);
    return {
      detail: null,
      label: check ? checkLabel(check, short) : "a check that was removed",
      role,
    };
  }
  const name = partyName(draft, condition.party);
  return {
    detail: null,
    label:
      condition.type === "signed" ? `${name} signs` : `${name} has not signed`,
    role,
  };
};

export const payoutAmount = (draft: Draft, bps: number) => {
  const lamports = amountLamports(draft.amount);
  return lamports === null ? null : payoutLamports(lamports, bps);
};

const sol = (lamports: bigint) => `${lamportsToSol(lamports)} SOL`;

const payoutPhrase = (draft: Draft, payout: DraftPayout, alone: boolean) => {
  const name = partyName(draft, payout.party);
  const amount = payoutAmount(draft, payout.bps);
  const back = payout.party === draft.funder;
  if (alone && payout.bps === FULL) {
    if (amount === null) {
      return back ? `${name} gets everything back` : `${name} gets everything`;
    }
    return back
      ? `${name} gets the ${sol(amount)} back`
      : `${name} gets ${sol(amount)}`;
  }
  const share = formatShare(payout.bps);
  const value = amount === null ? share : `${share} (${sol(amount)})`;
  return back ? `${name} gets ${value} back` : `${name} gets ${value}`;
};

const joinAnd = (parts: string[]) => {
  if (parts.length <= 1) {
    return parts.join("");
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
};

const capital = (text: string) =>
  text.replace(FIRST_LETTER, (letter) => letter.toUpperCase());

export const readPayouts = (rule: DraftRule, draft: Draft) =>
  joinAnd(
    rule.pay.map((payout) => payoutPhrase(draft, payout, rule.pay.length === 1))
  );

export const readRule = (rule: DraftRule, draft: Draft) => {
  const conditions = rule.when.map(
    (condition) => conditionText(condition, draft).label
  );
  const payouts = readPayouts(rule, draft);
  if (conditions.length === 0) {
    return "This rule has no condition yet, so it can never fire.";
  }
  if (rule.pay.length === 0) {
    return `${capital(joinAnd(conditions))}, but nobody is paid yet.`;
  }
  if (rule.exit) {
    return `${capital(joinAnd(conditions))}, anyone can close the deal and ${payouts}. No signature needed.`;
  }
  return `When ${joinAnd(conditions)}, ${payouts}.`;
};
