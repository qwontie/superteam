import { Button, cn } from "@cladd-ui/react";
import { type DealState, evaluateDeal } from "@pact/sdk";
import { Link } from "@tanstack/react-router";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Amount } from "@/components/pact/amount";
import { StatusPill } from "@/components/pact/vault";
import { ButtonLink } from "@/components/shell/button-link";
import { useDeals } from "@/features/deal/queries";
import { formatCountdown } from "@/lib/format";
import { partyLabels, walletRoles } from "@/lib/pact";
import { useNow } from "@/lib/use-now";

interface DealListProps {
  limit?: number;
  own: boolean;
  wallet: string;
}

interface DealRowProps {
  deal: DealState;
  now: number;
  wallet: string;
}

const ROW_ESTIMATE = 84;
const ROW_GAP = 10;
const OVERSCAN = 8;
const STATUS_ORDER: Record<DealState["status"], number> = {
  cancelled: 3,
  draft: 1,
  funded: 0,
  settled: 2,
};

const byUrgency = (left: DealState, right: DealState) => {
  const order = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
  if (order !== 0) {
    return order;
  }
  return left.dealId > right.dealId ? -1 : 1;
};

const roleText = (deal: DealState, wallet: string) => {
  const roles = walletRoles(deal, wallet);
  const labels = partyLabels(deal.spec);
  const parts: string[] = [];
  if (roles.party !== null) {
    parts.push(labels[roles.party] ?? "Party");
  }
  if (roles.witness.length > 0) {
    parts.push("Witness");
  }
  if (roles.creator && roles.party === null) {
    parts.push("Creator");
  }
  return parts.join(", ");
};

const nextGate = (deal: DealState, now: number) => {
  let next: number | null = null;
  for (const rule of deal.spec.rules) {
    for (const condition of rule.when) {
      if (
        condition.type === "after" &&
        condition.ts > now &&
        (next === null || condition.ts < next)
      ) {
        next = condition.ts;
      }
    }
  }
  return next;
};

const hintOf = (deal: DealState, now: number) => {
  if (deal.status === "draft") {
    return { armed: false, text: "Waiting for the payment to be locked" };
  }
  if (deal.status === "settled") {
    return {
      armed: false,
      text:
        deal.settledRule === null
          ? "Paid out"
          : `Rule ${deal.settledRule + 1} fired`,
    };
  }
  const [executable] = evaluateDeal(deal, now).executable;
  if (executable !== undefined) {
    return { armed: true, text: `Rule ${executable + 1} can fire now` };
  }
  const gate = nextGate(deal, now);
  return {
    armed: false,
    text:
      gate === null
        ? "Waiting for signatures or votes"
        : `Next time gate in ${formatCountdown(gate - now)}`,
  };
};

function DealRow({ deal, wallet, now }: DealRowProps) {
  const hint = hintOf(deal, now);
  return (
    <Link
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-block bg-cladd-surface px-4 py-3.5 shadow-cladd-outline transition-colors duration-200 hover:bg-[color-mix(in_oklab,var(--color-cladd-surface-white)_5%,var(--color-cladd-surface))] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-6"
      params={{ address: deal.address }}
      to="/deals/$address"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-medium">{deal.spec.title}</span>
        <span className="flex flex-wrap gap-x-2 text-sm">
          <span className="text-cladd-fg-soft">{roleText(deal, wallet)}</span>
          <span
            className={cn(
              "tabular-nums",
              hint.armed ? "text-pact-money" : "text-cladd-fg-softer"
            )}
          >
            {hint.text}
          </span>
        </span>
      </span>
      <Amount
        className="justify-self-end"
        lamports={deal.spec.amount}
        size="md"
      />
      <StatusPill
        className="col-span-2 justify-self-start sm:col-span-1 sm:justify-self-end"
        status={deal.status}
      />
    </Link>
  );
}

function VirtualRows({
  deals,
  wallet,
  now,
}: {
  deals: DealState[];
  now: number;
  wallet: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop ?? 0);
  }, []);
  const virtualizer = useWindowVirtualizer({
    count: deals.length,
    estimateSize: () => ROW_ESTIMATE,
    gap: ROW_GAP,
    overscan: OVERSCAN,
    scrollMargin,
  });
  return (
    <div
      className="relative"
      ref={listRef}
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const deal = deals[item.index];
        if (!deal) {
          return null;
        }
        return (
          <div
            className="absolute inset-x-0 top-0"
            data-index={item.index}
            key={deal.address}
            ref={virtualizer.measureElement}
            style={{
              transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <DealRow deal={deal} now={now} wallet={wallet} />
          </div>
        );
      })}
    </div>
  );
}

export function DealList({ wallet, own, limit }: DealListProps) {
  const deals = useDeals();
  const now = useNow();
  const named = useMemo(
    () =>
      (deals.data ?? [])
        .filter((deal) => walletRoles(deal, wallet).named)
        .sort(byUrgency),
    [deals.data, wallet]
  );
  const retry = useCallback(() => {
    deals.refetch().catch(() => undefined);
  }, [deals]);

  if (deals.isPending) {
    return <p className="text-cladd-fg-soft">Reading deals from devnet</p>;
  }
  if (deals.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="max-w-xl text-cladd-fg-soft">
          Could not read deals from devnet. The node did not answer; the deals
          themselves are safe on chain.
        </p>
        <Button onClick={retry} size="xl">
          Try again
        </Button>
      </div>
    );
  }
  if (named.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-xl text-cladd-fg-soft">
          {own
            ? "No deal names this wallet yet. A deal shows up here when you create it, when you are one of its parties or when you are a witness of one of its checks."
            : "No deal on devnet names this address as creator, party or witness."}
        </p>
        {own ? (
          <ButtonLink size="xl" to="/new" variant="solid-fill">
            New deal
          </ButtonLink>
        ) : null}
      </div>
    );
  }
  if (limit !== undefined) {
    return (
      <div className="flex flex-col" style={{ gap: ROW_GAP }}>
        {named.slice(0, limit).map((deal) => (
          <DealRow deal={deal} key={deal.address} now={now} wallet={wallet} />
        ))}
        {named.length > limit ? (
          <ButtonLink className="self-start" size="xl" to="/deals">
            All {named.length} deals
          </ButtonLink>
        ) : null}
      </div>
    );
  }
  return <VirtualRows deals={named} now={now} wallet={wallet} />;
}
