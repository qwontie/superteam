import { cn } from "@cladd-ui/react";
import { type Tone, useTone } from "@/components/pact/tone";
import { shortAddress } from "@/lib/format";

export type PartySize = "sm" | "md";

interface PartyAvatarProps {
  className?: string;
  seed: string | null;
  size?: number;
}

interface PartyProps {
  address?: string | null;
  className?: string;
  label: string;
  size?: PartySize;
  tone?: Tone;
  you?: boolean;
}

const HUES = 360;
const TURN = 8;

const hash = (value: string) => {
  let result = 7;
  for (const char of value) {
    result = (result * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003;
  }
  return result;
};

export function PartyAvatar({ seed, size = 20, className }: PartyAvatarProps) {
  if (seed === null) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-block shrink-0 rounded-full border border-current border-dashed opacity-60",
          className
        )}
        style={{ height: size, width: size }}
      />
    );
  }
  const value = hash(seed);
  const hue = value % HUES;
  const second = (hue + 40 + (value % 140)) % HUES;
  const rotation = (value % TURN) * 45;
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0 rounded-full", className)}
      height={size}
      viewBox="0 0 20 20"
      width={size}
    >
      <rect fill={`oklch(0.8 0.14 ${hue})`} height="20" width="20" />
      <g transform={`rotate(${rotation} 10 10)`}>
        <rect
          fill={`oklch(0.5 0.17 ${second})`}
          height="20"
          width="10"
          x="10"
        />
        <circle cx="10" cy="10" fill={`oklch(0.93 0.07 ${hue})`} r="3.5" />
      </g>
    </svg>
  );
}

export function Party({
  address,
  label,
  size = "md",
  tone,
  you = false,
  className,
}: PartyProps) {
  const resolved = useTone(tone);
  const ink = resolved === "ink";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-full font-medium",
        size === "md" ? "h-8 pr-3 pl-1 text-sm" : "h-6 pr-2 pl-0.5 text-xs",
        ink
          ? "bg-pact-ink/12 text-pact-ink"
          : "bg-cladd-surface-hover text-cladd-fg shadow-cladd-outline",
        className
      )}
    >
      <PartyAvatar seed={address ?? label} size={size === "md" ? 24 : 18} />
      <span className="truncate">{label}</span>
      {address ? (
        <span
          className={cn(
            "font-mono font-normal text-[0.85em]",
            ink ? "opacity-70" : "text-cladd-fg-soft"
          )}
          title={address}
        >
          {shortAddress(address)}
        </span>
      ) : null}
      {you ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-px font-semibold text-[0.7em] uppercase",
            ink ? "bg-pact-ink text-pact-money" : "bg-cladd-fg text-cladd-bg"
          )}
        >
          You
        </span>
      ) : null}
    </span>
  );
}
