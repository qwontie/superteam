import {
  Button,
  type ButtonSize,
  cn,
  Tooltip,
  useDialog,
} from "@cladd-ui/react";
import type { Instruction, TransactionSigner } from "@solana/kit";
import type { QueryKey } from "@tanstack/react-query";
import { type ReactNode, useCallback, useState } from "react";
import { type TxFailure, useSendTx } from "@/lib/tx";
import { useWallet } from "@/lib/use-wallet";

export type BuildInstruction = (
  signer: TransactionSigner
) => Instruction | Promise<Instruction>;

interface TxButtonProps {
  align?: "start" | "end" | "sm-end";
  build: BuildInstruction;
  children: ReactNode;
  confirm?: { keep: string; text: string; title: string };
  disabled?: boolean;
  hint?: string;
  invalidate?: readonly QueryKey[];
  onDone?: () => void;
  quiet?: boolean;
  size?: ButtonSize;
  txLabel: string;
}

const ALIGN = {
  end: { anchor: "self-end", box: "items-end", text: "-ml-64 text-right" },
  "sm-end": {
    anchor: "self-start sm:self-end",
    box: "items-start sm:items-end",
    text: "sm:-ml-64 sm:text-right",
  },
  start: { anchor: "self-start", box: "items-start", text: "" },
} as const;

const NO_SIGNER: TxFailure = {
  detail: "Connect a wallet that can sign transactions.",
  kind: "wallet",
  title: "This wallet cannot sign",
};

const BUILD_FAILED: TxFailure = {
  detail: "The transaction could not be prepared. Nothing was sent.",
  kind: "unknown",
  title: "Could not prepare the transaction",
};

export function TxButton({
  align = "end",
  build,
  txLabel,
  children,
  confirm,
  disabled = false,
  hint,
  invalidate,
  onDone,
  quiet = false,
  size = "xl",
}: TxButtonProps) {
  const { send, pending } = useSendTx();
  const { connected } = useWallet();
  const dialog = useDialog();
  const [failure, setFailure] = useState<TxFailure | null>(null);

  const run = useCallback(async () => {
    const signer = connected?.signer;
    if (!signer) {
      setFailure(NO_SIGNER);
      return;
    }
    setFailure(null);
    let instruction: Instruction;
    try {
      instruction = await build(signer);
    } catch {
      setFailure(BUILD_FAILED);
      return;
    }
    const outcome = await send([instruction], { invalidate, label: txLabel });
    if (outcome.ok) {
      onDone?.();
    } else {
      setFailure(outcome.failure);
    }
  }, [build, connected, invalidate, onDone, send, txLabel]);

  const click = useCallback(() => {
    if (!confirm) {
      run().catch(() => undefined);
      return;
    }
    dialog.confirm({
      cancelButtonText: confirm.keep,
      confirmButtonColor: "stop",
      confirmButtonText: txLabel,
      onConfirm: () => {
        run().catch(() => undefined);
      },
      text: confirm.text,
      title: confirm.title,
    });
  }, [confirm, dialog, run, txLabel]);

  const trigger = (
    <Button
      disabled={disabled || pending !== null}
      loading={pending === txLabel}
      onClick={click}
      size={size}
      variant={quiet ? "solid" : "solid-fill"}
    >
      {children}
    </Button>
  );

  const button = hint ? <Tooltip tooltip={hint}>{trigger}</Tooltip> : trigger;

  return (
    <div className={cn("flex flex-col gap-1.5", ALIGN[align].box)}>
      {button}
      {failure ? (
        <div className={cn("w-0", ALIGN[align].anchor)}>
          <p
            className={cn(
              "w-64 font-medium text-pact-stop text-xs",
              ALIGN[align].text
            )}
            role="alert"
          >
            {failure.title}. {failure.detail}
          </p>
        </div>
      ) : null}
    </div>
  );
}
