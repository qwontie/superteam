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
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { partyName } from "@/features/builder/describe";
import { type Draft, draftToSpec } from "@/features/builder/model";
import { jumpTo } from "@/features/builder/parts";
import { anchors, type Problem } from "@/features/builder/problems";
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
  detail: "Fix what is marked on the blocks and try again.",
  kind: "unknown",
  title: "The deal is not ready to sign",
};

const BUILD_FAILED: TxFailure = {
  detail: "The transaction could not be prepared. Nothing was sent.",
  kind: "unknown",
  title: "Could not prepare the transaction",
};

interface CreateValue {
  canLockLater: boolean;
  create: (fund: boolean) => void;
  failure: TxFailure | null;
  funds: boolean;
  pending: string | null;
}

const CreateContext = createContext<CreateValue | null>(null);

export function CreateProvider({ children }: { children: ReactNode }) {
  const { replace, setCreated, validation, wallet } = useBuilder();
  const draft = useDraft();
  const { connected } = useWallet();
  const { pending, send } = useSendTx();
  const [failure, setFailure] = useState<TxFailure | null>(null);

  const run = useCallback(
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

  const create = useCallback(
    (fund: boolean) => {
      run(fund).catch(() => setFailure(BUILD_FAILED));
    },
    [run]
  );

  const { spec } = validation;
  const funds =
    spec !== null && wallet !== null && spec.parties[spec.funder] === wallet;
  const value = useMemo<CreateValue>(
    () => ({
      canLockLater: funds && pending === null,
      create,
      failure,
      funds,
      pending,
    }),
    [create, failure, funds, pending]
  );
  return <CreateContext value={value}>{children}</CreateContext>;
}

export const useCreate = () => {
  const value = useContext(CreateContext);
  if (!value) {
    throw new Error("useCreate must be used inside CreateProvider");
  }
  return value;
};

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

const waitsForWallet = (draft: Draft, wallet: string | null) =>
  new Set(
    wallet === null
      ? draft.parties
          .filter((party) => party.me)
          .map((party) => anchors.party(party.id))
      : []
  );

const missingAddresses = (draft: Draft) =>
  draft.parties.filter(
    (party) => !(party.open || party.me) && party.address.trim() === ""
  ).length +
  draft.checks.reduce(
    (sum, check) =>
      sum +
      check.reviewers.filter((reviewer) => reviewer.address.trim() === "")
        .length,
    0
  );

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const gapLabel = (draft: Draft, open: Problem[]) => {
  const errors = open.filter((problem) => !problem.todo);
  if (errors.length > 0) {
    return `Fix ${plural(errors.length, "problem", "problems")}`;
  }
  const addresses = missingAddresses(draft);
  return addresses === open.length
    ? `${plural(addresses, "address", "addresses")} missing`
    : `${plural(open.length, "thing", "things")} missing`;
};

const openWalletMenu = () => {
  const trigger = [
    ...document.querySelectorAll<HTMLButtonElement>("header button"),
  ].find((button) => button.textContent?.includes("Connect wallet"));
  trigger?.click();
};

export function PrimaryButton({ className }: { className?: string }) {
  const { locked, validation, wallet } = useBuilder();
  const draft = useDraft();
  const { ready } = useWallet();
  const { create, funds, pending } = useCreate();
  const rent = useRent();
  const waiting = waitsForWallet(draft, wallet);
  const open = validation.problems.filter(
    (problem) => !(problem.todo && waiting.has(problem.anchor))
  );
  const first = open.find((problem) => !problem.todo) ?? open[0];
  const jump = useCallback(() => {
    if (first) {
      jumpTo(first.anchor);
    }
  }, [first]);
  const createOnly = useCallback(() => create(false), [create]);
  const createAndFund = useCallback(() => create(true), [create]);
  const shared = {
    className,
    size: "2xl",
    variant: "solid-fill",
  } as const;

  if (locked) {
    return (
      <Button {...shared} disabled loading>
        Building
      </Button>
    );
  }
  if (first) {
    return (
      <Button {...shared} onClick={jump} title={first.text}>
        {gapLabel(draft, open)}
      </Button>
    );
  }
  if (wallet === null) {
    return (
      <Button {...shared} loading={!ready} onClick={openWalletMenu}>
        Connect wallet
      </Button>
    );
  }
  const { spec } = validation;
  if (!spec) {
    return null;
  }
  const amount = `${lamportsToSol(spec.amount)} SOL`;
  const rentNote =
    typeof rent.data === "bigint"
      ? `The deal account takes ${lamportsToSol(rent.data)} SOL of rent from your wallet. It comes back when the deal is closed.`
      : undefined;
  if (funds) {
    return (
      <Button
        {...shared}
        disabled={pending !== null}
        loading={pending === FUND_LABEL}
        onClick={createAndFund}
        title={rentNote}
      >
        Create and lock {amount}
      </Button>
    );
  }
  return (
    <Button
      {...shared}
      disabled={pending !== null}
      loading={pending === CREATE_LABEL}
      onClick={createOnly}
      title={`${partyName(draft, draft.funder)} locks the ${amount} from the deal page. ${rentNote ?? ""}`}
    >
      Create the deal
    </Button>
  );
}

export function CreateFailure() {
  const { failure } = useCreate();
  if (!failure) {
    return null;
  }
  return (
    <p className="flex flex-wrap gap-x-2 text-sm" role="alert">
      <span className="font-medium text-pact-stop">{failure.title}</span>
      <span className="text-cladd-fg-soft">{failure.detail}</span>
    </p>
  );
}
