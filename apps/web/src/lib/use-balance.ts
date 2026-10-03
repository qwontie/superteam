"use client";

import type { Address } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";
import { useAppClient } from "./use-app-client";

export function useBalance(address: Address | undefined) {
  const client = useAppClient();
  return useQuery({
    enabled: address !== undefined,
    queryFn: async () => {
      if (!address) {
        return null;
      }
      const { value } = await client.rpc
        .getBalance(address, { commitment: "confirmed" })
        .send();
      return value;
    },
    queryKey: ["balance", address],
    refetchInterval: 15_000,
  });
}
