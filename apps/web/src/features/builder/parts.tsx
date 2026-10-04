import { Button, cn, Input } from "@cladd-ui/react";
import { isAddress } from "@solana/kit";
import { CircleAlert, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { QUICK } from "@/components/pact/motion";
import { Party, PartyAvatar } from "@/components/pact/party";
import { useTone } from "@/components/pact/tone";
import { errorsAt } from "@/features/builder/problems";
import { useBuilder } from "@/features/builder/state";

const ANCHOR_UNSAFE = /[^a-z0-9]+/gi;

export const anchorId = (anchor: string) =>
  `builder-${anchor.replace(ANCHOR_UNSAFE, "-")}`;

export const REVEAL =
  "opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-focus-within/rule:opacity-100 group-hover/rule:opacity-100 [@media(hover:none)]:opacity-60";

export const pickedClass = (picked: boolean) =>
  picked
    ? "shadow-[inset_0_0_0_1.5px_var(--color-cladd-fg)]"
    : "text-cladd-fg-soft";

export const POPOVER_BODY =
  "flex max-h-[min(36rem,calc(100dvh-6rem))] flex-col gap-3 overflow-y-auto p-4";

const targetOf = (anchor: string) =>
  document.getElementById(anchorId(anchor)) ??
  document.querySelector<HTMLElement>(`[data-anchor="${anchor}"]`) ??
  document.querySelector<HTMLElement>(`[data-anchor-block="${anchor}"]`);

const FAR = Number.MAX_SAFE_INTEGER;

export const topmost = (anchorList: readonly string[]) => {
  let best: string | undefined;
  let bestTop = FAR;
  for (const anchor of anchorList) {
    const top = targetOf(anchor)?.getBoundingClientRect().top ?? FAR - 1;
    if (top < bestTop) {
      best = anchor;
      bestTop = top;
    }
  }
  return best;
};

export const jumpTo = (anchor: string) => {
  const target = targetOf(anchor);
  if (!target) {
    window.scrollTo({ behavior: "smooth", top: 0 });
    return;
  }
  target.scrollIntoView({ block: "center" });
  target.focus({ preventScroll: true });
  if (target instanceof HTMLButtonElement) {
    target.click();
  }
};

export function ProblemLines({
  anchor,
  className,
}: {
  anchor: string;
  className?: string;
}) {
  const { validation, locked } = useBuilder();
  const problems = locked ? [] : errorsAt(validation.problems, anchor);
  return (
    <AnimatePresence initial={false}>
      {problems.length > 0 ? (
        <motion.ul
          animate={{ opacity: 1 }}
          className={cn("flex flex-col gap-1", className)}
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={QUICK}
        >
          {problems.map((problem) => (
            <li
              className="flex items-start gap-2 text-pact-stop text-sm"
              key={problem.key}
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={15}
              />
              <span>{problem.text}</span>
            </li>
          ))}
        </motion.ul>
      ) : null}
    </AnimatePresence>
  );
}

interface SlotPillProps {
  address: string;
  empty: string;
  label: string;
  open?: boolean;
  you?: boolean;
}

const pillTone = (broken: boolean, ink: boolean) => {
  if (ink) {
    return { frame: "border-pact-ink/45 text-pact-ink", soft: "opacity-70" };
  }
  if (broken) {
    return { frame: "border-pact-stop text-pact-stop", soft: "text-pact-stop" };
  }
  return {
    frame: "border-cladd-fg-softer text-cladd-fg",
    soft: "text-cladd-fg-soft",
  };
};

export function SlotPill({ address, empty, label, open, you }: SlotPillProps) {
  const ink = useTone() === "ink";
  const value = address.trim();
  if (!open && value !== "" && isAddress(value)) {
    return <Party address={value} label={label} you={you} />;
  }
  const broken = !open && value !== "";
  const tone = pillTone(broken, ink);
  const hint = broken ? "check the address" : empty;
  return (
    <span
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-2 whitespace-nowrap rounded-full border border-dashed pr-3 pl-1 font-medium text-sm",
        tone.frame
      )}
    >
      {open ? (
        <PartyAvatar seed={null} size={24} />
      ) : (
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full",
            ink ? "bg-pact-ink/12" : "bg-cladd-surface-hover text-cladd-fg-soft"
          )}
        >
          <Plus aria-hidden="true" size={14} />
        </span>
      )}
      <span className="truncate">{label}</span>
      <span className={cn("font-normal", tone.soft)}>{hint}</span>
    </span>
  );
}

interface AddressFieldProps {
  autoFocus?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}

export const useQuietFocus = (enabled: boolean) => {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (enabled) {
      holder.current?.querySelector("input")?.focus({ preventScroll: true });
    }
  }, [enabled]);
  return holder;
};

export function AddressField({
  autoFocus,
  label,
  onChange,
  value,
}: AddressFieldProps) {
  const holder = useQuietFocus(autoFocus === true);
  const trimmed = value.trim();
  const invalid = trimmed !== "" && !isAddress(trimmed);
  return (
    <div ref={holder}>
      <Input
        errorMessage={
          invalid ? "This is not a Solana address. Paste the full one." : null
        }
        inputClassName="font-mono text-sm"
        inputComponentProps={{ "aria-label": label }}
        onChange={onChange}
        placeholder="Paste a Solana address"
        size="xl"
        valid={!invalid}
        value={value}
      />
    </div>
  );
}

export function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-cladd-fg-soft text-xs">{label}</span>
      {children}
    </div>
  );
}

interface RemoveButtonProps {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

export function RemoveLine({ disabled, label, onClick }: RemoveButtonProps) {
  return (
    <Button
      className="justify-start text-pact-stop"
      disabled={disabled}
      onClick={onClick}
      size="xl"
      variant="transparent"
    >
      {label}
    </Button>
  );
}
