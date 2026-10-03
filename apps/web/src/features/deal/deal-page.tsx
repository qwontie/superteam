import { Button, cn } from "@cladd-ui/react";
import { type DealState, evaluateDeal } from "@pact/sdk";
import { isAddress } from "@solana/kit";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { LayoutGroup } from "motion/react";
import { type ReactNode, useCallback, useMemo } from "react";
import { DealRule } from "@/components/pact/deal-rule";
import { FiredNote, StatusPill, VaultAmount } from "@/components/pact/vault";
import { PAGE } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/shell/button-link";
import { ExplorerLink } from "@/components/shell/explorer-link";
import { DealActions, ExecuteButton } from "@/features/deal/deal-actions";
import { DealLog } from "@/features/deal/deal-log";
import { DealPeople } from "@/features/deal/deal-people";
import type { LogEntry } from "@/features/deal/events";
import { useDeal, useDealLive, useDealLog } from "@/features/deal/queries";
import { shortAddress } from "@/lib/format";
import { partyLabels, ruleStatus, walletRoles } from "@/lib/pact";
import { useNow } from "@/lib/use-now";
import { useWallet } from "@/lib/use-wallet";

interface MessageProps {
  children?: ReactNode;
  text?: string;
  title: string;
}

const SHELL = cn(PAGE, "flex flex-col gap-8 pt-8 sm:pt-12");
const H2 = "font-display font-semibold text-xl tracking-tight";

function BackLink() {
  return (
    <Link
      className="inline-flex items-center gap-1.5 self-start rounded-chip text-cladd-fg-soft text-sm transition-colors duration-200 hover:text-cladd-fg"
      to="/deals"
    >
      <ArrowLeft aria-hidden="true" size={15} />
      Deals
    </Link>
  );
}

function Message({ title, text, children }: MessageProps) {
  return (
    <main className={SHELL}>
      <BackLink />
      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="font-display font-semibold text-3xl tracking-tight">
          {title}
        </h1>
        {text ? <p className="text-cladd-fg-soft">{text}</p> : null}
        {children ? <div className="pt-2">{children}</div> : null}
      </div>
    </main>
  );
}

const vaultSentence = (deal: DealState, labels: readonly string[]) => {
  if (deal.status === "draft") {
    return `Waiting for the ${labels[deal.spec.funder] ?? "funder"} to lock the payment. The rules below are already final.`;
  }
  if (deal.status === "funded") {
    return "Held by the Pact program. It can leave only through one of the rules below.";
  }
  if (deal.settledRule !== null) {
    return `Rule ${deal.settledRule + 1} fired and paid it out. No one approved it.`;
  }
  return "This deal is closed.";
};

const executedEntry = (log: LogEntry[] | undefined) =>
  log?.find((entry) => entry.event?.kind === "executed") ?? null;

function FiredBy({ entry }: { entry: LogEntry | null }) {
  if (entry?.event?.kind !== "executed") {
    return null;
  }
  return (
    <span className="font-normal">
      Fired by {shortAddress(entry.event.executor)}, who could not change
      where it went.{" "}
      <ExplorerLink
        className="decoration-pact-ink/40"
        path={`/tx/${entry.signature}`}
      >
        See the transaction
      </ExplorerLink>
    </span>
  );
}

function DealView({ deal }: { deal: DealState }) {
  const now = useNow();
  const { address: wallet } = useWallet();
  const log = useDealLog(deal.address, true);
  const evaluation = useMemo(() => evaluateDeal(deal, now), [deal, now]);
  const labels = useMemo(() => partyLabels(deal.spec), [deal.spec]);
  const roles = useMemo(() => walletRoles(deal, wallet), [deal, wallet]);
  const yesVotes = deal.votes.map((votes) => votes.yes);
  const flightId = `money-${deal.address}`;
  const fired = executedEntry(log.data);

  return (
    <LayoutGroup>
      <main className={SHELL}>
        <BackLink />
        <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div className="flex min-w-0 flex-col gap-4">
            <h1 className="break-words font-display font-semibold text-3xl tracking-tight sm:text-4xl">
              {deal.spec.title}
            </h1>
            <VaultAmount
              flightId={flightId}
              lamports={deal.spec.amount}
              size="hero"
              status={deal.status}
            />
            <p className="max-w-xl text-cladd-fg-soft">
              {vaultSentence(deal, labels)}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <StatusPill status={deal.status} />
            <ExplorerLink
              className="font-mono text-cladd-fg-soft text-sm"
              path={`/address/${deal.address}`}
            >
              {shortAddress(deal.address, 6)}
            </ExplorerLink>
          </div>
        </header>

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-14">
          <div className="flex min-w-0 flex-col gap-8">
            <DealActions
              deal={deal}
              evaluation={evaluation}
              labels={labels}
              roles={roles}
            />
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className={H2}>Rules</h2>
                <p className="text-cladd-fg-soft text-sm">
                  The first rule that is true and gets executed wins. Anyone
                  can execute it, no one can stop it.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {evaluation.rules.map((rule) => {
                  const status = ruleStatus(deal, rule);
                  return (
                    <DealRule
                      action={
                        status === "armed" && wallet ? (
                          <ExecuteButton deal={deal} rule={rule.rule} />
                        ) : null
                      }
                      evaluation={rule}
                      key={rule.rule}
                      labels={labels}
                      note={
                        status === "fired" ? (
                          <FiredNote
                            flightId={flightId}
                            lamports={deal.spec.amount}
                          >
                            <FiredBy entry={fired} />
                          </FiredNote>
                        ) : null
                      }
                      now={now}
                      ruleIndex={rule.rule}
                      spec={deal.spec}
                      status={status}
                      viewer={wallet}
                      yesVotes={yesVotes}
                    />
                  );
                })}
              </div>
            </section>
          </div>
          <aside className="flex min-w-0 flex-col gap-8">
            <DealPeople deal={deal} labels={labels} viewer={wallet} />
            <DealLog deal={deal} labels={labels} log={log} />
          </aside>
        </div>
      </main>
    </LayoutGroup>
  );
}

export function DealPage({ address }: { address: string }) {
  const valid = isAddress(address);
  const deal = useDeal(address);
  useDealLive(address);
  const retry = useCallback(() => {
    deal.refetch().catch(() => undefined);
  }, [deal]);

  if (!valid) {
    return (
      <Message
        text="A deal lives at a Solana address. Check the link you opened."
        title="This is not a deal address"
      />
    );
  }
  if (deal.isPending) {
    return <Message title="Reading the deal from devnet" />;
  }
  if (deal.isError) {
    return (
      <Message
        text="The devnet node did not answer. The deal itself is safe on chain."
        title="Could not read the deal"
      >
        <Button onClick={retry} size="xl" variant="solid-fill">
          Try again
        </Button>
      </Message>
    );
  }
  if (deal.data === null) {
    return (
      <Message
        text="Nothing is stored here on devnet. A draft that its creator cancelled is deleted from the chain, so it looks the same."
        title="No deal at this address"
      >
        <ButtonLink size="xl" to="/deals">
          Your deals
        </ButtonLink>
      </Message>
    );
  }
  return <DealView deal={deal.data} />;
}
