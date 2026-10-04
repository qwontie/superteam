import { Button } from "@cladd-ui/react";
import { type DealState, lamportsToSol } from "@pact/sdk";
import type { UseQueryResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { ExplorerLink } from "@/components/shell/explorer-link";
import type { DealEvent, LogEntry } from "@/features/deal/events";
import { actorName, witnessLabel } from "@/lib/checks";
import { formatWhen, shortAddress } from "@/lib/format";

interface DealLogProps {
  deal: DealState;
  labels: readonly string[];
  log: UseQueryResult<LogEntry[]>;
  oracles: ReadonlySet<number>;
}

const EVENT_WORDS = /([a-z])([A-Z])/g;

const sol = (lamports: bigint) => `${lamportsToSol(lamports)} SOL`;

const witnessName = (deal: DealState, check: number, witness: string) => {
  const position = deal.spec.checks[check]?.witnesses.indexOf(witness) ?? -1;
  return position >= 0
    ? witnessLabel(deal.spec.checks[check], position)
    : shortAddress(witness);
};

const voteText = (event: Extract<DealEvent, { kind: "attested" }>) => {
  if (!event.verdict) {
    return "no";
  }
  return event.nominee ? `for ${shortAddress(event.nominee)}` : "yes";
};

const describeEvent = (
  event: DealEvent,
  deal: DealState,
  labels: readonly string[],
  oracles: ReadonlySet<number>
) => {
  switch (event.kind) {
    case "created":
      return "Deal created";
    case "funded":
      return `${labels[deal.spec.funder] ?? "Funder"} locked ${sol(event.amount)} in the vault`;
    case "signaled":
      return `${labels[event.party] ?? `Party ${event.party + 1}`} signed`;
    case "attested":
      if (oracles.has(event.check) && event.verdict) {
        return "Switchboard oracles confirmed the check";
      }
      return `${witnessName(deal, event.check, event.witness)} voted ${voteText(event)}`;
    case "executed":
      return `Rule ${event.rule + 1} fired by ${actorName(deal.spec, labels, event.executor)}`;
    case "cancelled":
      return "Deal cancelled";
    case "other":
      return event.name.replace(EVENT_WORDS, "$1 $2");
    default:
      return event satisfies never;
  }
};

const describeEntry = (
  entry: LogEntry,
  deal: DealState,
  labels: readonly string[],
  oracles: ReadonlySet<number>
) => {
  if (entry.failed) {
    return "Failed transaction, nothing changed";
  }
  return entry.event
    ? describeEvent(entry.event, deal, labels, oracles)
    : "Transaction";
};

export function DealLog({ deal, labels, log, oracles }: DealLogProps) {
  const retry = useCallback(() => {
    log.refetch().catch(() => undefined);
  }, [log]);
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="font-medium text-cladd-fg-soft text-sm">Activity</h2>
      {log.isPending ? (
        <p className="text-cladd-fg-softer text-sm">Reading transactions</p>
      ) : null}
      {log.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-cladd-fg-soft text-sm">
            Could not read the transactions from devnet.
          </p>
          <Button onClick={retry} size="lg">
            Try again
          </Button>
        </div>
      ) : null}
      {log.data?.length === 0 ? (
        <p className="text-cladd-fg-softer text-sm">No transactions yet</p>
      ) : null}
      {log.data && log.data.length > 0 ? (
        <ol className="flex flex-col">
          {log.data.map((entry) => (
            <li
              className="flex items-baseline justify-between gap-4 py-2.5 text-sm shadow-[0_1px_0_var(--color-cladd-bg-outline)] last:shadow-none"
              key={entry.signature}
            >
              <span className={entry.failed ? "text-cladd-fg-softer" : ""}>
                {describeEntry(entry, deal, labels, oracles)}
              </span>
              <ExplorerLink
                className="relative shrink-0 whitespace-nowrap text-cladd-fg-soft text-xs tabular-nums before:absolute before:inset-x-0 before:-inset-y-3 before:content-['']"
                path={`/tx/${entry.signature}`}
              >
                {entry.blockTime === null ? (
                  shortAddress(entry.signature)
                ) : (
                  <time
                    dateTime={new Date(entry.blockTime * 1000).toISOString()}
                  >
                    {formatWhen(entry.blockTime)}
                  </time>
                )}
              </ExplorerLink>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
