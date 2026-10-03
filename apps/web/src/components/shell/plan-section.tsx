import { Button } from "@cladd-ui/react";
import { useCallback, useState } from "react";
import { GoPro } from "@/components/shell/go-pro";
import { formatDay } from "@/lib/format";
import { type Plan, usePlan } from "@/lib/use-plan";
import { useQuota } from "@/lib/use-quota";
import { useWalletProof } from "@/lib/wallet-proof";

const TAG =
  "rounded-full px-1.5 py-px font-semibold text-[0.65rem] uppercase leading-4";

const planLine = (plan: Plan) => {
  switch (plan.kind) {
    case "pro":
      return `Pro until ${formatDay(plan.expiresAt ?? 0)}. AI drafts without the free limit.`;
    case "free":
      return plan.expiresAt === null
        ? "Deals are always free. Pro lifts the limit on AI drafts."
        : `Pro ended ${formatDay(plan.expiresAt)}. Deals are always free.`;
    case "unknown":
      return "Could not read your plan from devnet.";
    default:
      return "Reading your plan from devnet";
  }
};

function FreeDrafts() {
  const { proof, request, signing } = useWalletProof();
  const quota = useQuota();
  const ask = useCallback(() => {
    request().catch(() => undefined);
  }, [request]);
  if (!proof) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-cladd-fg-soft text-xs">
          10 free AI drafts a day.
        </span>
        <Button loading={signing} onClick={ask} size="xl" variant="transparent">
          Show what is left
        </Button>
      </div>
    );
  }
  if (quota.isError) {
    return (
      <span className="text-cladd-fg-soft text-xs">
        Could not read your AI drafts. The AI service did not answer.
      </span>
    );
  }
  if (!quota.data || quota.data.remaining === null) {
    return null;
  }
  return (
    <span className="text-cladd-fg-soft text-xs">
      <span className="font-medium text-cladd-fg tabular-nums">
        {quota.data.remaining} of {quota.data.limit}
      </span>{" "}
      free AI drafts left today.
    </span>
  );
}

export function PlanTag() {
  const plan = usePlan();
  if (plan.kind !== "pro") {
    return null;
  }
  return <span className={`${TAG} bg-cladd-fg text-cladd-bg`}>Pro</span>;
}

export function PlanSection() {
  const plan = usePlan();
  const [extending, setExtending] = useState(false);
  const toggle = useCallback(() => setExtending((open) => !open), []);
  if (plan.kind === "none") {
    return null;
  }
  const settled = plan.kind === "pro" || plan.kind === "free";
  const showControl =
    plan.kind === "free" || (plan.kind === "pro" && extending);
  return (
    <section aria-label="Plan" className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 font-medium text-sm">
            Plan
            {settled ? (
              <span
                className={
                  plan.kind === "pro"
                    ? `${TAG} bg-cladd-fg text-cladd-bg`
                    : `${TAG} text-cladd-fg-soft shadow-[inset_0_0_0_1px_var(--color-cladd-outline)]`
                }
              >
                {plan.kind === "pro" ? "Pro" : "Free"}
              </span>
            ) : null}
          </span>
          <span className="text-cladd-fg-soft text-xs">{planLine(plan)}</span>
        </div>
        {plan.kind === "pro" ? (
          <Button
            aria-expanded={extending}
            className="shrink-0 whitespace-nowrap"
            onClick={toggle}
            size="xl"
          >
            {extending ? "Not now" : "Extend"}
          </Button>
        ) : null}
      </div>
      {plan.kind === "free" ? <FreeDrafts /> : null}
      {showControl ? <GoPro /> : null}
    </section>
  );
}
