import { Segmented, SegmentedButton } from "@cladd-ui/react";
import {
  getSubscribeInstruction,
  lamportsToSol,
  SUBSCRIPTION_PERIOD_SECONDS,
  SUBSCRIPTION_PRICE_LAMPORTS,
} from "@pact/sdk";
import { useCallback, useMemo, useState } from "react";
import { type BuildInstruction, TxButton } from "@/components/shell/tx-button";
import { planKey, usePlan } from "@/lib/use-plan";

const DAY = 86_400;
const PERIOD_DAYS = SUBSCRIPTION_PERIOD_SECONDS / DAY;
const CHOICES = [1, 3, 12] as const;

interface PeriodButtonProps {
  active: boolean;
  onPick: (periods: number) => void;
  periods: number;
}

function PeriodButton({ periods, active, onPick }: PeriodButtonProps) {
  const pick = useCallback(() => onPick(periods), [onPick, periods]);
  return (
    <SegmentedButton active={active} aria-pressed={active} onClick={pick}>
      {periods * PERIOD_DAYS} days
    </SegmentedButton>
  );
}

export function GoPro() {
  const plan = usePlan();
  const [periods, setPeriods] = useState<number>(CHOICES[0]);
  const price = `${lamportsToSol(SUBSCRIPTION_PRICE_LAMPORTS * BigInt(periods))} SOL`;
  const verb = plan.kind === "pro" ? "Extend Pro" : "Go Pro";
  const build = useCallback<BuildInstruction>(
    (signer) => getSubscribeInstruction({ periods, user: signer }),
    [periods]
  );
  const invalidate = useMemo(
    () => [planKey(plan.wallet ?? ""), ["balance"] as const],
    [plan.wallet]
  );
  if (plan.wallet === null) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Segmented aria-label="How long" size="xl">
          {CHOICES.map((choice) => (
            <PeriodButton
              active={choice === periods}
              key={choice}
              onPick={setPeriods}
              periods={choice}
            />
          ))}
        </Segmented>
        <TxButton
          build={build}
          invalidate={invalidate}
          size="xl"
          txLabel={`${verb} for ${periods * PERIOD_DAYS} days`}
        >
          {verb}: {price}
        </TxButton>
      </div>
      <p className="text-cladd-fg-soft text-xs">
        Paid on chain to the Pact treasury. Deals stay free: no fee is ever
        taken from a deal.
      </p>
    </div>
  );
}
