import { nowSeconds } from "@pact/sdk";
import { useSignMessage } from "@solana/kit-plugin-wallet/react";
import { useCallback, useSyncExternalStore } from "react";
import { useAppClient } from "@/lib/use-app-client";
import { useWallet } from "@/lib/use-wallet";

export interface WalletProof {
  message: string;
  signature: string;
}

interface StoredProof extends WalletProof {
  issued: number;
}

const REUSE_SECONDS = 11 * 3600;
const listeners = new Set<() => void>();
const cache = new Map<string, WalletProof>();

const storageKey = (wallet: string) => `pact:ai-proof:${wallet}`;

const proofMessage = (wallet: string, issued: number) =>
  `Pact AI access\nWallet: ${wallet}\nIssued: ${issued}`;

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const readStored = (wallet: string): WalletProof | null => {
  try {
    const raw = sessionStorage.getItem(storageKey(wallet));
    if (!raw) {
      return null;
    }
    const stored = JSON.parse(raw) as Partial<StoredProof>;
    const fresh =
      typeof stored.issued === "number" &&
      nowSeconds() - stored.issued < REUSE_SECONDS;
    if (!(fresh && stored.message && stored.signature)) {
      sessionStorage.removeItem(storageKey(wallet));
      return null;
    }
    return { message: stored.message, signature: stored.signature };
  } catch {
    return null;
  }
};

export const currentProof = (wallet: string | null): WalletProof | null => {
  if (!wallet) {
    return null;
  }
  const known = cache.get(wallet);
  if (known) {
    return known;
  }
  const stored = readStored(wallet);
  if (stored) {
    cache.set(wallet, stored);
  }
  return stored;
};

const remember = (wallet: string, proof: WalletProof, issued: number) => {
  cache.set(wallet, proof);
  try {
    const stored: StoredProof = { ...proof, issued };
    sessionStorage.setItem(storageKey(wallet), JSON.stringify(stored));
  } catch {
    cache.set(wallet, proof);
  }
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useWalletProof() {
  const client = useAppClient();
  const { address } = useWallet();
  const { dispatchAsync, isRunning } = useSignMessage(client);
  const read = useCallback(() => currentProof(address), [address]);
  const proof = useSyncExternalStore(subscribe, read, read);

  const request = useCallback(async (): Promise<WalletProof | null> => {
    if (!address) {
      return null;
    }
    const known = currentProof(address);
    if (known) {
      return known;
    }
    const issued = nowSeconds();
    const message = proofMessage(address, issued);
    try {
      const signature = await dispatchAsync(new TextEncoder().encode(message));
      const fresh = { message, signature: toBase64(signature) };
      remember(address, fresh, issued);
      return fresh;
    } catch {
      return null;
    }
  }, [address, dispatchAsync]);

  return { proof, request, signing: isRunning };
}
