import { cn } from "@cladd-ui/react";
import { PACT_PROGRAM_ID } from "@pact/sdk";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { DevnetBadge } from "@/components/shell/devnet-badge";
import { ExplorerLink } from "@/components/shell/explorer-link";
import { Logo } from "@/components/shell/logo";
import { NetworkBanner } from "@/components/shell/network-banner";
import { ProgramStatus } from "@/components/shell/program-status";
import { WalletButton } from "@/components/shell/wallet-button";
import { shortAddress } from "@/lib/format";

const NAV_LINK =
  "inline-flex items-center rounded-chip px-3 py-1.5 font-medium text-cladd-fg-soft text-sm transition-colors duration-200 hover:text-cladd-fg";
const ACTIVE = { className: cn(NAV_LINK, "bg-cladd-surface text-cladd-fg") };

export const PAGE = "mx-auto w-full max-w-[1240px] px-4 sm:px-6";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 bg-cladd-bg shadow-[0_1px_0_var(--color-cladd-bg-outline)]">
        <div className={cn(PAGE, "flex h-16 items-center gap-2 sm:gap-4")}>
          <Link
            aria-label="Pact home"
            className="flex items-center gap-2.5 rounded-chip"
            to="/"
          >
            <Logo size={26} />
            <span className="font-display font-semibold text-xl tracking-tight">
              Pact
            </span>
          </Link>
          <span className="hidden sm:inline-flex">
            <DevnetBadge />
          </span>
          <nav aria-label="Main" className="ml-2 flex items-center gap-1">
            <Link activeProps={ACTIVE} className={NAV_LINK} to="/deals">
              Deals
            </Link>
            <Link
              activeProps={ACTIVE}
              aria-label="New deal"
              className={NAV_LINK}
              to="/new"
            >
              <Plus aria-hidden="true" className="sm:hidden" size={18} />
              <span className="hidden sm:inline">New deal</span>
            </Link>
          </nav>
          <div className="ml-auto flex items-center">
            <WalletButton quiet />
          </div>
        </div>
      </header>
      <NetworkBanner className={PAGE} />
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="mt-16 shadow-[0_-1px_0_var(--color-cladd-bg-outline)]">
        <div
          className={cn(
            PAGE,
            "flex flex-wrap items-center gap-x-6 gap-y-2 py-6 text-cladd-fg-soft text-sm"
          )}
        >
          <ProgramStatus />
          <span className="sm:ml-auto">
            Program{" "}
            <ExplorerLink
              className="font-mono text-cladd-fg"
              path={`/address/${PACT_PROGRAM_ID}`}
            >
              {shortAddress(PACT_PROGRAM_ID, 6)}
            </ExplorerLink>
          </span>
        </div>
      </footer>
    </div>
  );
}
