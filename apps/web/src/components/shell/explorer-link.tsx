import { cn } from "@cladd-ui/react";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { explorerUrl } from "@/lib/solana";

interface ExplorerLinkProps {
  children: ReactNode;
  className?: string;
  path: string;
}

export function ExplorerLink({ path, children, className }: ExplorerLinkProps) {
  return (
    <a
      className={cn(
        "inline-flex items-center gap-1 underline decoration-cladd-fg-softest hover:decoration-current",
        className
      )}
      href={explorerUrl(path)}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
      <ArrowUpRight aria-hidden="true" size={14} />
    </a>
  );
}
