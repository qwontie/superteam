import { cn } from "@cladd-ui/react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { FLOOD, SNAP } from "@/components/pact/motion";
import { ToneProvider } from "@/components/pact/tone";
import type { RuleStatus } from "@/lib/pact";

interface RuleBlockProps {
  action?: ReactNode;
  className?: string;
  detail?: ReactNode;
  exit?: boolean;
  index: number;
  note?: ReactNode;
  status?: RuleStatus;
  then: ReactNode;
  when: ReactNode;
}

interface WhenRowProps {
  children: ReactNode;
  detail?: ReactNode;
  exit: boolean;
  index: number;
  joined: boolean;
  lost: boolean;
}

interface ThenRowProps {
  action?: ReactNode;
  children: ReactNode;
  joined: boolean;
  note?: ReactNode;
  status: RuleStatus;
}

const STATUS_NAME: Record<RuleStatus, string | null> = {
  armed: "Can fire now",
  fired: "Fired",
  idle: null,
  lost: "Did not fire",
  waiting: "Waiting",
};

const STATUS_LABEL: Record<RuleStatus, string | null> = {
  armed: "Can fire now",
  fired: "Fired",
  idle: null,
  lost: null,
  waiting: null,
};

const STATUS_TEXT: Record<RuleStatus, string> = {
  armed: "text-pact-money",
  fired: "text-pact-ink",
  idle: "text-cladd-fg-softer",
  lost: "text-cladd-fg-softer",
  waiting: "text-cladd-fg-softer",
};

const GAP = 3;
const ROW = "relative flex flex-wrap items-start gap-x-3 gap-y-1.5";
const KEYWORD =
  "order-1 w-11 shrink-0 font-display font-semibold text-sm leading-5 sm:pt-1.5";
const SIDE = "order-2 ml-auto flex shrink-0 items-center sm:order-3";
const SLOT =
  "order-3 flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-1.5 sm:order-2 sm:flex-1 sm:basis-0";

function WhenRow({
  children,
  detail,
  exit,
  index,
  joined,
  lost,
}: WhenRowProps) {
  return (
    <div
      className={cn(
        ROW,
        "rounded-t-block bg-cladd-surface px-3 py-2.5 shadow-cladd-outline transition-[border-radius,opacity] duration-200 ease-pact sm:px-4",
        joined ? "rounded-b-none" : "rounded-b-seam",
        lost && "opacity-45"
      )}
    >
      <span className={cn(KEYWORD, "text-cladd-fg-soft")}>When</span>
      <div className={SLOT}>{children}</div>
      <span
        className={cn(
          SIDE,
          "gap-2 text-cladd-fg-softer text-xs leading-5 sm:pt-1.5"
        )}
      >
        {exit ? (
          <span className="rounded-full px-2 text-cladd-fg-soft shadow-[inset_0_0_0_1px_var(--color-cladd-outline)]">
            Exit
          </span>
        ) : null}
        <span className="font-mono tabular-nums">{index + 1}</span>
      </span>
      {detail ? (
        <div className="order-4 min-w-0 basis-full pt-1 pb-0.5 sm:pl-14">
          {detail}
        </div>
      ) : null}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-8 h-[3px] w-6 bg-cladd-surface transition-opacity duration-150",
          joined ? "opacity-0" : "opacity-100"
        )}
        style={{ bottom: -GAP }}
      />
    </div>
  );
}

function ThenRow({ children, action, note, status, joined }: ThenRowProps) {
  const fired = status === "fired";
  const label = STATUS_LABEL[status];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-b-block bg-cladd-surface-cut px-3 py-2.5 transition-[border-radius,box-shadow,opacity] duration-200 ease-pact sm:px-4",
        joined ? "rounded-t-none" : "rounded-t-seam",
        status === "armed"
          ? "shadow-[inset_0_0_0_1.5px_var(--color-pact-money)]"
          : "shadow-cladd-cut-outline",
        status === "lost" && "opacity-45"
      )}
    >
      <motion.span
        animate={{ clipPath: fired ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
        aria-hidden="true"
        className="absolute inset-0 bg-pact-money"
        initial={false}
        transition={FLOOD}
      />
      <ToneProvider tone={fired ? "ink" : "default"}>
        <div className={ROW}>
          <span
            className={cn(
              KEYWORD,
              "transition-colors duration-300",
              fired ? "text-pact-ink" : "text-cladd-fg-soft"
            )}
          >
            Then
          </span>
          <div className={SLOT}>{children}</div>
          {label || action ? (
            <div className={cn(SIDE, "gap-3 sm:min-h-8")}>
              {label ? (
                <span
                  className={cn(
                    "font-medium text-xs transition-colors duration-300",
                    STATUS_TEXT[status]
                  )}
                >
                  {label}
                </span>
              ) : null}
              {action}
            </div>
          ) : null}
        </div>
        {note ? <div className="relative mt-2 sm:pl-14">{note}</div> : null}
      </ToneProvider>
    </div>
  );
}

function Strike() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full text-cladd-fg-softer"
      preserveAspectRatio="none"
    >
      <line
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        x1="0"
        x2="100%"
        y1="100%"
        y2="0"
      />
    </svg>
  );
}

export function RuleBlock({
  index,
  status = "idle",
  exit = false,
  when,
  then,
  action,
  detail,
  note,
  className,
}: RuleBlockProps) {
  const joined = status === "armed" || status === "fired";
  const lost = status === "lost";
  const label = STATUS_NAME[status];
  return (
    <motion.article
      animate={{ rowGap: joined ? "0px" : `${GAP}px` }}
      aria-label={`Rule ${index + 1}${label ? `, ${label.toLowerCase()}` : ""}`}
      className={cn("relative flex flex-col", className)}
      data-status={status}
      initial={false}
      transition={SNAP}
    >
      <WhenRow
        detail={detail}
        exit={exit}
        index={index}
        joined={joined}
        lost={lost}
      >
        {when}
      </WhenRow>
      <ThenRow action={action} joined={joined} note={note} status={status}>
        {then}
      </ThenRow>
      {lost ? <Strike /> : null}
    </motion.article>
  );
}
