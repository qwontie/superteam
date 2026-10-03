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
    <main className={cn(PAGE, "flex flex-col gap-8 pt-10 sm:pt-16")}>
      <header className="flex max-w-[44rem] flex-col gap-4">
        <h1 className="font-display font-semibold text-4xl tracking-[-0.02em] sm:text-5xl">
          {created.title} is on chain
        </h1>
        <p className="text-cladd-fg-soft text-lg leading-relaxed">
          {created.funded
            ? `${amount} is locked in the vault. Only the rules you signed can move it now.`
            : `The rules are final. The vault is empty until ${created.funder} locks ${amount} from the deal page.`}
        </p>
      </header>
      <section className="flex max-w-[44rem] flex-col gap-3">
        <h2 className="font-display font-semibold text-lg">
          Send this link to the other side
        </h2>
        <p className="text-cladd-fg-soft text-sm">
          They see the same rules, read from the chain, and act from their own
          wallets.
        </p>
        <div className="flex flex-wrap items-stretch gap-2">
          <output className="flex min-h-10 min-w-0 flex-1 items-center break-all rounded-chip bg-cladd-surface-cut px-3 py-2 font-mono text-sm shadow-cladd-cut-outline">
            {link}
          </output>
          <Button onClick={copy} size="xl">
            {copied ? (
              <Check aria-hidden="true" size={16} />
            ) : (
              <Copy aria-hidden="true" size={16} />
            )}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <ButtonLink
          className="px-3 font-semibold text-base"
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
    </main>
  );
}
