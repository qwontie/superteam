import { cn } from "@cladd-ui/react";
import type { DealStatus } from "@pact/sdk";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Amount, type AmountSize } from "@/components/pact/amount";
import { FLIGHT, QUICK } from "@/components/pact/motion";

interface StatusPillProps {
  className?: string;
  status: DealStatus;
}

interface VaultAmountProps {
  flightId: string;
  lamports: bigint | string;
  size?: AmountSize;
  status: DealStatus;
}

interface FiredNoteProps {
  children?: ReactNode;
  flightId: string;
  lamports: bigint | string;
}

const STATUS_TEXT: Record<DealStatus, string> = {
  cancelled: "Cancelled",
  draft: "Not funded yet",
  funded: "Locked in the vault",
  settled: "Settled",
};

const STATUS_CLASS: Record<DealStatus, string> = {
  cancelled:
    "text-cladd-fg-soft shadow-[inset_0_0_0_1px_var(--color-cladd-outline)]",
  draft:
    "text-cladd-fg-soft shadow-[inset_0_0_0_1px_var(--color-cladd-outline)]",
  funded:
    "text-pact-money shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-pact-money)_40%,transparent)]",
  settled: "bg-pact-money text-pact-ink",
};

const EMPTY_SIZE: Record<AmountSize, string> = {
  hero: "text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.95] tracking-[-0.03em]",
  lg: "text-4xl leading-none tracking-[-0.03em]",
  md: "text-lg leading-none",
  sm: "text-sm leading-none",
};

export function StatusPill({ status, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 font-medium text-xs transition-colors duration-300",
        STATUS_CLASS[status],
        className
      )}
    >
      {STATUS_TEXT[status]}
    </span>
  );
}

export function VaultAmount({
  lamports,
  status,
  flightId,
  size = "lg",
}: VaultAmountProps) {
  if (status === "settled" || status === "cancelled") {
    return (
      <motion.span
        animate={{ opacity: 1 }}
        className={cn(
          "font-display font-semibold text-cladd-fg-softer",
          EMPTY_SIZE[size]
        )}
        initial={{ opacity: 0 }}
        transition={QUICK}
      >
        Vault is empty
      </motion.span>
    );
  }
  return (
    <motion.span
      className="inline-flex"
      layoutId={flightId}
      transition={FLIGHT}
    >
      <Amount lamports={lamports} size={size} />
    </motion.span>
  );
}

export function FiredNote({ lamports, flightId, children }: FiredNoteProps) {
  return (
    <motion.p
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-pact-ink text-sm"
      initial={{ opacity: 0, y: 6 }}
      transition={{ ...QUICK, delay: 0.45 }}
    >
      <motion.span
        className="inline-flex"
        layoutId={flightId}
        transition={FLIGHT}
      >
        <Amount lamports={lamports} size="md" tone="ink" />
      </motion.span>
      left the vault. No one approved it.
      {children}
    </motion.p>
  );
}
