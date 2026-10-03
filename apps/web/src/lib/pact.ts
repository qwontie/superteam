import {
  type Condition,
  type DealSpec,
  type DealState,
  pactErrorByCode,
  type Rule,
  type RuleEvaluation,
} from "@pact/sdk";
import { formatCountdown, formatWhen } from "@/lib/format";

export type ConditionRole = "time" | "people" | "proof";
export type ConditionState = "static" | "pending" | "holds";
export type RuleStatus = "idle" | "waiting" | "armed" | "fired" | "lost";

export interface ConditionText {
  detail: string | null;
  label: string;
  role: ConditionRole;
}

export interface DescribeOptions {
  labels?: readonly string[];
  now?: number;
  yesVotes?: readonly number[];
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
    case "attested": {
      const check = spec.checks[condition.check];
      if (!check) {
        return { detail: null, label: "missing check", role };
      }
      const yes = options.yesVotes?.[condition.check];
      const total = check.witnesses.length;
      return {
        detail: yes === undefined ? null : `${yes} so far`,
        label:
          total === 1
            ? "the witness says yes"
            : `${check.threshold} of ${total} witnesses say yes`,
        role,
      };
    }
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

export const partyLabels = (spec: DealSpec): string[] =>
  spec.parties.map((_, index) => {
    if (index === spec.funder) {
      return spec.parties.length === 2 ? "Client" : "Funder";
    }
    return spec.parties.length === 2 ? "Freelancer" : `Party ${index + 1}`;
  });

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
