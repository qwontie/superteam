import { cn } from "@cladd-ui/react";
import { lamportsToSol } from "@pact/sdk";
import { type Tone, useTone } from "@/components/pact/tone";

export type AmountSize = "sm" | "md" | "lg" | "hero";

interface AmountProps {
  className?: string;
  lamports: bigint | string;
  size?: AmountSize;
  tone?: Tone;
}

const SIZE: Record<AmountSize, string> = {
  hero: "text-[clamp(3.5rem,9vw,6rem)] leading-[0.9] tracking-[-0.04em]",
  lg: "text-4xl leading-none tracking-[-0.03em]",
  md: "text-lg leading-none tracking-[-0.01em]",
  sm: "text-sm leading-none",
};

const UNIT: Record<AmountSize, string> = {
  hero: "ml-3 text-[0.3em] tracking-normal",
  lg: "ml-1.5 text-[0.45em] tracking-normal",
  md: "ml-1 text-[0.72em]",
  sm: "ml-1 text-[0.85em]",
};

export function Amount({
  lamports,
  size = "md",
  tone,
  className,
}: AmountProps) {
  const resolved = useTone(tone);
  const [whole, fraction] = lamportsToSol(lamports).split(".");
  const soft = resolved === "ink" ? "opacity-60" : "text-cladd-fg-soft";
  return (
    <span
      className={cn(
        "inline-flex items-baseline whitespace-nowrap font-display font-semibold tabular-nums",
        resolved === "ink" ? "text-pact-ink" : "text-cladd-fg",
        SIZE[size],
        className
      )}
    >
      <span>{whole}</span>
      {fraction ? <span className={soft}>.{fraction}</span> : null}
      <span className={cn("font-medium font-sans", soft, UNIT[size])}>SOL</span>
    </span>
  );
}
