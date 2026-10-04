import type { DealState } from "@pact/sdk";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useDeals } from "@/features/deal/queries";
import { walletRoles } from "@/lib/pact";

export const DEMO_WALLET = "8aBswR9arwLWu7YnG94Qswv7yfNfL6vahzrNqi898QbX";

export type Verifier = "people" | "nodes" | "oracles";

export interface VerifiedDeal {
  check: number;
  deal: DealState;
}

export type VerifiedDeals = Partial<Record<Verifier, VerifiedDeal>>;

const SHOWN = 6;
const NONE: VerifiedDeals = {};

const newestFirst = (left: DealState, right: DealState) =>
  left.dealId > right.dealId ? -1 : 1;

const firedCheck = (deal: DealState) => {
  const rule =
    deal.settledRule === null ? undefined : deal.spec.rules[deal.settledRule];
  for (const condition of rule?.when ?? []) {
    if (condition.type === "attested" && deal.spec.checks[condition.check]) {
      return condition.check;
    }
  }
  return null;
};

const verifierOf = async (
  deal: DealState
): Promise<[Verifier, VerifiedDeal] | null> => {
  const index = firedCheck(deal);
  const check = index === null ? undefined : deal.spec.checks[index];
  if (index === null || !check) {
    return null;
  }
  const found = { check: index, deal };
  if (check.kind === "manual") {
    return ["people", found];
  }
  if (check.threshold === 1 && check.witnesses.length === 1) {
    const { isGateCheck } = await import("@pact/sdk/gate-feed");
    return [(await isGateCheck(check)) ? "oracles" : "nodes", found];
  }
  return ["nodes", found];
};

const verifiedDeals = async (deals: DealState[]): Promise<VerifiedDeals> => {
  const kinds = await Promise.all(deals.map(verifierOf));
  const found: VerifiedDeals = {};
  for (const entry of kinds) {
    if (entry && !found[entry[0]]) {
      found[entry[0]] = entry[1];
    }
  }
  return found;
};

export function useSettledDeals() {
  const deals = useDeals();
  const settled = useMemo(
    () =>
      (deals.data ?? [])
        .filter(
          (deal) => deal.status === "settled" && deal.settledRule !== null
        )
        .sort(newestFirst),
    [deals.data]
  );
  const demo = useMemo(
    () => settled.filter((deal) => walletRoles(deal, DEMO_WALLET).named),
    [settled]
  );
  const ordered = useMemo(
    () => [...demo, ...settled.filter((deal) => !demo.includes(deal))],
    [demo, settled]
  );
  const verified = useQuery({
    enabled: ordered.length > 0,
    queryFn: () => verifiedDeals(ordered),
    queryKey: ["verified-deals", ordered.map((deal) => deal.address)],
    staleTime: Number.POSITIVE_INFINITY,
  });
  return {
    recent: useMemo(() => demo.slice(0, SHOWN), [demo]),
    verified: verified.data ?? NONE,
  };
}
