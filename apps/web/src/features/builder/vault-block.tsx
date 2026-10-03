import {
  cn,
  List,
  ListButton,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
} from "@cladd-ui/react";
import { ChevronDown } from "lucide-react";
import { type ChangeEvent, useCallback } from "react";
import { PartyAvatar } from "@/components/pact/party";
import { StatusPill, VaultAmount } from "@/components/pact/vault";
import { partyName } from "@/features/builder/describe";
import {
  amountLamports,
  type PartySlot,
  partyAddress,
} from "@/features/builder/model";
import { anchorId, ProblemLines, SlotPill } from "@/features/builder/parts";
import { anchors } from "@/features/builder/problems";
import { useBuilder, useDraft } from "@/features/builder/state";

export const VAULT_FLIGHT = "builder-vault";

const AMOUNT = /^\d{0,10}(\.\d{0,9})?$/;
const MIN_CHARS = 1;

function FunderOption({ party }: { party: PartySlot }) {
  const { edit, wallet } = useBuilder();
  const draft = useDraft();
  const pick = useCallback(
    () => edit((d) => ({ ...d, funder: party.id })),
    [edit, party.id]
  );
  return (
    <PopoverClose>
      <ListButton
        icon={
          <PartyAvatar
            seed={partyAddress(party, wallet) || party.label}
            size={20}
          />
        }
        onClick={pick}
        size="xl"
      >
        {partyName(draft, party.id)}
      </ListButton>
    </PopoverClose>
  );
}

function Funder() {
  const { wallet, locked, mode } = useBuilder();
  const draft = useDraft();
  const funder = draft.parties.find((party) => party.id === draft.funder);
  if (!funder) {
    return null;
  }
  const pill = (
    <SlotPill
      address={partyAddress(funder, wallet) ?? ""}
      empty={funder.me ? "you, connect a wallet" : "add address"}
      label={partyName(draft, funder.id)}
      you={funder.me && wallet !== null}
    />
  );
  if (locked || mode === "play") {
    return pill;
  }
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <button
          aria-label="Choose who pays into the vault"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full text-cladd-fg-soft"
          type="button"
        >
          {pill}
          <ChevronDown aria-hidden="true" size={15} />
        </button>
      </PopoverTrigger>
      <Popover className="w-64" offset={8} position="bottom-start">
        <List className="p-1.5">
          {draft.parties
            .filter((party) => !party.open)
            .map((party) => (
              <FunderOption key={party.id} party={party} />
            ))}
        </List>
      </Popover>
    </PopoverRoot>
  );
}

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
  return (
    <label
      className={cn(
        "inline-flex items-baseline gap-2 rounded-block bg-cladd-surface-cut py-2.5 pr-4 pl-3.5 shadow-cladd-cut-outline transition-shadow duration-200",
        "focus-within:shadow-[inset_0_0_0_1.5px_var(--color-cladd-fg)]"
      )}
    >
      <span className="sr-only">Amount in SOL</span>
      <input
        autoComplete="off"
        className="min-w-0 bg-transparent font-display font-semibold text-4xl text-cladd-fg tabular-nums leading-none tracking-[-0.03em] outline-none placeholder:text-cladd-fg-softer focus-visible:outline-none!"
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

export function VaultBlock({ settled }: { settled: boolean }) {
  const { mode } = useBuilder();
  const draft = useDraft();
  const lamports = amountLamports(draft.amount);
  const playing = mode === "play";
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex flex-col gap-2">
          <span className="text-cladd-fg-soft text-sm">
            {playing ? "In the vault" : "Goes into the vault"}
          </span>
          {playing ? (
            <div className="flex min-h-[3.75rem] flex-wrap items-center gap-3">
              {lamports === null ? (
                <span className="font-display font-semibold text-4xl text-cladd-fg-softer leading-none tracking-[-0.03em]">
                  No amount yet
                </span>
              ) : (
                <VaultAmount
                  flightId={VAULT_FLIGHT}
                  key={settled ? "empty" : "full"}
                  lamports={lamports}
                  status={settled ? "settled" : "funded"}
                />
              )}
              <StatusPill status={settled ? "settled" : "funded"} />
            </div>
          ) : (
            <AmountField />
          )}
        </div>
        <div className="flex flex-col gap-2 pb-1">
          <span className="text-cladd-fg-soft text-sm">Paid in by</span>
          <Funder />
        </div>
      </div>
      <ProblemLines anchor={anchors.amount} />
    </section>
  );
}
