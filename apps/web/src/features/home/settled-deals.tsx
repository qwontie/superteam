import { type DealState, evaluateDeal, nowSeconds } from "@pact/sdk";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DealRule } from "@/components/pact/deal-rule";
import { useOracleChecks } from "@/features/deal/queries";
import { shortAddress } from "@/lib/format";
import { partyLabels } from "@/lib/pact";

function SettledDeal({ deal }: { deal: DealState }) {
  const oracles = useOracleChecks(deal);
  const labels = useMemo(() => partyLabels(deal.spec), [deal.spec]);
  const fired = deal.settledRule ?? 0;
  const evaluation = useMemo(
    () => evaluateDeal(deal, nowSeconds()).rules[fired],
    [deal, fired]
  );
  return (
    <li className="flex min-w-0">
      <Link
        className="group flex min-w-0 flex-1 flex-col gap-2.5 rounded-block"
        params={{ address: deal.address }}
        to="/deals/$address"
      >
        <span className="flex items-baseline justify-between gap-4 px-1">
          <span className="min-w-0 break-words font-medium decoration-cladd-fg-softest underline-offset-4 group-hover:underline">
            {deal.spec.title}
          </span>
          <span className="shrink-0 font-mono text-cladd-fg-soft text-xs">
            {shortAddress(deal.address)}
          </span>
        </span>
        <DealRule
          evaluation={evaluation}
          labels={labels}
          oracles={oracles}
          ruleIndex={fired}
          spec={deal.spec}
          status="fired"
          votes={deal.votes}
        />
      </Link>
    </li>
  );
}

export function SettledDeals({ deals }: { deals: DealState[] }) {
  if (deals.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="home-settled">
      <h2 className="sr-only" id="home-settled">
        Settled on devnet
      </h2>
      <ul className="grid gap-x-6 gap-y-7 lg:grid-cols-2">
        {deals.map((deal) => (
          <SettledDeal deal={deal} key={deal.address} />
        ))}
      </ul>
    </section>
  );
}
