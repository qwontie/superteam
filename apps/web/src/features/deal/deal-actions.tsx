import { Button, Input, useDialog } from "@cladd-ui/react";
import {
  type DealEvaluation,
  type DealState,
  getAttestInstruction,
  getCancelInstruction,
  getExecuteInstruction,
  getFundInstruction,
  getSignalInstruction,
  lamportsToSol,
} from "@pact/sdk";
import {
  type Instruction,
  isAddress,
  type TransactionSigner,
  address as toAddress,
} from "@solana/kit";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useState } from "react";
import { WalletButton } from "@/components/shell/wallet-button";
import { dealInvalidation } from "@/features/deal/queries";
import { shortAddress } from "@/lib/format";
import type { WalletRoles, WitnessSeat } from "@/lib/pact";
import { type TxFailure, useSendTx } from "@/lib/tx";
import { useWallet } from "@/lib/use-wallet";

type Build = (signer: TransactionSigner) => Instruction;

interface TxButtonProps {
  build: Build;
  children: ReactNode;
  confirm?: { text: string; title: string };
  deal: DealState;
  disabled?: boolean;
  onDone?: () => void;
  quiet?: boolean;
  txLabel: string;
}

interface DealActionsProps {
  deal: DealState;
  evaluation: DealEvaluation;
  labels: readonly string[];
  roles: WalletRoles;
}

interface MoveProps {
  children: ReactNode;
  text: string;
  title: string;
}

const NO_SIGNER: TxFailure = {
  detail: "Connect a wallet that can sign transactions.",
  kind: "wallet",
  title: "This wallet cannot sign",
};

export function TxButton({
  deal,
  build,
  txLabel,
  children,
  confirm,
  disabled = false,
  onDone,
  quiet = false,
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
    const outcome = await send([build(signer)], {
      invalidate: dealInvalidation(deal.address),
      label: txLabel,
    });
    if (outcome.ok) {
      onDone?.();
    } else {
      setFailure(outcome.failure);
    }
  }, [build, connected, deal.address, onDone, send, txLabel]);

  const click = useCallback(() => {
    if (!confirm) {
      run().catch(() => undefined);
      return;
    }
    dialog.confirm({
      confirmButtonColor: "stop",
      confirmButtonText: txLabel,
      onConfirm: () => {
        run().catch(() => undefined);
      },
      text: confirm.text,
      title: confirm.title,
    });
  }, [confirm, dialog, run, txLabel]);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        disabled={disabled || pending !== null}
        loading={pending === txLabel}
        onClick={click}
        size="xl"
        variant={quiet ? "solid" : "solid-fill"}
      >
        {children}
      </Button>
      {failure ? (
        <p
          className="max-w-64 text-right font-medium text-pact-stop text-xs"
          role="alert"
        >
          {failure.title}. {failure.detail}
        </p>
      ) : null}
    </div>
  );
}

export function ExecuteButton({
  deal,
  rule,
}: {
  deal: DealState;
  rule: number;
}) {
  const build = useCallback<Build>(
    (signer) =>
      getExecuteInstruction({
        deal: toAddress(deal.address),
        executor: signer,
        parties: deal.spec.parties,
        rule,
      }),
    [deal.address, deal.spec.parties, rule]
  );
  return (
    <TxButton build={build} deal={deal} txLabel={`Execute rule ${rule + 1}`}>
      Execute
    </TxButton>
  );
}

function Move({ title, text, children }: MoveProps) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 max-w-md flex-1 basis-56 flex-col gap-1">
        <span className="font-medium">{title}</span>
        <span className="text-cladd-fg-soft text-sm">{text}</span>
      </div>
      <div className="flex flex-wrap items-start justify-end gap-2">
        {children}
      </div>
    </li>
  );
}

function FundMove({ deal }: { deal: DealState }) {
  const build = useCallback<Build>(
    (signer) =>
      getFundInstruction({ deal: toAddress(deal.address), funder: signer }),
    [deal.address]
  );
  const amount = `${lamportsToSol(deal.spec.amount)} SOL`;
  return (
    <Move
      text="The money moves into the vault of this deal. From then on it can leave only through one of the rules."
      title={`Lock ${amount} in the vault`}
    >
      <TxButton build={build} deal={deal} txLabel={`Fund ${amount}`}>
        Fund {amount}
      </TxButton>
    </Move>
  );
}

