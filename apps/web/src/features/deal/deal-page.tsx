import { Button, cn } from "@cladd-ui/react";
import { type DealState, evaluateDeal } from "@pact/sdk";
import { isAddress } from "@solana/kit";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { LayoutGroup } from "motion/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { DealRule } from "@/components/pact/deal-rule";
import { FiredNote, StatusPill, VaultAmount } from "@/components/pact/vault";
import { PAGE } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/shell/button-link";
import { ExplorerLink } from "@/components/shell/explorer-link";
import {
  DealAction,
  ExecuteButton,
  type Moves,
  planMoves,
  VoteAction,
} from "@/features/deal/deal-actions";
import { DealCheck } from "@/features/deal/deal-check";
import { DealLog } from "@/features/deal/deal-log";
import type { LogEntry } from "@/features/deal/events";
import {
  useDeal,
  useDealLive,
  useDealLog,
  useFactLabels,
  useOracleChecks,
} from "@/features/deal/queries";
import { shortAddress } from "@/lib/format";
import { partyLabels, ruleStatus, walletRoles } from "@/lib/pact";
import { useNow } from "@/lib/use-now";
import { useWallet } from "@/lib/use-wallet";

interface MessageProps {
  children?: ReactNode;
  text?: string;
  title: string;
}

interface RuleChecksProps {
  checks: readonly number[];
  deal: DealState;
  factLabels: ReadonlyMap<number, string>;
  moves: Moves;
  oracles: ReadonlySet<number>;
  viewer: string | null;
}

const SHELL = cn(PAGE, "flex flex-col gap-7 pt-8 sm:pt-10");

function BackLink() {
  return (
    <Link
      className="relative inline-flex items-center gap-1.5 self-start rounded-chip text-cladd-fg-soft text-sm transition-colors duration-200 before:absolute before:-inset-x-2 before:-inset-y-3 before:content-[''] hover:text-cladd-fg"
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

function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} - Pact`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

const executedEntry = (log: LogEntry[] | undefined) =>
  log?.find((entry) => entry.event?.kind === "executed") ?? null;

const checkHomes = (deal: DealState) => {
  const seen = new Set<number>();
  return deal.spec.rules.map((rule) => {
    const here: number[] = [];
    for (const condition of rule.when) {
      if (condition.type === "attested" && !seen.has(condition.check)) {
        seen.add(condition.check);
        here.push(condition.check);
      }
    }
    return here;
  });
};

function RuleChecks({
  checks,
  deal,
  factLabels,
  moves,
  oracles,
  viewer,
}: RuleChecksProps) {
  return (
    <div className="flex flex-col gap-4">
      {checks.map((checkIndex) => {
        const check = deal.spec.checks[checkIndex];
        const seat = moves.votes.find((entry) => entry.check === checkIndex);
        if (!check) {
          return null;
        }
        return (
          <DealCheck
            action={
              seat ? (
                <VoteAction
                  deal={deal}
                  quiet={
                    !(
                      moves.primary?.kind === "vote" &&
                      moves.primary.check === checkIndex
                    )
                  }
                  seat={seat}
                />
              ) : null
            }
            check={check}
            key={checkIndex}
            label={factLabels.get(checkIndex)}
            live={deal.status === "funded" || deal.status === "draft"}
            oracle={oracles.has(checkIndex)}
            viewer={viewer}
            votes={deal.votes[checkIndex]}
            waiting={deal.status === "funded"}
          />
        );
      })}
    </div>
  );
}

function DealView({ deal }: { deal: DealState }) {
  const now = useNow();
  const { address: wallet } = useWallet();
  const log = useDealLog(
    deal.address,
    true,
    deal.status === "settled" && deal.settledRule !== null
  );
  const evaluation = useMemo(() => evaluateDeal(deal, now), [deal, now]);
  const labels = useMemo(() => partyLabels(deal.spec), [deal.spec]);
  const roles = useMemo(() => walletRoles(deal, wallet), [deal, wallet]);
  const homes = useMemo(() => checkHomes(deal), [deal]);
  const oracles = useOracleChecks(deal);
  const factLabels = useFactLabels(deal.spec);
  const moves = planMoves(deal, evaluation, roles, wallet !== null);
  const flightId = `money-${deal.address}`;
  const fired = executedEntry(log.data);
  const openedUnsettled = useRef(deal.status !== "settled");
  useDocumentTitle(deal.spec.title);

  return (
    <LayoutGroup>
      <main className={SHELL}>
        <BackLink />
        <header className="grid gap-x-10 gap-y-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-3">
            <h1 className="break-words font-display font-semibold text-3xl tracking-tight sm:text-4xl">
              {deal.spec.title}
            </h1>
            <VaultAmount
              flightId={flightId}
              lamports={deal.spec.amount}
              size="hero"
              status={deal.status}
            />
          </div>
          <div className="flex flex-col gap-4 sm:items-end sm:pt-1.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <ExplorerLink
                className="order-2 font-mono text-cladd-fg-soft text-sm sm:order-1"
                path={`/address/${deal.address}`}
              >
                {shortAddress(deal.address, 6)}
              </ExplorerLink>
              <StatusPill className="order-1 sm:order-2" status={deal.status} />
            </div>
            <DealAction deal={deal} labels={labels} moves={moves} />
          </div>
        </header>

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-14">
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="sr-only">Rules</h2>
            {evaluation.rules.map((rule) => {
              const status = ruleStatus(deal, rule);
              const checks = homes[rule.rule] ?? [];
              return (
                <DealRule
                  action={
                    status === "armed" && wallet ? (
                      <ExecuteButton
                        deal={deal}
                        quiet={
                          !(
                            moves.primary?.kind === "execute" &&
                            moves.primary.rule === rule.rule
                          )
                        }
                        rule={rule.rule}
                      />
                    ) : null
                  }
                  detail={
                    checks.length > 0 ? (
                      <RuleChecks
                        checks={checks}
                        deal={deal}
                        factLabels={factLabels}
                        moves={moves}
                        oracles={oracles}
                        viewer={wallet}
                      />
                    ) : null
                  }
                  evaluation={rule}
                  factLabels={factLabels}
                  key={rule.rule}
                  labels={labels}
                  note={
                    status === "fired" ? (
                      <FiredNote
                        arriving={openedUnsettled.current}
                        flightId={flightId}
                        lamports={deal.spec.amount}
                      >
                        {fired ? (
                          <ExplorerLink
                            className="font-normal decoration-pact-ink/40"
                            path={`/tx/${fired.signature}`}
                          >
                            See the transaction
                          </ExplorerLink>
                        ) : null}
                      </FiredNote>
                    ) : null
                  }
                  now={now}
                  oracles={oracles}
                  ruleIndex={rule.rule}
                  spec={deal.spec}
                  status={status}
                  viewer={wallet}
                  votes={deal.votes}
                />
              );
            })}
          </section>
          <DealLog deal={deal} labels={labels} log={log} oracles={oracles} />
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
        text="Check the link you opened."
        title="This is not a deal address"
      />
    );
  }
  if (deal.isPending) {
    return (
      <main className={SHELL}>
        <BackLink />
        <p className="text-cladd-fg-soft">Reading the deal from devnet</p>
      </main>
    );
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
        text="Cancelled and closed deals are deleted from the chain. Their transactions stay on Solana Explorer."
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
