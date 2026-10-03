import {
  fetchSubscription,
  isSubscriptionActive,
  nowSeconds,
  type SubscriptionState,
} from "@pact/sdk";
import { address as toAddress } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";
import { useAppClient } from "@/lib/use-app-client";
import { useWallet } from "@/lib/use-wallet";

const PLAN_STALE_MS = 60_000;

export type PlanKind = "none" | "loading" | "unknown" | "free" | "pro";

export interface Plan {
  expiresAt: number | null;
  kind: PlanKind;
  wallet: string | null;
}

export const planKey = (wallet: string) => ["subscription", wallet] as const;

const kindOf = (
  subscription: SubscriptionState | null | undefined,
  failed: boolean
): PlanKind => {
  if (failed) {
    return "unknown";
  }
  if (subscription === undefined) {
    return "loading";
  }
  return isSubscriptionActive(subscription, nowSeconds()) ? "pro" : "free";
};

export function usePlan(): Plan {
  const client = useAppClient();
  const { address } = useWallet();
  const query = useQuery<SubscriptionState | null>({
    enabled: address !== null,
    queryFn: () => fetchSubscription(client.rpc, toAddress(address ?? "")),
    queryKey: planKey(address ?? ""),
    staleTime: PLAN_STALE_MS,
  });
  if (address === null) {
    return { expiresAt: null, kind: "none", wallet: null };
  }
  return {
    expiresAt: query.data?.expiresAt ?? null,
    kind: kindOf(query.data, query.isError),
    wallet: address,
  };
}
