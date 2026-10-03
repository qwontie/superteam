"use client";

import { Button, Chip, Spinner } from "@cladd-ui/react";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useIsWalletReady,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import { useCallback, useSyncExternalStore } from "react";
import { useAppClient } from "@/lib/use-app-client";

const subscribeNoop = () => () => undefined;

type WalletOption = ReturnType<typeof useWallets>[number];

function ConnectButton({
  wallet,
  busy,
  onConnect,
}: {
  wallet: WalletOption;
  busy: boolean;
  onConnect: (wallet: WalletOption) => void;
}) {
  const handleClick = useCallback(() => onConnect(wallet), [onConnect, wallet]);
  return (
    <Button color="brand" loading={busy} onClick={handleClick} size="sm">
      Connect {wallet.name}
    </Button>
  );
}

export function WalletConnect() {
  const client = useAppClient();
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const walletReady = useIsWalletReady(client);
  const hydrated = useSyncExternalStore<boolean>(
    subscribeNoop,
    () => true,
    () => false
  );
  const ready = hydrated && walletReady;
  const {
    dispatchAsync: connect,
    isRunning: connecting,
    error,
  } = useConnect(client);
  const { dispatchAsync: disconnect, isRunning: disconnecting } =
    useDisconnect(client);

  const handleConnect = useCallback(
    (wallet: WalletOption) => {
      connect(wallet).catch(() => undefined);
    },
    [connect]
  );
  const handleDisconnect = useCallback(() => {
    disconnect().catch(() => undefined);
  }, [disconnect]);

  if (!ready) {
    return <Spinner size="sm" />;
  }

  if (connected) {
    return (
      <Button loading={disconnecting} onClick={handleDisconnect} size="sm">
        Disconnect
      </Button>
    );
  }

  if (wallets.length === 0) {
    return <Chip color="yellow">No Solana wallet found in this browser</Chip>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {wallets.map((wallet) => (
        <ConnectButton
          busy={connecting}
          key={wallet.name}
          onConnect={handleConnect}
          wallet={wallet}
        />
      ))}
      {error ? (
        <Chip color="red">
          {error instanceof Error ? error.message : String(error)}
        </Chip>
      ) : null}
    </div>
  );
}
