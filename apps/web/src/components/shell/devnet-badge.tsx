import { Tooltip } from "@cladd-ui/react";

export function DevnetBadge() {
  return (
    <Tooltip tooltip="Pact runs on Solana devnet. Switch your wallet to devnet and use devnet SOL.">
      <span className="inline-flex h-7 cursor-default items-center gap-2 rounded-full px-3 font-medium text-cladd-fg-soft text-xs shadow-[inset_0_0_0_1px_var(--color-cladd-outline)]">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-pact-time"
        />
        Devnet
      </span>
    </Tooltip>
  );
}
