import { cn } from "@cladd-ui/react";
import { PAGE } from "@/components/shell/app-shell";
import { WalletButton } from "@/components/shell/wallet-button";
import { useWallet } from "@/lib/use-wallet";

const TITLE = "font-display font-semibold tracking-tight";
const PENDING = "Reading deals from devnet is not wired up yet.";

function DealsBody() {
  const { address, ready } = useWallet();
  if (!ready) {
    return <span className="h-5 w-64 rounded-chip bg-cladd-surface" />;
  }
  if (!address) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-xl text-cladd-fg-soft">
          Connect a wallet to see the deals you created, fund, take part in or
          witness.
        </p>
        <WalletButton />
      </div>
    );
  }
  return <p className="max-w-xl text-cladd-fg-soft">{PENDING}</p>;
}

export function HomeDealsEntry() {
  return (
    <section className="flex flex-col gap-4">
      <h2 className={cn(TITLE, "text-2xl")}>Your deals</h2>
      <DealsBody />
    </section>
  );
}

export function DealListEntry() {
  return (
    <main className={cn(PAGE, "flex flex-col gap-4 pt-10 sm:pt-16")}>
      <h1 className={cn(TITLE, "text-4xl")}>Your deals</h1>
      <DealsBody />
    </main>
  );
}

export function DealPageEntry({ address }: { address: string }) {
  return (
    <main className={cn(PAGE, "flex flex-col gap-4 pt-10 sm:pt-16")}>
      <h1 className={cn(TITLE, "text-4xl")}>Deal</h1>
      <p className="break-all font-mono text-cladd-fg-soft text-sm">
        {address}
      </p>
      <p className="max-w-xl text-cladd-fg-soft">{PENDING}</p>
    </main>
  );
}
