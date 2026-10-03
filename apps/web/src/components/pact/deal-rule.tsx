import type {
  DealSpec,
  Payout as PayoutShare,
  RuleEvaluation,
} from "@pact/sdk";
import { ArrowRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Amount } from "@/components/pact/amount";
import { ConditionChip } from "@/components/pact/condition-chip";
import { Party } from "@/components/pact/party";
import { RuleBlock } from "@/components/pact/rule-block";
import { useTone } from "@/components/pact/tone";
import { formatShare } from "@/lib/format";
import {
  type ConditionState,
  describeCondition,
  isExitRule,
  partyLabel,
  payoutLamports,
  type RuleStatus,
} from "@/lib/pact";

interface DealRuleProps {
  action?: ReactNode;
  className?: string;
  evaluation?: RuleEvaluation;
  labels?: readonly string[];
  note?: ReactNode;
  now?: number;
  ruleIndex: number;
  showAddresses?: boolean;
  spec: DealSpec;
  status?: RuleStatus;
  viewer?: string | null;
  yesVotes?: readonly number[];
}

interface PayoutProps {
  labels?: readonly string[];
  share: PayoutShare;
  showAddresses?: boolean;
  spec: DealSpec;
  viewer?: string | null;
}

const FULL_SHARE = 10_000;

const chipState = (
  evaluation: RuleEvaluation | undefined,
  position: number
): ConditionState => {
  const result = evaluation?.conditions[position];
  if (!result) {
    return "static";
  }
  return result.holds ? "holds" : "pending";
};

export function Payout({
  share,
  spec,
  labels,
  viewer,
  showAddresses = true,
}: PayoutProps) {
  const tone = useTone();
  const address = spec.parties[share.party] ?? null;
  const soft = tone === "ink" ? "text-pact-ink/70" : "text-cladd-fg-soft";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`text-sm ${soft}`}>
        {share.party === spec.funder ? "refund" : "pay"}
      </span>
      {share.bps === FULL_SHARE ? null : (
        <span
          className={`font-display font-semibold text-sm tabular-nums ${tone === "ink" ? "text-pact-ink" : "text-cladd-fg"}`}
        >
          {formatShare(share.bps)}
        </span>
      )}
      <Amount lamports={payoutLamports(spec.amount, share.bps)} size="md" />
      <ArrowRight aria-label="to" className={soft} size={15} strokeWidth={2} />
      <Party
        address={showAddresses ? address : null}
        label={partyLabel(share.party, labels)}
        you={Boolean(viewer) && viewer === address}
      />
    </span>
  );
}

export function DealRule({
  spec,
  ruleIndex,
  evaluation,
  status,
  labels,
  now,
  yesVotes,
  viewer,
  showAddresses,
  action,
  note,
  className,
}: DealRuleProps) {
  const rule = spec.rules[ruleIndex];
  if (!rule) {
    return null;
  }
  const conditions = rule.when.map((condition) => ({
    key: JSON.stringify(condition),
    text: describeCondition(condition, spec, { labels, now, yesVotes }),
  }));
  return (
    <RuleBlock
      action={action}
      className={className}
      exit={isExitRule(rule)}
      index={ruleIndex}
      note={note}
      status={status}
      then={rule.pay.map((share) => (
        <Payout
          key={share.party}
          labels={labels}
          share={share}
          showAddresses={showAddresses}
          spec={spec}
          viewer={viewer}
        />
      ))}
      when={conditions.map(({ key, text }, position) => (
        <Fragment key={key}>
          {position > 0 ? (
            <span className="text-cladd-fg-soft text-sm">and</span>
          ) : null}
          <ConditionChip
            detail={text.detail}
            label={text.label}
            role={text.role}
            state={chipState(evaluation, position)}
          />
        </Fragment>
      ))}
    />
  );
}
