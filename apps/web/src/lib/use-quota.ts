import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/use-wallet";
import { useWalletProof, type WalletProof } from "@/lib/wallet-proof";

export interface Quota {
  limit: number | null;
  pro_expires_at: number | null;
  remaining: number | null;
  resets_at: number | null;
  tier: "free" | "pro";
  verified: boolean;
}

const QUOTA_STALE_MS = 30_000;

export const quotaKey = (wallet: string) => ["ai-quota", wallet] as const;

const fetchQuota = async (
  wallet: string,
  proof: WalletProof
): Promise<Quota> => {
  const response = await fetch("/api/ai/quota", {
    body: JSON.stringify({ proof, wallet }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`quota request failed with ${response.status}`);
  }
  return (await response.json()) as Quota;
};

export function useQuota() {
  const { address } = useWallet();
  const { proof } = useWalletProof();
  return useQuery<Quota>({
    enabled: address !== null && proof !== null,
    queryFn: () => {
      if (!(address && proof)) {
        throw new Error("quota needs a connected wallet and a proof");
      }
      return fetchQuota(address, proof);
    },
    queryKey: quotaKey(address ?? ""),
    retry: false,
    staleTime: QUOTA_STALE_MS,
  });
}
