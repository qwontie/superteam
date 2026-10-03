import type { z } from "zod";
import {
  type Condition,
  type DealSpec,
  DealSpecSchema,
  LIMITS,
  type Rule,
} from "./spec";

export type ValidationResult =
  | { ok: true; spec: DealSpec; problems: [] }
  | { ok: false; problems: string[] };

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export const exitTime = (rule: Rule): number | null => {
  const times: number[] = [];
  for (const condition of rule.when) {
    if (condition.type !== "after") {
      return null;
    }
    times.push(condition.ts);
  }
  return Math.max(...times);
};

const formatPath = (path: PropertyKey[]) =>
  path.reduce<string>((text, key) => {
    if (typeof key === "number") {
      return `${text}[${key}]`;
    }
    return text ? `${text}.${String(key)}` : String(key);
  }, "");

const issueText = (issue: z.core.$ZodIssue) => {
  const path = formatPath(issue.path);
  return path ? `${path}: ${issue.message}` : issue.message;
};

const firstDuplicate = (values: string[]) =>
  values.find((value, position) => values.indexOf(value) !== position);

const conditionProblem = (
  condition: Condition,
  spec: DealSpec,
  path: string
) => {
  const parties = spec.parties.length;
  const checks = spec.checks.length;
  if (
    (condition.type === "signed" || condition.type === "unsigned") &&
    condition.party >= parties
  ) {
    return `${path}: party ${condition.party} does not exist, the deal has ${parties} parties`;
  }
  if (condition.type === "attested" && condition.check >= checks) {
    return `${path}: check ${condition.check} does not exist, the deal has ${checks} checks`;
  }
  return null;
};

const ruleProblems = (rule: Rule, ruleIndex: number, spec: DealSpec) => {
  const problems: string[] = [];
  for (const [position, condition] of rule.when.entries()) {
    const problem = conditionProblem(
      condition,
      spec,
      `rules[${ruleIndex}].when[${position}]`
    );
    if (problem) {
      problems.push(problem);
    }
  }
  for (const [position, payout] of rule.pay.entries()) {
    if (payout.party >= spec.parties.length) {
      problems.push(
        `rules[${ruleIndex}].pay[${position}]: party ${payout.party} does not exist, the deal has ${spec.parties.length} parties`
      );
    }
  }
  const total = rule.pay.reduce((sum, payout) => sum + payout.bps, 0);
  if (total !== LIMITS.totalBps) {
    problems.push(
      `rules[${ruleIndex}].pay: shares add up to ${total} bps, they must add up to ${LIMITS.totalBps} (100%)`
    );
  }
  return problems;
};

const exitProblem = (spec: DealSpec, now: number) => {
  const exits = spec.rules.map(exitTime).filter((time) => time !== null);
  if (exits.length === 0) {
    return 'rules: the deal needs an exit rule made only of "after" conditions, so the money can never get stuck';
  }
  const latest = Math.max(...exits);
  if (latest <= now) {
    return `rules: the exit rule opens at ${new Date(latest * 1000).toISOString()}, which is not in the future`;
  }
  return null;
};

export const dealSpecProblems = (
  spec: DealSpec,
  now: number = nowSeconds()
) => {
  const problems: string[] = [];
  const parties = spec.parties.length;
  if (spec.funder >= parties) {
    problems.push(
      `funder: party ${spec.funder} does not exist, the deal has ${parties} parties`
    );
  }
  const duplicateParty = firstDuplicate(spec.parties);
  if (duplicateParty) {
    problems.push(`parties: ${duplicateParty} appears more than once`);
  }
  for (const [position, check] of spec.checks.entries()) {
    const witnesses = check.witnesses.length;
    if (check.threshold < 1 || check.threshold > witnesses) {
      problems.push(
        `checks[${position}].threshold: must be between 1 and ${witnesses} (the number of witnesses), got ${check.threshold}`
      );
    }
    const duplicateWitness = firstDuplicate(check.witnesses);
    if (duplicateWitness) {
      problems.push(
        `checks[${position}].witnesses: ${duplicateWitness} appears more than once`
      );
    }
  }
  for (const [position, rule] of spec.rules.entries()) {
    problems.push(...ruleProblems(rule, position, spec));
  }
  const exit = exitProblem(spec, now);
  if (exit) {
    problems.push(exit);
  }
  return problems;
};

export const validateDealSpec = (
  input: unknown,
  now: number = nowSeconds()
): ValidationResult => {
  const parsed = DealSpecSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map(issueText) };
  }
  const problems = dealSpecProblems(parsed.data, now);
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return { ok: true, problems: [], spec: parsed.data };
};
