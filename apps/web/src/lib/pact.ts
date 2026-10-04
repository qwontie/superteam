import {
  type CheckVotes,
  type Condition,
  type DealSpec,
  type DealState,
  leadingNominee,
  pactErrorByCode,
  type Rule,
  type RuleEvaluation,
} from "@pact/sdk";
import { type ConditionMark, checkFact } from "@/lib/checks";
import { formatCountdown, formatWhen } from "@/lib/format";

export type ConditionRole = "time" | "people" | "proof";
export type { ConditionMark } from "@/lib/checks";
export type ConditionState = "static" | "pending" | "holds";
export type RuleStatus = "idle" | "waiting" | "armed" | "fired" | "lost";

export interface ConditionText {
  detail: string | null;
  label: string;
  mark?: ConditionMark;
  role: ConditionRole;
}

export interface DescribeOptions {
  factLabels?: ReadonlyMap<number, string>;
  labels?: readonly string[];
  now?: number;
  oracles?: ReadonlySet<number>;
  votes?: readonly CheckVotes[];
}

const TOTAL_BPS = 10_000n;
const DEFAULT_LABELS = ["Client", "Freelancer", "Party 3", "Party 4"];

export const partyLabel = (index: number, labels?: readonly string[]) =>
  labels?.[index] ?? DEFAULT_LABELS[index] ?? `Party ${index + 1}`;

export const conditionRole = (condition: Condition): ConditionRole => {
  if (condition.type === "after") {
    return "time";
  }
  if (condition.type === "attested") {
    return "proof";
  }
  return "people";
};

const describeAttested = (
  checkIndex: number,
  spec: DealSpec,
  allVotes: readonly CheckVotes[] | undefined,
  oracle: boolean,
  factLabel: string | undefined
): ConditionText => {
  const check = spec.checks[checkIndex];
  if (!check) {
    return { detail: null, label: "missing check", role: "proof" };
  }
  const votes = allVotes?.[checkIndex];
  const total = check.witnesses.length;
  const fact = checkFact(check, factLabel);
  const role: ConditionRole = fact.automated ? "proof" : "people";
  const mark = fact.mark ?? undefined;
  if (fact.fact) {
    const counted = votes && !oracle && total > 1;
    return {
      detail: counted ? `${votes.yes} of ${check.threshold} nodes` : null,
      label: fact.statement,
      mark,
      role,
    };
  }
  if (oracle) {
    return {
      detail: null,
      label: `Switchboard oracles ${fact.verb.many}`,
      mark,
      role,
    };
  }
  const who = fact.automated ? "node" : "witness";
  const label =
    total === 1
      ? `the ${who} ${fact.verb.one}`
      : `${check.threshold} of ${total} ${who === "node" ? "nodes" : "witnesses"} ${fact.verb.many}`;
  if (typeof check.binds === "number") {
    const leader = votes ? leadingNominee(votes) : null;
    return {
      detail: votes ? `${leader?.votes ?? 0} agree so far` : null,
      label,
      mark,
      role,
    };
  }
  return { detail: votes ? `${votes.yes} so far` : null, label, mark, role };
};

export const describeCondition = (
  condition: Condition,
  spec: DealSpec,
  options: DescribeOptions = {}
): ConditionText => {
  const role = conditionRole(condition);
  switch (condition.type) {
    case "after": {
      const left =
        options.now === undefined ? null : condition.ts - options.now;
      return {
        detail:
          left !== null && left > 0 ? `in ${formatCountdown(left)}` : null,
        label: `after ${formatWhen(condition.ts)}`,
        role,
      };
    }
    case "signed":
      return {
        detail: null,
        label: `${partyLabel(condition.party, options.labels)} signs`,
        role,
      };
    case "unsigned":
      return {
        detail: null,
        label: `${partyLabel(condition.party, options.labels)} has not signed`,
        role,
      };
    case "attested":
      return describeAttested(
        condition.check,
        spec,
        options.votes,
        options.oracles?.has(condition.check) ?? false,
        options.factLabels?.get(condition.check)
      );
    default:
      return condition satisfies never;
  }
};

export const isExitRule = (rule: Rule) =>
  rule.when.every((condition) => condition.type === "after");

export const ruleStatus = (
  deal: Pick<DealState, "settledRule" | "status">,
  evaluation: RuleEvaluation
): RuleStatus => {
  if (deal.status === "settled") {
    return deal.settledRule === evaluation.rule ? "fired" : "lost";
  }
  if (deal.status === "cancelled") {
    return "lost";
  }
  if (deal.status === "draft") {
    return "idle";
  }
  return evaluation.canExecute ? "armed" : "waiting";
};

export const payoutLamports = (amount: bigint | string, bps: number) =>
  (BigInt(amount) * BigInt(bps)) / TOTAL_BPS;

export const programError = (code: number) => pactErrorByCode(code);

export const partyLabels = (spec: DealSpec): string[] => {
  const bound = new Set(
    spec.checks
      .map((check) => check.binds)
      .filter((slot): slot is number => typeof slot === "number")
  );
  const pair = spec.parties.length === 2;
  return spec.parties.map((_, index) => {
    if (bound.has(index)) {
      return bound.size === 1 ? "Winner" : `Winner ${index}`;
    }
    if (index === spec.funder) {
      if (bound.size > 0) {
        return "Sponsor";
      }
      return pair ? "Client" : "Funder";
    }
    return pair ? "Freelancer" : `Party ${index + 1}`;
  });
};

export interface WitnessSeat {
  check: number;
  position: number;
}

export interface WalletRoles {
  creator: boolean;
  funder: boolean;
  named: boolean;
  party: number | null;
  witness: WitnessSeat[];
}

export const walletRoles = (
  deal: Pick<DealState, "creator" | "spec">,
  wallet: string | null
): WalletRoles => {
  const partyIndex = wallet ? deal.spec.parties.indexOf(wallet) : -1;
  const witness: WitnessSeat[] = [];
  if (wallet) {
    for (const [check, entry] of deal.spec.checks.entries()) {
      const position = entry.witnesses.indexOf(wallet);
      if (position >= 0) {
        witness.push({ check, position });
      }
    }
  }
  const creator = wallet !== null && deal.creator === wallet;
  return {
    creator,
    funder: partyIndex >= 0 && partyIndex === deal.spec.funder,
    named: creator || partyIndex >= 0 || witness.length > 0,
    party: partyIndex >= 0 ? partyIndex : null,
    witness,
  };
};

export const signatureMatters = (
  deal: Pick<DealState, "spec">,
  party: number
) =>
  deal.spec.rules.some((rule) =>
    rule.when.some(
      (condition) =>
        (condition.type === "signed" || condition.type === "unsigned") &&
        condition.party === party
    )
  );
