import { Button, cn, Input } from "@cladd-ui/react";
import { isAddress } from "@solana/kit";
import { CircleAlert, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { QUICK } from "@/components/pact/motion";
import { Party, PartyAvatar } from "@/components/pact/party";
import { errorsAt } from "@/features/builder/problems";
import { useBuilder } from "@/features/builder/state";

const ANCHOR_UNSAFE = /[^a-z0-9]+/gi;

export const anchorId = (anchor: string) =>
  `builder-${anchor.replace(ANCHOR_UNSAFE, "-")}`;

export const SECTION_TITLE =
  "font-display font-semibold text-cladd-fg text-lg tracking-[-0.01em]";

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

export function SlotPill({ address, empty, label, open, you }: SlotPillProps) {
  const value = address.trim();
  if (!open && value !== "" && isAddress(value)) {
    return <Party address={value} label={label} you={you} />;
  }
  const broken = !open && value !== "";
  const hint = broken ? "check the address" : empty;
  return (
    <span
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-2 whitespace-nowrap rounded-full border border-dashed pr-3 pl-1 font-medium text-sm",
        broken
          ? "border-pact-stop text-pact-stop"
          : "border-cladd-fg-softer text-cladd-fg"
      )}
    >
      {open ? (
        <PartyAvatar seed={null} size={24} />
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cladd-surface-hover text-cladd-fg-soft">
          <Plus aria-hidden="true" size={14} />
        </span>
      )}
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "font-normal",
          broken ? "text-pact-stop" : "text-cladd-fg-soft"
        )}
      >
        {hint}
      </span>
    </span>
  );
}

interface AddressFieldProps {
  autoFocus?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}

export function AddressField({
  autoFocus,
  label,
  onChange,
  value,
}: AddressFieldProps) {
  const trimmed = value.trim();
  const invalid = trimmed !== "" && !isAddress(trimmed);
  return (
    <Input
      autoFocus={autoFocus}
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
