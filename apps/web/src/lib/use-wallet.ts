import {
  useConnectedWallet,
  useIsWalletReady,
} from "@solana/kit-plugin-wallet/react";
import { useAppClient } from "@/lib/use-app-client";

export function useWallet() {
  const client = useAppClient();
  const ready = useIsWalletReady(client);
  const connected = useConnectedWallet(client);
  return {
    address: connected ? String(connected.account.address) : null,
    connected,
    ready,
  };
}
