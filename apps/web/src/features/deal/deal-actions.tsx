import { Button, Input } from "@cladd-ui/react";
import {
  type DealEvaluation,
  type DealState,
  getAttestInstruction,
  getCancelInstruction,
  getCloseInstruction,
  getExecuteInstruction,
  getFundInstruction,
  getSignalInstruction,
  lamportsToSol,
} from "@pact/sdk";
import { isAddress, address as toAddress } from "@solana/kit";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { type BuildInstruction, TxButton } from "@/components/shell/tx-button";
import { dealInvalidation } from "@/features/deal/queries";
import { shortAddress } from "@/lib/format";
import {
  signatureMatters,
  type WalletRoles,
  type WitnessSeat,
} from "@/lib/pact";

export type Primary =
  | { kind: "execute"; rule: number }
  | { kind: "fund" }
  | { kind: "sign" }
  | { kind: "vote"; check: number }
  | { kind: "close" }
  | null;

export interface Moves {
  cancel: boolean;
  close: boolean;
  fund: boolean;
  primary: Primary;
  sign: number | null;
  votes: WitnessSeat[];
}

interface DealActionProps {
  deal: DealState;
  labels: readonly string[];
  moves: Moves;
}

const VOTE_HINT = "One vote. It cannot be changed.";

const firstPrimary = (
  moves: Omit<Moves, "primary">,
  executable: readonly number[]
): Primary => {
  const [rule] = executable;
  if (rule !== undefined) {
    return { kind: "execute", rule };
  }
  if (moves.fund) {
    return { kind: "fund" };
  }
  if (moves.sign !== null) {
    return { kind: "sign" };
  }
  const [seat] = moves.votes;
  if (seat) {
    return { check: seat.check, kind: "vote" };
  }
  return moves.close ? { kind: "close" } : null;
};

export const planMoves = (
  deal: DealState,
  evaluation: DealEvaluation,
  roles: WalletRoles,
  connected: boolean
): Moves => {
  const funded = connected && deal.status === "funded";
  const signs =
    funded &&
    roles.party !== null &&
    deal.signals[roles.party] === null &&
    signatureMatters(deal, roles.party);
  const moves = {
    cancel: connected && deal.status === "draft" && roles.creator,
    close: connected && deal.status === "settled" && roles.creator,
    fund: connected && deal.status === "draft" && roles.funder,
    sign: signs ? roles.party : null,
    votes: funded
      ? roles.witness.filter(
          (seat) => deal.votes[seat.check]?.byWitness[seat.position] === null
        )
      : [],
  };
  return {
    ...moves,
    primary: firstPrimary(moves, funded ? evaluation.executable : []),
  };
};

export function ExecuteButton({
  deal,
  rule,
  quiet = false,
}: {
  deal: DealState;
  quiet?: boolean;
  rule: number;
}) {
  const build = useCallback<BuildInstruction>(
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
    <TxButton
      build={build}
      invalidate={dealInvalidation(deal.address)}
      quiet={quiet}
      txLabel={`Execute rule ${rule + 1}`}
    >
      Execute
    </TxButton>
  );
}

function FundButton({ deal }: { deal: DealState }) {
  const build = useCallback<BuildInstruction>(
    (signer) =>
      getFundInstruction({ deal: toAddress(deal.address), funder: signer }),
    [deal.address]
  );
  const amount = `${lamportsToSol(deal.spec.amount)} SOL`;
  return (
    <TxButton
      align="sm-end"
      build={build}
      hint="Locks the payment in the vault. After that only a rule can move it."
      invalidate={dealInvalidation(deal.address)}
      txLabel={`Fund ${amount}`}
    >
      Fund {amount}
    </TxButton>
  );
}

function CancelButton({ deal }: { deal: DealState }) {
  const navigate = useNavigate();
  const build = useCallback<BuildInstruction>(
    (signer) =>
      getCancelInstruction({ creator: signer, deal: toAddress(deal.address) }),
    [deal.address]
  );
  const leave = useCallback(() => {
    navigate({ to: "/deals" }).catch(() => undefined);
  }, [navigate]);
  return (
    <TxButton
      align="sm-end"
      build={build}
      confirm={{
        keep: "Keep the deal",
        text: "The draft is deleted from the chain for good. Nothing was locked, so no money moves.",
        title: "Cancel this deal?",
      }}
      invalidate={dealInvalidation(deal.address)}
      onDone={leave}
      quiet
      txLabel="Cancel deal"
    >
      Cancel deal
    </TxButton>
  );
}

