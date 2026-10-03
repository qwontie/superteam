import { Button } from "@cladd-ui/react";
import {
  DEAL_ACCOUNT_SIZE,
  getCreateDealInstruction,
  getFundInstruction,
  lamportsToSol,
  newDealId,
  nowSeconds,
  validateDealSpec,
} from "@pact/sdk";
import { useQuery } from "@tanstack/react-query";
import { Circle, CircleAlert, CircleCheck } from "lucide-react";
import { useCallback, useState } from "react";
import { WalletButton } from "@/components/shell/wallet-button";
import { partyName } from "@/features/builder/describe";
import { draftToSpec } from "@/features/builder/model";
import { anchorId } from "@/features/builder/parts";
import type { Problem } from "@/features/builder/problems";
import { useBuilder, useDraft } from "@/features/builder/state";
import { type TxFailure, useSendTx } from "@/lib/tx";
import { useAppClient } from "@/lib/use-app-client";
import { useWallet } from "@/lib/use-wallet";

const CREATE_LABEL = "Create the deal";
const FUND_LABEL = "Create and lock funds";
const RENT_STALE_MS = 3_600_000;
const INVALIDATE = [["deals"], ["balance"]] as const;

const NO_SIGNER: TxFailure = {
  detail: "Connect a wallet that can sign transactions.",
  kind: "wallet",
  title: "This wallet cannot sign",
};

const CHANGED: TxFailure = {
  detail: "Look at the list above, fix what is marked and try again.",
  kind: "unknown",
  title: "The deal is not ready to sign",
};

const BUILD_FAILED: TxFailure = {
  detail: "The transaction could not be prepared. Nothing was sent.",
  kind: "unknown",
  title: "Could not prepare the transaction",
};

function ProblemLink({ problem }: { problem: Problem }) {
  const jump = useCallback(() => {
    const target = document.getElementById(anchorId(problem.anchor));
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }, [problem.anchor]);
  return (
    <li>
      <button
        className="flex w-full items-start gap-2 rounded-chip px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-cladd-surface-hover"
        onClick={jump}
        type="button"
      >
        {problem.todo ? (
          <Circle
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-cladd-fg-softer"
            size={15}
          />
        ) : (
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-pact-stop"
            size={15}
          />
        )}
        <span className={problem.todo ? undefined : "text-pact-stop"}>
          {problem.text}
        </span>
      </button>
    </li>
  );
}

const useRent = () => {
  const client = useAppClient();
  return useQuery({
    queryFn: async () =>
      await client.rpc
        .getMinimumBalanceForRentExemption(BigInt(DEAL_ACCOUNT_SIZE))
        .send(),
    queryKey: ["deal-rent"],
    staleTime: RENT_STALE_MS,
  });
};

const useCreate = () => {
  const { setCreated, replace, wallet } = useBuilder();
  const draft = useDraft();
  const { connected } = useWallet();
  const { pending, send } = useSendTx();
  const [failure, setFailure] = useState<TxFailure | null>(null);

  const create = useCallback(
    async (fund: boolean) => {
      const signer = connected?.signer;
      if (!signer) {
        setFailure(NO_SIGNER);
        return;
      }
      const checked = validateDealSpec(
        draftToSpec(draft, wallet),
        nowSeconds()
      );
      if (!checked.ok) {
        setFailure(CHANGED);
        return;
      }
      setFailure(null);
      let instruction: Awaited<ReturnType<typeof getCreateDealInstruction>>;
      try {
        instruction = await getCreateDealInstruction({
          creator: signer,
          dealId: newDealId(),
          spec: checked.spec,
        });
      } catch {
        setFailure(BUILD_FAILED);
        return;
      }
      const { deal } = instruction;
      const outcome = await send(
        fund
          ? [instruction, getFundInstruction({ deal, funder: signer })]
          : [instruction],
        { invalidate: INVALIDATE, label: fund ? FUND_LABEL : CREATE_LABEL }
      );
      if (!outcome.ok) {
        setFailure(outcome.failure);
        return;
      }
      setCreated({
        address: deal,
        funded: fund,
        funder: partyName(draft, draft.funder),
        lamports: checked.spec.amount,
        signature: outcome.signature,
        title: checked.spec.title,
      });
      replace(null);
    },
    [connected, draft, replace, send, setCreated, wallet]
  );

  return { create, failure, pending };
};

