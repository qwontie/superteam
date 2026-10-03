import { useQuery } from "@tanstack/react-query";
import { useAppClient } from "@/lib/use-app-client";
import { useWallet } from "@/lib/use-wallet";

const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const DEVNET_CHAIN = "solana:devnet";

export type NetworkProblem = "rpc-not-devnet" | "wallet-no-devnet" | null;

export function useNetworkProblem(): NetworkProblem {
  const client = useAppClient();
  const { connected } = useWallet();
  const genesis = useQuery({
    queryFn: async () => String(await client.rpc.getGenesisHash().send()),
    queryKey: ["cluster-genesis"],
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (genesis.data !== undefined && genesis.data !== DEVNET_GENESIS) {
    return "rpc-not-devnet";
  }
  if (connected && !connected.account.chains.includes(DEVNET_CHAIN)) {
    return "wallet-no-devnet";
  }
  return null;
}