function CancelMove({ deal }: { deal: DealState }) {
  const navigate = useNavigate();
  const build = useCallback<Build>(
    (signer) =>
      getCancelInstruction({ creator: signer, deal: toAddress(deal.address) }),
    [deal.address]
  );
  const leave = useCallback(() => {
    navigate({ to: "/deals" }).catch(() => undefined);
  }, [navigate]);
  return (
    <Move
      text="Possible only while nobody has funded it. The deal is deleted from the chain and its rent returns to you."
      title="Cancel this draft"
    >
      <TxButton
        build={build}
        confirm={{
          text: "The draft is deleted from the chain for good. Nothing was locked, so no money moves.",
          title: "Cancel this deal?",
        }}
        deal={deal}
        onDone={leave}
        quiet
        txLabel="Cancel deal"
      >
        Cancel deal
      </TxButton>
    </Move>
  );
}

const signEffect = (deal: DealState, party: number) => {
  const enables: number[] = [];
  const blocks: number[] = [];
  for (const [index, rule] of deal.spec.rules.entries()) {
    for (const condition of rule.when) {
      if (condition.type === "signed" && condition.party === party) {
        enables.push(index + 1);
      }
      if (condition.type === "unsigned" && condition.party === party) {
        blocks.push(index + 1);
      }
    }
  }
  const parts: string[] = [];
  if (enables.length > 0) {
    parts.push(`It is a condition of rule ${enables.join(" and ")}.`);
  }
  if (blocks.length > 0) {
    parts.push(`It switches off rule ${blocks.join(" and ")}.`);
  }
  parts.push("A signature cannot be undone.");
  return parts.join(" ");
};

function SignMove({
  deal,
  party,
  label,
}: {
  deal: DealState;
  label: string;
  party: number;
}) {
  const build = useCallback<Build>(
    (signer) =>
      getSignalInstruction({ deal: toAddress(deal.address), party: signer }),
    [deal.address]
  );
  return (
    <Move text={signEffect(deal, party)} title={`Sign as ${label}`}>
      <TxButton build={build} deal={deal} txLabel={`Sign as ${label}`}>
        Sign
      </TxButton>
    </Move>
  );
}

function NomineePick({
  nominee,
  onPick,
}: {
  nominee: string;
  onPick: (nominee: string) => void;
}) {
  const pick = useCallback(() => onPick(nominee), [nominee, onPick]);
  return (
    <Button onClick={pick} size="lg">
      Agree with {shortAddress(nominee)}
    </Button>
  );
}

function NomineeMove({
  deal,
  seat,
  no,
}: {
  deal: DealState;
  no: Build;
  seat: WitnessSeat;
}) {
  const [value, setValue] = useState("");
  const nominee = value.trim();
  const valid = isAddress(nominee);
  const check = deal.spec.checks[seat.check];
  const named = [
    ...new Set(
      (deal.votes[seat.check]?.nominees ?? []).filter(
        (entry): entry is string => entry !== null
      )
    ),
  ];
  const yes = useCallback<Build>(
    (signer) =>
      getAttestInstruction({
        check: seat.check,
        deal: toAddress(deal.address),
        nominee,
        verdict: true,
        witness: signer,
      }),
    [deal.address, nominee, seat.check]
  );
  if (!check) {
    return null;
  }
  return (
    <Move
      text={`You are a witness of this check. Name the winner: the payout goes to the address that ${check.threshold} of ${check.witnesses.length} witnesses agree on. You get one vote and it cannot be changed.`}
      title={`Who wins? "${check.target}"`}
    >
      <div className="flex w-full flex-col gap-2">
        <Input
          errorMessage={
            nominee.length > 0 && !valid
              ? "This is not a Solana address."
              : undefined
          }
          inputClassName="font-mono"
          onChange={setValue}
          placeholder="Winner's Solana address"
          size="xl"
          value={value}
        />
        {named.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {named.map((entry) => (
              <NomineePick key={entry} nominee={entry} onPick={setValue} />
            ))}
          </div>
        ) : null}
      </div>
      <TxButton build={no} deal={deal} quiet txLabel="Vote no">
        Vote no
      </TxButton>
      <TxButton
        build={yes}
        deal={deal}
        disabled={!valid}
        txLabel="Vote for this winner"
      >
        Vote for this winner
      </TxButton>
    </Move>
  );
}