function CloseButton({ deal, quiet }: { deal: DealState; quiet: boolean }) {
  const navigate = useNavigate();
  const build = useCallback<BuildInstruction>(
    (signer) =>
      getCloseInstruction({ creator: signer, deal: toAddress(deal.address) }),
    [deal.address]
  );
  const leave = useCallback(() => {
    navigate({ to: "/deals" }).catch(() => undefined);
  }, [navigate]);
  const rent = `${lamportsToSol(deal.lamports)} SOL`;
  return (
    <TxButton
      align="sm-end"
      build={build}
      confirm={{
        keep: "Keep the deal",
        text: `The deal page disappears and ${rent} of rent returns to your wallet. The transactions stay on chain.`,
        title: "Close this deal?",
      }}
      hint={`Deletes the deal account and returns its rent, ${rent}, to you.`}
      invalidate={dealInvalidation(deal.address)}
      onDone={leave}
      quiet={quiet}
      txLabel="Close deal"
    >
      Close deal
    </TxButton>
  );
}

const signHint = (deal: DealState, party: number) => {
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
    parts.push(`Rule ${enables.join(" and ")} waits for it.`);
  }
  if (blocks.length > 0) {
    parts.push(`It switches off rule ${blocks.join(" and ")}.`);
  }
  parts.push("It cannot be undone.");
  return parts.join(" ");
};

function SignButton({
  deal,
  party,
  label,
  quiet,
}: {
  deal: DealState;
  label: string;
  party: number;
  quiet: boolean;
}) {
  const build = useCallback<BuildInstruction>(
    (signer) =>
      getSignalInstruction({ deal: toAddress(deal.address), party: signer }),
    [deal.address]
  );
  return (
    <TxButton
      align="sm-end"
      build={build}
      hint={signHint(deal, party)}
      invalidate={dealInvalidation(deal.address)}
      quiet={quiet}
      txLabel={`Sign as ${label}`}
    >
      Sign as {label}
    </TxButton>
  );
}

export function DealAction({ deal, labels, moves }: DealActionProps) {
  const { primary } = moves;
  if (!(moves.fund || moves.cancel || moves.close || moves.sign !== null)) {
    return null;
  }
  return (
    <section
      aria-label="Your move"
      className="flex flex-wrap items-start gap-2 sm:justify-end"
    >
      {moves.cancel ? <CancelButton deal={deal} /> : null}
      {moves.fund ? <FundButton deal={deal} /> : null}
      {moves.sign === null ? null : (
        <SignButton
          deal={deal}
          label={labels[moves.sign] ?? "party"}
          party={moves.sign}
          quiet={primary?.kind !== "sign"}
        />
      )}
      {moves.close ? (
        <CloseButton deal={deal} quiet={primary?.kind !== "close"} />
      ) : null}
    </section>
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

export function VoteAction({
  deal,
  seat,
  quiet,
}: {
  deal: DealState;
  quiet: boolean;
  seat: WitnessSeat;
}) {
  const [value, setValue] = useState("");
  const check = deal.spec.checks[seat.check];
  const binding = typeof check?.binds === "number";
  const nominee = value.trim();
  const valid = isAddress(nominee);
  const named = [
    ...new Set(
      (deal.votes[seat.check]?.nominees ?? []).filter(
        (entry): entry is string => entry !== null
      )
    ),
  ];
  const yes = useCallback<BuildInstruction>(
    (signer) =>
      getAttestInstruction({
        check: seat.check,
        deal: toAddress(deal.address),
        nominee: binding ? nominee : undefined,
        verdict: true,
        witness: signer,
      }),
    [binding, deal.address, nominee, seat.check]
  );
  const no = useCallback<BuildInstruction>(
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
  const yesLabel = binding ? "Vote for this winner" : "Vote yes";
  return (
    <section aria-label="Your vote" className="flex flex-col gap-2 pt-1">
      {binding ? (
        <div className="flex max-w-md flex-col gap-2">
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
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        <TxButton
          align="start"
          build={yes}
          disabled={binding && !valid}
          hint={VOTE_HINT}
          invalidate={dealInvalidation(deal.address)}
          quiet={quiet}
          txLabel={yesLabel}
        >
          {yesLabel}
        </TxButton>
        <TxButton
          align="start"
          build={no}
          hint={VOTE_HINT}
          invalidate={dealInvalidation(deal.address)}
          quiet
          txLabel="Vote no"
        >
          Vote no
        </TxButton>
      </div>
    </section>
  );
}
