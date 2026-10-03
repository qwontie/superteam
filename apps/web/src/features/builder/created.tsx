import { Button, cn } from "@cladd-ui/react";
import { lamportsToSol } from "@pact/sdk";
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PAGE } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/shell/button-link";
import { ExplorerLink } from "@/components/shell/explorer-link";
import {
  type Created as CreatedDeal,
  useBuilder,
} from "@/features/builder/state";

const COPIED_MS = 2200;

export function Created({ created }: { created: CreatedDeal }) {
  const { setCreated } = useBuilder();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/deals/${created.address}`;
  const amount = `${lamportsToSol(created.lamports)} SOL`;

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(link)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }, [link]);
  const again = useCallback(() => setCreated(null), [setCreated]);

  return (
    <main className={cn(PAGE, "flex flex-1 flex-col pt-10 sm:pt-[12vh]")}>
      <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-balance font-display font-semibold text-4xl tracking-[-0.02em] sm:text-5xl">
            {created.title} is on chain
          </h1>
          <p className="text-cladd-fg-soft text-lg">
            {created.funded
              ? `${amount} locked in the vault.`
              : `${created.funder} still has to lock ${amount}.`}
          </p>
        </header>
        <div className="flex items-center gap-2">
          <output
            aria-label="Link to share"
            className="flex min-h-12 min-w-0 flex-1 items-center break-all rounded-block bg-cladd-surface-cut px-4 py-2 font-mono text-sm shadow-cladd-cut-outline"
          >
            {link}
          </output>
          <Button
            aria-label={copied ? "Copied" : "Copy link"}
            className="shrink-0"
            onClick={copy}
            size="2xl"
            square
            title="Copy link"
          >
            {copied ? (
              <Check aria-hidden="true" size={18} />
            ) : (
              <Copy aria-hidden="true" size={18} />
            )}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <ButtonLink
            className="px-5 font-semibold text-base"
            params={{ address: created.address }}
            size="2xl"
            to="/deals/$address"
            variant="solid-fill"
          >
            Open the deal
          </ButtonLink>
          <Button onClick={again} size="2xl" variant="transparent">
            Build another
          </Button>
          <ExplorerLink
            className="text-cladd-fg-soft text-sm"
            path={`/tx/${created.signature}`}
          >
            The transaction on Solana Explorer
          </ExplorerLink>
        </div>
      </div>
    </main>
  );
}
