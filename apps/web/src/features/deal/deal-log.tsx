import { Button } from "@cladd-ui/react";
import { type DealState, lamportsToSol } from "@pact/sdk";
import type { UseQueryResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { ExplorerLink } from "@/components/shell/explorer-link";
import type { DealEvent, LogEntry } from "@/features/deal/events";
import { formatWhen, shortAddress } from "@/lib/format";

interface DealLogProps {
  deal: DealState;
  labels: readonly string[];
  log: UseQueryResult<LogEntry[]>;
}

const EVENT_WORDS = /([a-z])([A-Z])/g;

const sol = (lamports: bigint) => `${lamportsToSol(lamports)} SOL`;

const witnessName = (deal: DealState, check: number, witness: string) => {
  const position = deal.spec.checks[check]?.witnesses.indexOf(witness) ?? -1;
  return position >= 0 ? `Witness ${position + 1}` : shortAddress(witness);
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
  labels: readonly string[]
) => {
  switch (event.kind) {
    case "created":
      return `Deal created for ${sol(event.amount)}`;
    case "funded":
      return `${labels[deal.spec.funder] ?? "Funder"} locked ${sol(event.amount)} in the vault`;
    case "signaled":
      return `${labels[event.party] ?? `Party ${event.party + 1}`} signed`;
    case "attested":
      return `${witnessName(deal, event.check, event.witness)} voted ${voteText(event)}: ${event.yes} yes, ${event.no} no`;
    case "executed":
      return `Rule ${event.rule + 1} fired: ${sol(event.amount)} left the vault. Executed by ${shortAddress(event.executor)}, approved by no one`;
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
  labels: readonly string[]
) => {
  if (entry.failed) {
    return "A transaction failed and changed nothing";
  }
  return entry.event ? describeEvent(entry.event, deal, labels) : "Transaction";
};

export function DealLog({ deal, labels, log }: DealLogProps) {
  const retry = useCallback(() => {
    log.refetch().catch(() => undefined);
  }, [log]);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display font-semibold text-xl tracking-tight">
        Activity
      </h2>
      {log.isPending ? (
        <p className="text-cladd-fg-soft text-sm">
          Reading transactions from devnet
        </p>
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
        <p className="text-cladd-fg-soft text-sm">No transactions yet.</p>
      ) : null}
      {log.data && log.data.length > 0 ? (
        <ol className="flex flex-col">
          {log.data.map((entry) => (
            <li
              className="flex flex-col gap-1 py-3 shadow-[0_1px_0_var(--color-cladd-bg-outline)] last:shadow-none"
              key={entry.signature}
            >
              <span
                className={
                  entry.failed ? "text-cladd-fg-soft text-sm" : "text-sm"
                }
              >
                {describeEntry(entry, deal, labels)}
              </span>
              <span className="flex flex-wrap items-center gap-x-3 text-cladd-fg-soft text-xs">
                {entry.blockTime === null ? null : (
                  <time
                    dateTime={new Date(entry.blockTime * 1000).toISOString()}
                  >
                    {formatWhen(entry.blockTime)}
                  </time>
                )}
                <ExplorerLink
                  className="font-mono"
                  path={`/tx/${entry.signature}`}
                >
                  {shortAddress(entry.signature, 6)}
                </ExplorerLink>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
