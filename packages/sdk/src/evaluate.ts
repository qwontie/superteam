import type { Condition } from "./spec";
import type { DealState } from "./state";

export interface ConditionResult {
  condition: Condition;
  holds: boolean;
  reason: string;
}

export interface RuleEvaluation {
  blockedBy: string | null;
  canExecute: boolean;
  conditions: ConditionResult[];
  rule: number;
}

export interface DealEvaluation {
  executable: number[];
  rules: RuleEvaluation[];
}

const iso = (seconds: number) =>
  new Date(seconds * 1000).toISOString().replace(".000Z", "Z");

const duration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

const statusBlock = (deal: DealState) => {
  if (deal.status === "funded") {
    return null;
  }
  if (deal.status === "settled") {
    return `the deal is already settled by rule ${deal.settledRule}`;
  }
  return `the deal is ${deal.status}, only a funded deal can be executed`;
};

export const evaluateCondition = (
  deal: DealState,
  condition: Condition,
  now: number
): ConditionResult => {
  switch (condition.type) {
    case "after": {
      const holds = now >= condition.ts;
      const reason = holds
        ? `time ${iso(condition.ts)} has passed`
        : `opens at ${iso(condition.ts)}, in ${duration(condition.ts - now)}`;
      return { condition, holds, reason };
    }
    case "signed": {
      const at = deal.signals[condition.party] ?? null;
      const reason =
        at === null
          ? `party ${condition.party} has not signed`
          : `party ${condition.party} signed at ${iso(at)}`;
      return { condition, holds: at !== null, reason };
    }
    case "unsigned": {
      const at = deal.signals[condition.party] ?? null;
      const reason =
        at === null
          ? `party ${condition.party} has not signed`
          : `party ${condition.party} already signed at ${iso(at)}`;
      return { condition, holds: at === null, reason };
    }
    case "attested": {
      const check = deal.spec.checks[condition.check];
      const votes = deal.votes[condition.check];
      if (!(check && votes)) {
        return {
          condition,
          holds: false,
          reason: `check ${condition.check} does not exist`,
        };
      }
      const holds = votes.yes >= check.threshold;
      const reason = `${votes.yes} of ${check.witnesses.length} witnesses said yes, ${check.threshold} needed`;
      return { condition, holds, reason };
    }
    default:
      return condition satisfies never;
  }
};

export const evaluateRule = (
  deal: DealState,
  ruleIndex: number,
  now: number
): RuleEvaluation => {
  const rule = deal.spec.rules[ruleIndex];
  if (!rule) {
    return {
      blockedBy: `rule ${ruleIndex} does not exist`,
      canExecute: false,
      conditions: [],
      rule: ruleIndex,
    };
  }
  const conditions = rule.when.map((condition) =>
    evaluateCondition(deal, condition, now)
  );
  const blockedBy =
    statusBlock(deal) ??
    conditions.find((result) => !result.holds)?.reason ??
    null;
  return {
    blockedBy,
    canExecute: blockedBy === null,
    conditions,
    rule: ruleIndex,
  };
};

export const evaluateDeal = (deal: DealState, now: number): DealEvaluation => {
  const rules = deal.spec.rules.map((_, ruleIndex) =>
    evaluateRule(deal, ruleIndex, now)
  );
  const executable = rules
    .filter((rule) => rule.canExecute)
    .map((rule) => rule.rule);
  return { executable, rules };
};
