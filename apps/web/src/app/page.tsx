"use client";

import { Chip, Link, SectionTitle, Spinner, Surface } from "@cladd-ui/react";
import { PACT_PROGRAM_ID } from "@pact/sdk";
import {
  formatDecimalFixedPoint,
  lamportsToSol,
  address as toAddress,
} from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { WalletConnect } from "@/components/wallet-connect";
import { CLUSTER, explorerUrl } from "@/lib/solana";
import { useAppClient } from "@/lib/use-app-client";
import { useBalance } from "@/lib/use-balance";

const solFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 9,
});

export default function Home() {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const address = connected ? toAddress(connected.account.address) : undefined;
  const balance = useBalance(address);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-xl">Pact</span>
          <Chip color="purple" size="sm">
            {CLUSTER}
          </Chip>
        </div>
        <WalletConnect />
      </header>

      <Surface className="flex flex-col gap-4 rounded-2xl p-6" level={1}>
        <SectionTitle>Wallet</SectionTitle>
        {address ? (
          <div className="flex flex-col gap-2">
            <Link
              as="a"
              className="break-all font-mono text-sm"
              href={explorerUrl(`/address/${address}`)}
              rel="noopener noreferrer"
              target="_blank"
            >
              {address}
            </Link>
            <div className="flex items-center gap-2">
              {balance.data === undefined || balance.data === null ? (
                <Spinner size="xs" />
              ) : (
                <Chip color="green">
                  {formatDecimalFixedPoint(
                    solFormatter,
                    lamportsToSol(balance.data)
                  )}{" "}
                  SOL
                </Chip>
              )}
              {balance.error !== null && (
                <Chip color="red">Balance unavailable</Chip>
              )}
            </div>
          </div>
        ) : (
          <p className="text-cladd-fg-soft text-sm">
            Connect a wallet to see its devnet address and balance.
          </p>
        )}
      </Surface>

      <Surface className="flex flex-col gap-2 rounded-2xl p-6" level={1}>
        <SectionTitle>Program</SectionTitle>
        <Link
          as="a"
          className="break-all font-mono text-sm"
          href={explorerUrl(`/address/${PACT_PROGRAM_ID}`)}
          rel="noopener noreferrer"
          target="_blank"
        >
          {PACT_PROGRAM_ID}
        </Link>
      </Surface>
    </main>
  );
}
