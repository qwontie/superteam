import {
  Button,
  Input,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
  Switch,
} from "@cladd-ui/react";
import { Plus } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { PartyAvatar } from "@/components/pact/party";
import { partyName } from "@/features/builder/describe";
import {
  addParty,
  canAddParty,
  canRemoveParty,
  type Draft,
  type PartySlot,
  partyAddress,
  removeParty,
  updateParty,
} from "@/features/builder/model";
import {
  AddressField,
  Field,
  POPOVER_BODY,
  pickedClass,
  RemoveLine,
  SlotPill,
} from "@/features/builder/parts";
import { anchors } from "@/features/builder/problems";
import { useBuilder, useDraft } from "@/features/builder/state";
import { shortAddress } from "@/lib/format";

export type Place = (draft: Draft, partyId: string) => Draft;

const LABEL_MAX = 40;

const emptyText = (party: PartySlot) => {
  if (party.open) {
    return "decided later";
  }
  return party.me ? "you" : "add address";
};

export function PartyFields({
  allowOpen = true,
  focus = false,
  party,
}: {
  allowOpen?: boolean;
  focus?: boolean;
  party: PartySlot;
}) {
  const { edit, wallet } = useBuilder();
  const rename = useCallback(
    (label: string) => edit((d) => updateParty(d, party.id, { label })),
    [edit, party.id]
  );
  const setAddress = useCallback(
    (address: string) => edit((d) => updateParty(d, party.id, { address })),
    [edit, party.id]
  );
  const toggleMe = useCallback(
    () => edit((d) => updateParty(d, party.id, { me: !party.me })),
    [edit, party.id, party.me]
  );
  const setOpen = useCallback(
    (open: boolean) =>
      edit((d) => updateParty(d, party.id, { address: "", me: false, open })),
    [edit, party.id]
  );
  return (
    <>
      <Field label="Role">
        <Input
          inputComponentProps={{ "aria-label": "Role in the deal" }}
          maxLength={LABEL_MAX}
          onChange={rename}
          placeholder="Client, Freelancer, Sponsor"
          size="xl"
          value={party.label}
        />
      </Field>
      {party.open ? null : (
        <Field label="Wallet">
          {party.me ? (
            <p className="flex min-h-10 items-center text-sm">
              {wallet ? (
                <span className="font-mono text-cladd-fg-soft">
                  {shortAddress(wallet)}
                </span>
              ) : (
                "Fills in when you connect"
              )}
            </p>
          ) : (
            <AddressField
              autoFocus={focus}
              label={`Wallet address of ${party.label}`}
              onChange={setAddress}
              value={party.address}
            />
          )}
        </Field>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {party.open ? null : (
          <Button
            aria-pressed={party.me}
            className={pickedClass(party.me)}
            onClick={toggleMe}
            size="lg"
          >
            This is me
          </Button>
        )}
        {allowOpen ? (
          <span className="ml-auto flex items-center gap-2 text-sm">
            Decide later
            <Switch
              aria-label="Decide later: the place stays open until a check names the wallet"
              checked={party.open}
              color="neutral"
              onChange={setOpen}
            />
          </span>
        ) : null}
      </div>
    </>
  );
}

function PickOption({ party, place }: { party: PartySlot; place: Place }) {
  const { edit, wallet } = useBuilder();
  const draft = useDraft();
  const pick = useCallback(
    () => edit((d) => place(d, party.id)),
    [edit, party.id, place]
  );
  return (
    <Button onClick={pick} rounded size="lg">
      <PartyAvatar
        seed={party.open ? null : partyAddress(party, wallet) || party.label}
        size={18}
      />
      {partyName(draft, party.id)}
    </Button>
  );
}

export function PartyPicker({
  label,
  options,
  place,
}: {
  label: string;
  options: PartySlot[];
  place: Place;
}) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const addNew = useCallback(
    () =>
      edit((d) => {
        const next = addParty(d, false);
        const created = next.parties.at(-1);
        return created && next !== d ? place(next, created.id) : d;
      }),
    [edit, place]
  );
  if (options.length === 0 && !canAddParty(draft)) {
    return null;
  }
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5">
        {options.map((party) => (
          <PickOption key={party.id} party={party} place={place} />
        ))}
        {canAddParty(draft) ? (
          <Button
            aria-label="New party"
            onClick={addNew}
            rounded
            size="lg"
            square
          >
            <Plus aria-hidden="true" size={15} />
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

interface PartyChipProps {
  allowOpen?: boolean;
  extra?: ReactNode;
  options?: PartySlot[];
  party: PartySlot;
  pickLabel?: string;
  place?: Place;
}

export function PartyChip({
  allowOpen = true,
  extra,
  options = [],
  party,
  pickLabel = "Someone else",
  place,
}: PartyChipProps) {
  const { edit, locked, mode, wallet } = useBuilder();
  const draft = useDraft();
  const name = partyName(draft, party.id);
  const remove = useCallback(
    () => edit((d) => removeParty(d, party.id)),
    [edit, party.id]
  );
  const pill = (
    <SlotPill
      address={partyAddress(party, wallet) ?? ""}
      empty={emptyText(party)}
      label={name}
      open={party.open}
      you={party.me && wallet !== null}
    />
  );
  if (locked || mode === "play") {
    return pill;
  }
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <button
          aria-label={`Edit ${name}`}
          className="max-w-full rounded-full"
          data-anchor={anchors.party(party.id)}
          type="button"
        >
          {pill}
        </button>
      </PopoverTrigger>
      <Popover
        className="w-80 max-w-[calc(100vw-2rem)]"
        offset={8}
        position="bottom-start"
      >
        <div className={POPOVER_BODY}>
          <PartyFields allowOpen={allowOpen} focus party={party} />
          {place ? (
            <PartyPicker label={pickLabel} options={options} place={place} />
          ) : null}
          {extra}
          {canRemoveParty(draft) && draft.funder !== party.id ? (
            <PopoverClose>
              <RemoveLine label="Remove from the deal" onClick={remove} />
            </PopoverClose>
          ) : null}
        </div>
      </Popover>
    </PopoverRoot>
  );
}
