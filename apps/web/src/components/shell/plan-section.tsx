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
      return `Pro until ${formatDay(plan.expiresAt ?? 0)}`;
    case "free":
      return plan.expiresAt === null
        ? "Free plan"
        : `Pro ended ${formatDay(plan.expiresAt)}`;
    case "unknown":
      return "Could not read your plan from devnet";
    default:
      return "Reading your plan";
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
          10 free AI drafts a day, no limit on Pro.
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
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  if (plan.kind === "none") {
    return null;
  }
  const settled = plan.kind === "pro" || plan.kind === "free";
  const verb = plan.kind === "pro" ? "Extend" : "Go Pro";
  const toggleLabel = open ? "Not now" : verb;
  return (
    <section aria-label="Plan" className="flex flex-col gap-3 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-sm">{planLine(plan)}</span>
        {settled ? (
          <Button
            aria-expanded={open}
            className="shrink-0 whitespace-nowrap"
            onClick={toggle}
            size="xl"
          >
            {toggleLabel}
          </Button>
        ) : null}
      </div>
      {open && plan.kind === "free" ? <FreeDrafts /> : null}
      {open && settled ? <GoPro /> : null}
    </section>
  );
}
