import { Tooltip } from "@cladd-ui/react";

export function DevnetBadge() {
  return (
    <Tooltip tooltip="Pact runs on Solana devnet. Switch your wallet to devnet and use devnet SOL.">
      <span className="cursor-default font-medium text-cladd-fg-softer text-xs">
        devnet
      </span>
    </Tooltip>
  );
}
