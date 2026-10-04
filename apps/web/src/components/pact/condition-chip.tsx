import { cn } from "@cladd-ui/react";
import {
  Check,
  Clock3,
  Eye,
  GitMerge,
  Globe,
  type LucideIcon,
  PenLine,
  TrendingUp,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SNAP } from "@/components/pact/motion";
import type { ConditionMark, ConditionRole, ConditionState } from "@/lib/pact";

interface ConditionChipProps {
  className?: string;
  detail?: string | null;
  label: string;
  mark?: ConditionMark | null;
  role: ConditionRole;
  state?: ConditionState;
}

const ROLE_CLASS: Record<ConditionRole, string> = {
  people: "pact-role-people",
  proof: "pact-role-proof",
  time: "pact-role-time",
};

const ROLE_ICON = {
  people: PenLine,
  proof: Eye,
  time: Clock3,
} as const;

const MARK_ICON: Record<ConditionMark, LucideIcon> = {
  fact: Globe,
  github: GitMerge,
  price: TrendingUp,
  vote: Users,
};

const CODE = "[--pact-role:oklch(0.8_0.12_258)]";

const STATE_TEXT: Record<ConditionState, string | null> = {
  holds: "true now",
  pending: "not true yet",
  static: null,
};

export function ConditionChip({
  role,
  label,
  detail,
  mark,
  state = "static",
  className,
}: ConditionChipProps) {
  const Icon = mark ? MARK_ICON[mark] : ROLE_ICON[role];
  const holds = state === "holds";
  return (
    <span
      className={cn(
        "relative inline-flex min-h-8 max-w-full items-center gap-2 rounded-chip py-1 pr-3 pl-1.5 font-medium text-sm transition-colors duration-200 ease-pact",
        ROLE_CLASS[role],
        mark === "github" && CODE,
        holds
          ? "bg-(--pact-role) text-pact-ink"
          : "bg-[color-mix(in_oklab,var(--pact-role)_13%,transparent)] text-(--pact-role) shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--pact-role)_34%,transparent)]",
        className
      )}
      data-state={state}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative grid size-5 shrink-0 place-items-center rounded-[6px]",
          holds
            ? "bg-pact-ink text-(--pact-role)"
            : "shadow-[inset_0_0_0_1.5px_currentColor]"
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            animate={{ opacity: 1, scale: 1 }}
            className="grid place-items-center"
            exit={{ opacity: 0, scale: 0.4 }}
            initial={{ opacity: 0, scale: 0.4 }}
            key={holds ? "holds" : "open"}
            transition={SNAP}
          >
            {holds ? (
              <Check size={13} strokeWidth={3} />
            ) : (
              <Icon size={12} strokeWidth={2.25} />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="min-w-0">{label}</span>
      {detail ? (
        <span
          className={cn(
            "whitespace-nowrap font-normal tabular-nums",
            holds ? "opacity-70" : "opacity-80"
          )}
        >
          {detail}
        </span>
      ) : null}
      {STATE_TEXT[state] ? (
        <span className="sr-only">, {STATE_TEXT[state]}</span>
      ) : null}
    </span>
  );
}
