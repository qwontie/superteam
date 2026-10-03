import { useToast } from "@cladd-ui/react";
import {
  isSolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
} from "@solana/kit";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ExplorerLink } from "@/components/shell/explorer-link";
import { programError } from "@/lib/pact";
import type { AppClient } from "@/lib/solana";
import { useAppClient } from "@/lib/use-app-client";
import { useWallet } from "@/lib/use-wallet";

export type TxFailureKind =
  | "rejected"
  | "program"
  | "funds"
  | "network"
  | "wallet"
  | "unknown";

export interface TxFailure {
  code?: number;
  detail: string;
  kind: TxFailureKind;
  name?: string;
  title: string;
}

export type TxOutcome =
  | { ok: true; signature: string }
  | { failure: TxFailure; ok: false };

export type TxInput = Parameters<AppClient["sendTransaction"]>[0];

export interface SendOptions {
  invalidate?: readonly QueryKey[];
  label: string;
}

const MAX_DEPTH = 8;
const SUCCESS_TIMEOUT = 9000;
const FAILURE_TIMEOUT = 12_000;
const USER_REJECTED_CODE = 4001;
const CUSTOM_ERROR = /custom program error: (0x[0-9a-f]+)/i;
const REJECTED = /reject|denied|declin|cancel/i;
const FUNDS = /insufficient (funds|lamports)|debit an account/i;
const NETWORK = /\b429\b|too many requests|failed to fetch|network|timeout/i;
const EXPIRED = /blockhash not found|block height exceeded|expired/i;
const HUMAN_NAME = /([a-z0-9])([A-Z])/g;

const causeChain = (error: unknown) => {
  const chain: unknown[] = [];
  let current = error;
  while (current && chain.length < MAX_DEPTH) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
};

const textOf = (error: unknown) => {
  if (error instanceof Error) {
    const logs = (error as { context?: { logs?: unknown } }).context?.logs;
    return Array.isArray(logs)
      ? `${error.message}\n${logs.join("\n")}`
      : error.message;
  }
  return typeof error === "string" ? error : "";
};

const customCode = (chain: unknown[], text: string) => {
  for (const error of chain) {
    if (isSolanaError(error, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) {
      return Number(error.context.code);
    }
  }
  const match = CUSTOM_ERROR.exec(text);
  return match?.[1] ? Number.parseInt(match[1], 16) : null;
};

const humanName = (name: string) =>
  name.replace(HUMAN_NAME, "$1 $2").toLowerCase();

export const describeTxError = (error: unknown): TxFailure => {
  const chain = causeChain(error);
  const text = chain.map(textOf).join("\n");
  const rejected = chain.some(
    (entry) => (entry as { code?: unknown }).code === USER_REJECTED_CODE
  );
  if (rejected || REJECTED.test(text)) {
    return {
      detail: "Nothing was sent and nothing changed on chain.",
      kind: "rejected",
      title: "You declined the request in your wallet",
    };
  }
  const code = customCode(chain, text);
  if (code !== null) {
    const known = programError(code);
    return {
      code,
      detail: known
        ? `${known.name}: ${known.msg ?? humanName(known.name)}.`
        : `The program returned error ${code}.`,
      kind: "program",
      name: known?.name,
      title: "The Pact program refused this",
    };
  }
  if (FUNDS.test(text)) {
    return {
      detail: "Top up the wallet with devnet SOL and try again.",
      kind: "funds",
      title: "Not enough SOL in the wallet",
    };
  }
  if (EXPIRED.test(text)) {
    return {
      detail: "It took too long to sign. Nothing was sent, try again.",
      kind: "network",
      title: "The transaction expired",
    };
  }
  if (NETWORK.test(text)) {
    return {
      detail: "The devnet node did not answer. Wait a moment and try again.",
      kind: "network",
      title: "Could not reach Solana",
    };
  }
  return {
    detail: textOf(chain.at(-1)) || "No details were returned.",
    kind: "unknown",
    title: "The transaction failed",
  };
};

export function useSendTx() {
  const client = useAppClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { address } = useWallet();
  const [pending, setPending] = useState<string | null>(null);

  const send = useCallback(
    async (input: TxInput, options: SendOptions): Promise<TxOutcome> => {
      if (!address) {
        const failure: TxFailure = {
          detail: "Connect a wallet on devnet, then try again.",
          kind: "wallet",
          title: "No wallet connected",
        };
        toast({ color: "stop", text: failure.detail, title: failure.title });
        return { failure, ok: false };
      }
      setPending(options.label);
      try {
        const result = await client.sendTransaction(input);
        const signature = String(result.context.signature);
        toast({
          closeButton: true,
          color: "money",
          text: (
            <ExplorerLink path={`/tx/${signature}`}>
              View the transaction on Solana Explorer
            </ExplorerLink>
          ),
          timeout: SUCCESS_TIMEOUT,
          title: `${options.label}: confirmed`,
        });
        await Promise.all(
          (options.invalidate ?? []).map((queryKey) =>
            queryClient.invalidateQueries({ queryKey })
          )
        );
        return { ok: true, signature };
      } catch (error) {
        const failure = describeTxError(error);
        toast({
          closeButton: true,
          color: failure.kind === "rejected" ? "neutral" : "stop",
          text: failure.detail,
          timeout: FAILURE_TIMEOUT,
          title: failure.title,
        });
        return { failure, ok: false };
      } finally {
        setPending(null);
      }
    },
    [address, client, queryClient, toast]
  );

  return { pending, send };
}
