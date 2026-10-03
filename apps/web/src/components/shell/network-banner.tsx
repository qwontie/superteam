import { cn } from "@cladd-ui/react";
import { TriangleAlert } from "lucide-react";
import { type NetworkProblem, useNetworkProblem } from "@/lib/use-cluster";

const TEXT: Record<Exclude<NetworkProblem, null>, string> = {
  "rpc-not-devnet":
    "This app is connected to a Solana cluster that is not devnet. Deals and balances shown here are not the devnet ones.",
  "wallet-no-devnet":
    "This wallet does not offer devnet. Switch it to devnet in the wallet settings or connect another wallet, otherwise it cannot sign for Pact.",
};

export function NetworkBanner({ className }: { className?: string }) {
  const problem = useNetworkProblem();
  if (!problem) {
    return null;
  }
  return (
    <div className="bg-pact-time text-pact-ink" role="alert">
      <div
        className={cn(
          className,
          "flex items-start gap-3 py-2.5 font-medium text-sm"
        )}
      >
        <TriangleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
        {TEXT[problem]}
      </div>
    </div>
  );
}
