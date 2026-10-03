import { type Address, address } from "@solana/kit";
import type { ConditionArgs, CreateDealArgs, DealAccount } from "./codecs";
import { CHECK_KINDS, type Condition, type DealSpec } from "./spec";
import { type DealState, votesFromBitmaps } from "./state";

const conditionToArgs = (condition: Condition): ConditionArgs => {
  switch (condition.type) {
    case "after":
      return { __kind: "After", ts: BigInt(condition.ts) };
    case "signed":
      return { __kind: "Signed", party: condition.party };
    case "unsigned":
      return { __kind: "Unsigned", party: condition.party };
    case "attested":
      return { __kind: "Attested", check: condition.check };
    default:
      return condition satisfies never;
  }
};

const conditionFromAccount = (
  condition: DealAccount["rules"][number]["when"][number]
): Condition => {
  switch (condition.__kind) {
    case "After":
      return { ts: Number(condition.ts), type: "after" };
    case "Signed":
      return { party: condition.party, type: "signed" };
    case "Unsigned":
      return { party: condition.party, type: "unsigned" };
    case "Attested":
      return { check: condition.check, type: "attested" };
    default:
      return condition satisfies never;
  }
};

const checkKindName = (kind: number) => {
  const name = CHECK_KINDS[kind];
  if (!name) {
    throw new Error(`unknown check kind ${kind}`);
  }
  return name;
};

export const specToCreateArgs = (
  spec: DealSpec,
  dealId: bigint
): CreateDealArgs => ({
  amount: BigInt(spec.amount),
  checks: spec.checks.map((check) => ({
    expect: check.expect,
    kind: CHECK_KINDS.indexOf(check.kind),
    target: check.target,
    threshold: check.threshold,
    witnesses: check.witnesses.map((witness) => address(witness)),
  })),
  dealId,
  funder: spec.funder,
  parties: spec.parties.map((party) => address(party)),
  rules: spec.rules.map((rule) => ({
    pay: rule.pay,
    when: rule.when.map(conditionToArgs),
  })),
  title: spec.title,
});

export const accountToSpec = (account: DealAccount): DealSpec => ({
  amount: account.amount.toString(),
  checks: account.checks.map((check) => ({
    expect: check.expect,
    kind: checkKindName(check.kind),
    target: check.target,
    threshold: check.threshold,
    witnesses: [...check.witnesses],
  })),
  funder: account.funder,
  parties: [...account.parties],
  rules: account.rules.map((rule) => ({
    pay: rule.pay.map((payout) => ({ bps: payout.bps, party: payout.party })),
    when: rule.when.map(conditionFromAccount),
  })),
  title: account.title,
});

export const accountToState = (
  dealAddress: Address,
  account: DealAccount,
  lamports: bigint
): DealState => ({
  address: dealAddress,
  creator: account.creator,
  dealId: account.dealId,
  lamports,
  settledRule: account.settledRule,
  signals: account.signals.map((signal) =>
    signal === null ? null : Number(signal)
  ),
  spec: accountToSpec(account),
  status: account.status,
  votes: account.checks.map((check) =>
    votesFromBitmaps(check.yes, check.no, check.witnesses.length)
  ),
});
