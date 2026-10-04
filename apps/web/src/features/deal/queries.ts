import {
  type DealSpec,
  type DealState,
  fetchAllDeals,
  fetchDeal,
} from "@pact/sdk";
import {
  type Fact,
  type FactReading,
  fetchWikidataLabel,
  parseFact,
  readFact,
} from "@pact/sdk/facts";
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
import { useEffect, useMemo } from "react";
import { eventFromLogs, type LogEntry } from "@/features/deal/events";
import type { AppClient } from "@/lib/solana";
import { useAppClient } from "@/lib/use-app-client";

const LOG_LIMIT = 30;
const LOG_CHUNK = 5;
const DEAL_REFRESH_MS = 45_000;
const LIST_STALE_MS = 30_000;
const CATCH_UP_MS = [2500, 8000, 20_000];
const BEHIND_RETRY_MS = 4000;
const BEHIND_RETRIES = 12;

export const dealKeys = {
  all: ["deals"] as const,
  log: (address: string) => ["deal-log", address] as const,
  one: (address: string) => ["deal", address] as const,
  tx: (signature: string) => ["deal-tx", signature] as const,
};

const NO_ORACLES: ReadonlySet<number> = new Set();

const oracleChecks = async (deal: DealState) => {
  const { isGateCheck } = await import("@pact/sdk/gate-feed");
  const flags = await Promise.all(deal.spec.checks.map(isGateCheck));
  return flags.flatMap((flag, index) => (flag ? [index] : []));
};

export function useOracleChecks(deal: DealState) {
  const candidate = deal.spec.checks.some(
    (check) =>
      check.kind === "http_contains" &&
      check.threshold === 1 &&
      check.witnesses.length === 1
  );
  const found = useQuery({
    enabled: candidate,
    queryFn: () => oracleChecks(deal),
    queryKey: ["oracle-checks", deal.address],
    staleTime: Number.POSITIVE_INFINITY,
  });
  return useMemo(
    () => (found.data?.length ? new Set(found.data) : NO_ORACLES),
    [found.data]
  );
}

const NO_LABELS: ReadonlyMap<number, string> = new Map();
const LABEL_STALE_MS = 3_600_000;
const READING_REFRESH_MS = 60_000;
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const NO_BROWSER_ACCESS = "https://www.bitstamp.net/";

const wikidataEntities = (spec: DealSpec) =>
  spec.checks.map((check) => {
    if (check.kind !== "http_contains") {
      return null;
    }
    try {
      const { source } = parseFact(check.target, check.expect);
      return source.type === "wikidata" ? source.entity : null;
    } catch {
      return null;
    }
  });

const wikidataLabels = async (entities: (string | null)[]) => {
  const labels = await Promise.all(
    entities.map((entity) =>
      entity ? fetchWikidataLabel(entity).catch(() => null) : null
    )
  );
  return labels.flatMap((label, index): [number, string][] =>
    label ? [[index, label]] : []
  );
};

export function useFactLabels(
  spec: DealSpec,
  known?: Readonly<Record<string, string>>
) {
  const entities = useMemo(() => wikidataEntities(spec), [spec]);
  const found = useQuery({
    enabled: entities.some((entity) => entity !== null),
    queryFn: () => wikidataLabels(entities),
    queryKey: ["fact-labels", entities],
    retry: false,
    staleTime: LABEL_STALE_MS,
  });
  return useMemo(() => {
    const labels = new Map<number, string>();
    for (const [index, entity] of entities.entries()) {
      const label = entity ? known?.[entity] : undefined;
      if (label) {
        labels.set(index, label);
      }
    }
    for (const [index, label] of found.data ?? []) {
      labels.set(index, label);
    }
    return labels.size > 0 ? labels : NO_LABELS;
  }, [entities, found.data, known]);
}

const fetchSource = async (url: string) => {
  if (url.startsWith(NO_BROWSER_ACCESS)) {
    throw new Error("the source does not answer browsers");
  }
  const response = await fetch(
    url.startsWith(WIKIDATA_API) ? `${url}&origin=*` : url
  );
  if (!response.ok) {
    throw new Error(`source answered ${response.status}`);
  }
  return response.text();
};

export function useFactReading(fact: Fact | null, enabled: boolean) {
  return useQuery<FactReading>({
    enabled: enabled && fact !== null,
    queryFn: () => readFact(fact as Fact, fetchSource),
    queryKey: ["fact-reading", fact],
    refetchInterval: READING_REFRESH_MS,
    retry: false,
    staleTime: READING_REFRESH_MS,
  });
}

export const dealInvalidation = (address: string) => [
  dealKeys.one(address),
  dealKeys.log(address),
  dealKeys.all,
  ["balance"] as const,
];

const NOT_A_DEAL = "is not a pact deal account";

const readDeal = async (client: AppClient, address: string) => {
  try {
    return await fetchDeal(client.rpc, toAddress(address));
  } catch (error) {
    if (error instanceof Error && error.message.includes(NOT_A_DEAL)) {
      return null;
    }
    throw error;
  }
};

export function useDeal(address: string) {
  const client = useAppClient();
  return useQuery<DealState | null>({
    enabled: isAddress(address),
    queryFn: () => readDeal(client, address),
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

export function useDealLog(address: string, enabled: boolean, settled = false) {
  const client = useAppClient();
  const queryClient = useQueryClient();
  return useQuery<LogEntry[]>({
    enabled: enabled && isAddress(address),
    queryFn: () => fetchLog(client, queryClient, address),
    queryKey: dealKeys.log(address),
    refetchInterval: (query) => {
      const behind =
        settled &&
        !query.state.data?.some((entry) => entry.event?.kind === "executed");
      return behind && query.state.dataUpdateCount < BEHIND_RETRIES
        ? BEHIND_RETRY_MS
        : false;
    },
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
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const refreshLog = () =>
      queryClient.invalidateQueries({ queryKey: dealKeys.log(address) });
    const listen = async () => {
      const notifications = await client.rpcSubscriptions
        .accountNotifications(toAddress(address), { commitment: "confirmed" })
        .subscribe({ abortSignal: abort.signal });
      for await (const _ of notifications) {
        queryClient.invalidateQueries({ queryKey: dealKeys.one(address) });
        queryClient.invalidateQueries({ queryKey: dealKeys.all });
        refreshLog();
        for (const delay of CATCH_UP_MS) {
          const timer = setTimeout(() => {
            timers.delete(timer);
            refreshLog();
          }, delay);
          timers.add(timer);
        }
      }
    };
    listen().catch(() => undefined);
    return () => {
      abort.abort();
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [address, client, queryClient]);
}