function Actions() {
  const { validation, wallet } = useBuilder();
  const draft = useDraft();
  const { create, failure, pending } = useCreate();
  const rent = useRent();
  const { spec } = validation;
  const funds = spec !== null && spec.parties[spec.funder] === wallet;
  const createOnly = useCallback(() => {
    create(false).catch(() => undefined);
  }, [create]);
  const createAndFund = useCallback(() => {
    create(true).catch(() => undefined);
  }, [create]);
  if (!spec) {
    return null;
  }
  const amount = `${lamportsToSol(spec.amount)} SOL`;
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-sm">
        <CircleCheck
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-pact-money"
          size={16}
        />
        Every block is complete. You sign exactly the rules on this canvas, and
        nobody can change them afterwards.
      </p>
      {funds ? (
        <>
          <Button
            className="justify-center font-semibold"
            disabled={pending !== null}
            loading={pending === FUND_LABEL}
            onClick={createAndFund}
            size="2xl"
            variant="solid-fill"
          >
            Create and lock {amount}
          </Button>
          <Button
            className="justify-center"
            disabled={pending !== null}
            loading={pending === CREATE_LABEL}
            onClick={createOnly}
            size="xl"
          >
            Create now, lock the funds later
          </Button>
        </>
      ) : (
        <>
          <Button
            className="justify-center font-semibold"
            disabled={pending !== null}
            loading={pending === CREATE_LABEL}
            onClick={createOnly}
            size="2xl"
            variant="solid-fill"
          >
            Create the deal
          </Button>
          <p className="text-cladd-fg-soft text-sm">
            You are not the one who pays in. {partyName(draft, draft.funder)}{" "}
            locks the {amount} from the deal page.
          </p>
        </>
      )}
      {failure ? (
        <p className="flex flex-col gap-0.5 text-sm" role="alert">
          <span className="font-medium text-pact-stop">{failure.title}</span>
          <span className="text-cladd-fg-soft">{failure.detail}</span>
        </p>
      ) : null}
      {typeof rent.data === "bigint" ? (
        <p className="text-cladd-fg-soft text-xs">
          The deal account takes {lamportsToSol(rent.data)} SOL of rent from
          your wallet. It comes back to you when the deal is closed.
        </p>
      ) : null}
    </div>
  );
}

function Wallet() {
  const { ready } = useWallet();
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm">
        {ready
          ? "Connect a wallet on devnet to sign and create this deal. Everything on the canvas stays as it is."
          : "Looking for a wallet in this browser."}
      </p>
      <WalletButton />
    </div>
  );
}

export function CreatePanel() {
  const { locked, validation, wallet } = useBuilder();
  const count = validation.problems.length;
  const ordered = [
    ...validation.problems.filter((problem) => !problem.todo),
    ...validation.problems.filter((problem) => problem.todo),
  ];
  if (locked) {
    return null;
  }
  return (
    <section
      aria-label="Sign and create"
      className="flex flex-col gap-4 rounded-block bg-cladd-surface p-4 shadow-cladd-outline"
    >
      {count > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="font-display font-semibold text-base">
            {count === 1 ? "1 thing left" : `${count} things left`} before
            signing
          </h2>
          <ul className="-mx-2 flex flex-col">
            {ordered.map((problem) => (
              <ProblemLink key={problem.key} problem={problem} />
            ))}
          </ul>
        </div>
      ) : null}
      {wallet === null ? <Wallet /> : null}
      {wallet !== null && count === 0 ? <Actions /> : null}
    </section>
  );
}
