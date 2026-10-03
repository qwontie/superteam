import { cn } from "@cladd-ui/react";
import { type ChangeEvent, useCallback } from "react";
import { StatusPill, VaultAmount } from "@/components/pact/vault";
import { Arrive } from "@/features/builder/arrive";
import { amountLamports, type Draft } from "@/features/builder/model";
import { anchorId } from "@/features/builder/parts";
import { PartyChip, type Place } from "@/features/builder/party-chip";
import { anchors } from "@/features/builder/problems";
import { useBuilder, useDraft } from "@/features/builder/state";

export const VAULT_FLIGHT = "builder-vault";

const AMOUNT = /^\d{0,10}(\.\d{0,9})?$/;
const MIN_CHARS = 1;

const setFunder: Place = (draft, partyId) => ({ ...draft, funder: partyId });

const idleParties = (draft: Draft) => {
  const used = new Set<string>([draft.funder]);
  for (const rule of draft.rules) {
    for (const payout of rule.pay) {
      used.add(payout.party);
    }
    for (const condition of rule.when) {
      if (condition.type === "signed" || condition.type === "unsigned") {
        used.add(condition.party);
      }
    }
  }
  return draft.parties.filter((party) => !used.has(party.id));
};

function AmountField() {
  const { edit, locked } = useBuilder();
  const draft = useDraft();
  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const amount = event.target.value.replace(",", ".").trim();
      if (AMOUNT.test(amount)) {
        edit((d) => ({ ...d, amount }));
      }
    },
    [edit]
  );
  const missing = amountLamports(draft.amount) === null;
  return (
    <label className="inline-flex items-baseline gap-2">
      <span className="sr-only">Amount in SOL</span>
      <input
        autoComplete="off"
        className={cn(
          "min-w-0 border-b bg-transparent font-display font-semibold text-3xl text-cladd-fg tabular-nums leading-tight tracking-[-0.03em] outline-none transition-colors duration-200 placeholder:text-cladd-fg-softer focus:border-cladd-fg focus-visible:outline-none!",
          missing
            ? "border-cladd-fg-softer border-dashed"
            : "border-transparent hover:border-cladd-outline"
        )}
        disabled={locked}
        id={anchorId(anchors.amount)}
        inputMode="decimal"
        onChange={change}
        placeholder="0"
        style={{ width: `${Math.max(MIN_CHARS, draft.amount.length) + 0.4}ch` }}
        value={draft.amount}
      />
      <span className="font-medium text-cladd-fg-soft text-lg">SOL</span>
    </label>
  );
}

export function MoneyLine({ settled }: { settled: boolean }) {
  const { mode } = useBuilder();
  const draft = useDraft();
  const lamports = amountLamports(draft.amount);
  const playing = mode === "play";
  const funder = draft.parties.find((party) => party.id === draft.funder);
  const idle = playing ? [] : idleParties(draft);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {playing && lamports !== null ? (
        <>
          <VaultAmount
            flightId={VAULT_FLIGHT}
            key={settled ? "empty" : "full"}
            lamports={lamports}
            size="md"
            status={settled ? "settled" : "funded"}
          />
          <StatusPill status={settled ? "settled" : "funded"} />
        </>
      ) : (
        <AmountField />
      )}
      {funder ? (
        <>
          <span className="text-cladd-fg-soft">from</span>
          <Arrive key={funder.id}>
            <PartyChip
              allowOpen={false}
              options={draft.parties.filter(
                (party) => !party.open && party.id !== funder.id
              )}
              party={funder}
              pickLabel="Someone else pays in"
              place={setFunder}
            />
          </Arrive>
        </>
      ) : null}
      {idle.map((party) => (
        <PartyChip key={party.id} party={party} />
      ))}
    </div>
  );
}
