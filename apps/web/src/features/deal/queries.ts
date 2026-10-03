import { type DealState, fetchAllDeals, fetchDeal } from "@pact/sdk";
import {
  isAddress,
  type Signature,
  address as toAddress,
  signature as toSignature,
} from "@solana/kit";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { eventFromLogs, type LogEntry } from "@/features/deal/events";
import type { AppClient } from "@/lib/solana";
import { useAppClient } from "@/lib/use-app-client";

const LOG_LIMIT = 30;
const LOG_CHUNK = 5;
const DEAL_REFRESH_MS = 45_000;
const LIST_STALE_MS = 30_000;

export const dealKeys = {
  all: ["deals"] as const,
  log: (address: string) => ["deal-log", address] as const,
  one: (address: string) => ["deal", address] as const,
  tx: (signature: string) => ["deal-tx", signature] as const,
};

export const dealInvalidation = (address: string) => [
  dealKeys.one(address),
  dealKeys.log(address),
  dealKeys.all,
  ["balance"] as const,
];

export function useDeal(address: string) {
  const client = useAppClient();
  return useQuery<DealState | null>({
    enabled: isAddress(address),
    queryFn: () => fetchDeal(client.rpc, toAddress(address)),
    queryKey: dealKeys.one(address),
    refetchInterval: DEAL_REFRESH_MS,
  });
}

export function useDeals(enabled = true) {
  const client = useAppClient();
  return useQuery<DealState[]>({
    enabled,
    queryFn: () => fetchAllDeals(client.rpc),
    queryKey: dealKeys.all,
    staleTime: LIST_STALE_MS,
  });
}

interface SignatureInfo {
  blockTime: number | null;
  failed: boolean;
  signature: Signature;
}

const fetchEntry = async (
  client: AppClient,
  info: SignatureInfo
): Promise<LogEntry> => {
  const transaction = await client.rpc
    .getTransaction(info.signature, {
      commitment: "confirmed",
      encoding: "json",
      maxSupportedTransactionVersion: 0,
    })
    .send();
  const logs = transaction?.meta?.logMessages ?? [];
  const signer = transaction?.transaction.message.accountKeys[0] ?? null;
  return {
    blockTime: info.blockTime,
    event: info.failed ? null : eventFromLogs(logs),
    failed: info.failed,
    signature: info.signature,
    signer: signer ? String(signer) : null,
  };
};

const loadChunks = async (
  infos: SignatureInfo[],
  load: (info: SignatureInfo) => Promise<LogEntry>,
  start = 0
): Promise<LogEntry[]> => {
  if (start >= infos.length) {
    return [];
  }
  const head = await Promise.all(
    infos.slice(start, start + LOG_CHUNK).map(load)
  );
  const rest = await loadChunks(infos, load, start + LOG_CHUNK);
  return [...head, ...rest];
};

const fetchLog = async (
  client: AppClient,
  queryClient: QueryClient,
  address: string
): Promise<LogEntry[]> => {
  const signatures = await client.rpc
    .getSignaturesForAddress(toAddress(address), {
      commitment: "confirmed",
      limit: LOG_LIMIT,
    })
    .send();
  const infos: SignatureInfo[] = signatures.map((entry) => ({
    blockTime: entry.blockTime === null ? null : Number(entry.blockTime),
    failed: entry.err !== null,
    signature: toSignature(entry.signature),
  }));
  const load = (info: SignatureInfo) =>
    queryClient.fetchQuery({
      queryFn: () => fetchEntry(client, info),
      queryKey: dealKeys.tx(info.signature),
      staleTime: Number.POSITIVE_INFINITY,
    });
  return loadChunks(infos, load);
};

export function useDealLog(address: string, enabled: boolean) {
  const client = useAppClient();
  const queryClient = useQueryClient();
  return useQuery<LogEntry[]>({
    enabled: enabled && isAddress(address),
    queryFn: () => fetchLog(client, queryClient, address),
    queryKey: dealKeys.log(address),
  });
}

export function useDealLive(address: string) {
  const client = useAppClient();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isAddress(address)) {
      return;
    }
    const abort = new AbortController();
    const listen = async () => {
      const notifications = await client.rpcSubscriptions
        .accountNotifications(toAddress(address), { commitment: "confirmed" })
        .subscribe({ abortSignal: abort.signal });
      for await (const _ of notifications) {
        queryClient.invalidateQueries({ queryKey: dealKeys.one(address) });
        queryClient.invalidateQueries({ queryKey: dealKeys.log(address) });
        queryClient.invalidateQueries({ queryKey: dealKeys.all });
      }
    };
    listen().catch(() => undefined);
    return () => abort.abort();
  }, [address, client, queryClient]);
}
