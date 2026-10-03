import { Button, cn, Input } from "@cladd-ui/react";
import { isAddress } from "@solana/kit";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useCallback, useState } from "react";
import { PAGE } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/shell/button-link";
import { WalletButton } from "@/components/shell/wallet-button";
import { DealList } from "@/features/deal/deal-list";
import { DealPage } from "@/features/deal/deal-page";
import { shortAddress } from "@/lib/format";
import { useWallet } from "@/lib/use-wallet";

function Lookup() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmed = value.trim();
  const valid = isAddress(trimmed);
  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      setTouched(true);
      if (valid) {
        navigate({ search: { wallet: trimmed }, to: "/deals" }).catch(
          () => undefined
        );
      }
    },
    [navigate, trimmed, valid]
  );
  return (
    <form className="flex w-full max-w-xl flex-col gap-2" onSubmit={submit}>
      <label className="text-cladd-fg-soft text-sm" htmlFor="lookup-wallet">
        Or look up any address
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <Input
          className="min-w-0 flex-1 basis-64"
          errorMessage={
            touched && !valid ? "This is not a Solana address." : undefined
          }
          inputClassName="font-mono"
          inputId="lookup-wallet"
          onChange={setValue}
          placeholder="Solana address"
          size="xl"
          value={value}
        />
        <Button size="xl" type="submit">
          Look up
        </Button>
      </div>
    </form>
  );
}

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-start gap-8">
      <div className="flex flex-col items-start gap-4">
        <p className="text-cladd-fg-soft">
          Connect a wallet to see your deals.
        </p>
        <WalletButton />
      </div>
      <Lookup />
    </div>
  );
}

export function DealListEntry({ wallet }: { wallet?: string }) {
  const { address, ready } = useWallet();
  const watched = wallet && isAddress(wallet) ? wallet : null;
  const shown = watched ?? address;
  const own = shown !== null && shown === address;
  return (
    <main className={cn(PAGE, "flex flex-col gap-6 pt-10 sm:pt-14")}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display font-semibold text-4xl tracking-tight">
            {own || !shown ? "Your deals" : `Deals of ${shortAddress(shown)}`}
          </h1>
          {shown && !own ? (
            <p className="text-cladd-fg-soft text-sm">
              Read only.{" "}
              <Link className="text-cladd-fg underline" to="/deals">
                Your deals
              </Link>
            </p>
          ) : null}
        </div>
        {shown ? (
          <ButtonLink size="xl" to="/new" variant="solid-fill">
            New deal
          </ButtonLink>
        ) : null}
      </div>
      {shown ? <DealList own={own} wallet={shown} /> : null}
      {!shown && ready ? <ConnectPrompt /> : null}
    </main>
  );
}

export function DealPageEntry({ address }: { address: string }) {
  return <DealPage address={address} />;
}
