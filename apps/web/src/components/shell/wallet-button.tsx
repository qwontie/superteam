import {
  Button,
  List,
  ListButton,
  ListSeparator,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
  useToast,
} from "@cladd-ui/react";
import { address as toAddress } from "@solana/kit";
import {
  useConnect,
  useDisconnect,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import { ArrowUpRight, Copy, LogOut, Wallet } from "lucide-react";
import { useCallback, useState } from "react";
import { Amount } from "@/components/pact/amount";
import { PartyAvatar } from "@/components/pact/party";
import { PlanSection, PlanTag } from "@/components/shell/plan-section";
import { shortAddress } from "@/lib/format";
import { isPhone, walletBrowseLinks } from "@/lib/mobile-wallets";
import { explorerUrl } from "@/lib/solana";
import { describeTxError } from "@/lib/tx";
import { useAppClient } from "@/lib/use-app-client";
import { useBalance } from "@/lib/use-balance";
import { useWallet } from "@/lib/use-wallet";

type WalletOption = ReturnType<typeof useWallets>[number];

interface WalletRowProps {
  busy: boolean;
  onPick: (wallet: WalletOption) => void;
  wallet: WalletOption;
}

function WalletRow({ wallet, busy, onPick }: WalletRowProps) {
  const pick = useCallback(() => onPick(wallet), [onPick, wallet]);
  return (
    <ListButton
      disabled={busy}
      icon={
        <img
          alt=""
          className="rounded-[5px]"
          height={20}
          src={wallet.icon}
          width={20}
        />
      }
      onClick={pick}
      size="xl"
    >
      {wallet.name}
    </ListButton>
  );
}

function NoWallet() {
  const [links] = useState(() =>
    isPhone()
      ? walletBrowseLinks(window.location.href, window.location.origin)
      : []
  );
  if (links.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="font-medium text-sm">No Solana wallet found</p>
        <p className="text-cladd-fg-soft text-sm">
          Install Phantom, Solflare or Backpack, switch it to devnet and reload.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <p className="px-4 pt-4 pb-2 font-medium text-sm">
        Open Pact in your wallet app
      </p>
      <List className="p-1.5">
        {links.map((link) => (
          <ListButton
            as="a"
            href={link.href}
            icon={<ArrowUpRight aria-hidden="true" size={16} />}
            key={link.name}
            rel="noopener noreferrer"
            size="xl"
          >
            Open in {link.name}
          </ListButton>
        ))}
      </List>
      <p className="px-4 pb-4 text-cladd-fg-soft text-xs">
        Switch the wallet to devnet first.
      </p>
    </div>
  );
}

function ConnectMenu({ quiet }: { quiet: boolean }) {
  const client = useAppClient();
  const wallets = useWallets(client);
  const toast = useToast();
  const { dispatchAsync: connect, isRunning } = useConnect(client);

  const pick = useCallback(
    (wallet: WalletOption) => {
      connect(wallet).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        const failure = describeTxError(error);
        toast({
          color: failure.kind === "rejected" ? "neutral" : "stop",
          text:
            failure.kind === "rejected"
              ? "The wallet stayed disconnected."
              : failure.detail,
          title:
            failure.kind === "rejected"
              ? "You declined the connection"
              : `Could not connect ${wallet.name}`,
        });
      });
    },
    [connect, toast]
  );

  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button
          loading={isRunning}
          size="xl"
          variant={quiet ? "solid" : "solid-fill"}
        >
          <Wallet aria-hidden="true" size={16} />
          Connect wallet
        </Button>
      </PopoverTrigger>
      <Popover className="w-72" offset={8} position="bottom-end">
        {wallets.length === 0 ? (
          <NoWallet />
        ) : (
          <List className="p-1.5">
            {wallets.map((wallet) => (
              <PopoverClose key={wallet.name}>
                <WalletRow busy={isRunning} onPick={pick} wallet={wallet} />
              </PopoverClose>
            ))}
          </List>
        )}
      </Popover>
    </PopoverRoot>
  );
}

function AccountMenu({ address }: { address: string }) {
  const client = useAppClient();
  const toast = useToast();
  const balance = useBalance(toAddress(address));
  const { dispatchAsync: disconnect, isRunning } = useDisconnect(client);

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(address)
      .then(() => toast({ title: "Address copied" }))
      .catch(() =>
        toast({ color: "stop", title: "The browser blocked copying" })
      );
  }, [address, toast]);

  const leave = useCallback(() => {
    disconnect().catch(() => undefined);
  }, [disconnect]);

  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button aria-label="Account menu" loading={isRunning} size="xl">
          <PartyAvatar seed={address} size={20} />
          <span className="whitespace-nowrap font-mono text-sm">
            {shortAddress(address)}
          </span>
          <span className="hidden sm:inline-flex">
            <PlanTag />
          </span>
        </Button>
      </PopoverTrigger>
      <Popover className="w-80" offset={8} position="bottom-end">
        <div className="flex flex-col gap-1 px-4 pt-4 pb-3">
          <span className="text-cladd-fg-soft text-xs">Devnet balance</span>
          {typeof balance.data === "bigint" ? (
            <Amount lamports={balance.data} precision={4} size="lg" />
          ) : (
            <span className="h-9 w-32 rounded-chip bg-cladd-surface-hover" />
          )}
          {balance.error ? (
            <span className="text-pact-stop text-xs">
              Could not read the balance from devnet.
            </span>
          ) : null}
        </div>
        <ListSeparator />
        <PlanSection />
        <ListSeparator />
        <List className="p-1.5">
          <ListButton
            icon={<Copy aria-hidden="true" size={16} />}
            onClick={copy}
            size="xl"
          >
            Copy address
          </ListButton>
          <ListButton
            as="a"
            href={explorerUrl(`/address/${address}`)}
            icon={<ArrowUpRight aria-hidden="true" size={16} />}
            rel="noopener noreferrer"
            size="xl"
            target="_blank"
          >
            Open in Solana Explorer
          </ListButton>
          <PopoverClose>
            <ListButton
              icon={<LogOut aria-hidden="true" size={16} />}
              onClick={leave}
              size="xl"
            >
              Disconnect
            </ListButton>
          </PopoverClose>
        </List>
      </Popover>
    </PopoverRoot>
  );
}

export function WalletButton({ quiet = false }: { quiet?: boolean }) {
  const { address, ready } = useWallet();
  if (!ready) {
    return (
      <Button aria-label="Looking for wallets" disabled loading size="xl">
        Wallet
      </Button>
    );
  }
  return address ? (
    <AccountMenu address={address} />
  ) : (
    <ConnectMenu quiet={quiet} />
  );
}