function VoteMove({ deal, seat }: { deal: DealState; seat: WitnessSeat }) {
  const check = deal.spec.checks[seat.check];
  const yes = useCallback<Build>(
    (signer) =>
      getAttestInstruction({
        check: seat.check,
        deal: toAddress(deal.address),
        verdict: true,
        witness: signer,
      }),
    [deal.address, seat.check]
  );
  const no = useCallback<Build>(
    (signer) =>
      getAttestInstruction({
        check: seat.check,
        deal: toAddress(deal.address),
        verdict: false,
        witness: signer,
      }),
    [deal.address, seat.check]
  );
  if (!check) {
    return null;
  }
  if (typeof check.binds === "number") {
    return <NomineeMove deal={deal} no={no} seat={seat} />;
  }
  return (
    <Move
      text="You are a witness of this check. You get one vote and it cannot be changed."
      title={`Is it true? "${check.target}"`}
    >
      <TxButton build={no} deal={deal} quiet txLabel="Vote no">
        Vote no
      </TxButton>
      <TxButton build={yes} deal={deal} txLabel="Vote yes">
        Vote yes
      </TxButton>
    </Move>
  );
}

const roleSentence = (roles: WalletRoles, labels: readonly string[]) => {
  const parts: string[] = [];
  if (roles.party !== null) {
    parts.push(`are the ${labels[roles.party] ?? "party"}`);
  }
  if (roles.witness.length > 0) {
    parts.push("are a witness");
  }
  if (roles.creator) {
    parts.push("created this deal");
  }
  if (parts.length === 0) {
    return "You are not named in this deal.";
  }
  return `You ${parts.join(" and ")}.`;
};

const idleSentence = (
  deal: DealState,
  evaluation: DealEvaluation,
  labels: readonly string[]
) => {
  if (deal.status === "settled") {
    return "This deal is settled. Nothing is left to do.";
  }
  if (deal.status === "draft") {
    return `Waiting for the ${labels[deal.spec.funder] ?? "funder"} to lock the payment.`;
  }
  if (evaluation.executable.length > 0) {
    return "A rule is true right now. Press Execute on it and the money moves: anyone can.";
  }
  return "Nothing for you to do right now. The rules below show what they are waiting for.";
};

const buildMoves = (
  deal: DealState,
  roles: WalletRoles,
  labels: readonly string[]
) => {
  const moves: ReactNode[] = [];
  if (deal.status === "draft" && roles.funder) {
    moves.push(<FundMove deal={deal} key="fund" />);
  }
  if (deal.status === "draft" && roles.creator) {
    moves.push(<CancelMove deal={deal} key="cancel" />);
  }
  if (deal.status !== "funded") {
    return moves;
  }
  if (roles.party !== null && deal.signals[roles.party] === null) {
    moves.push(
      <SignMove
        deal={deal}
        key="sign"
        label={labels[roles.party] ?? "party"}
        party={roles.party}
      />
    );
  }
  for (const seat of roles.witness) {
    if (deal.votes[seat.check]?.byWitness[seat.position] === null) {
      moves.push(
        <VoteMove deal={deal} key={`vote-${seat.check}`} seat={seat} />
      );
    }
  }
  return moves;
};

export function DealActions({
  deal,
  evaluation,
  roles,
  labels,
}: DealActionsProps) {
  const { address, ready } = useWallet();
  if (!ready) {
    return null;
  }
  if (!address) {
    return (
      <section
        aria-label="Your move"
        className="flex flex-wrap items-center justify-between gap-4 rounded-block bg-cladd-surface-cut p-4 shadow-cladd-cut-outline sm:p-5"
      >
        <p className="max-w-md text-cladd-fg-soft text-sm">
          Anyone can read this deal. Connect a wallet to fund, sign, vote or
          execute a rule.
        </p>
        <WalletButton />
      </section>
    );
  }
  const moves = buildMoves(deal, roles, labels);
  return (
    <section
      aria-label="Your move"
      className="flex flex-col gap-4 rounded-block bg-cladd-surface-cut p-4 shadow-cladd-cut-outline sm:p-5"
    >
      <p className="text-cladd-fg-soft text-sm">
        {roleSentence(roles, labels)}{" "}
        {moves.length === 0 ? idleSentence(deal, evaluation, labels) : null}
      </p>
      {moves.length > 0 ? (
        <ul className="flex flex-col gap-5">{moves}</ul>
      ) : null}
    </section>
  );
}
