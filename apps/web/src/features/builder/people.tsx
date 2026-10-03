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
import { useCallback } from "react";
import { Arrive } from "@/features/builder/arrive";
import {
  addParty,
  canAddParty,
  canRemoveParty,
  type PartySlot,
  partyAddress,
  removeParty,
  updateParty,
} from "@/features/builder/model";
import {
  AddressField,
  anchorId,
  Field,
  ProblemLines,
  RemoveLine,
  SECTION_TITLE,
  SlotPill,
} from "@/features/builder/parts";
import { anchors } from "@/features/builder/problems";
import { useBuilder, useDraft } from "@/features/builder/state";
import { shortAddress } from "@/lib/format";

const LABEL_MAX = 40;

const emptyText = (party: PartySlot) => {
  if (party.open) {
    return "named later";
  }
  return party.me ? "you, connect a wallet" : "add address";
};

function PartyForm({ party }: { party: PartySlot }) {
  const { edit, wallet } = useBuilder();
  const draft = useDraft();
  const funds = draft.funder === party.id;

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
  const makeFunder = useCallback(
    () => edit((d) => ({ ...d, funder: party.id })),
    [edit, party.id]
  );
  const remove = useCallback(
    () => edit((d) => removeParty(d, party.id)),
    [edit, party.id]
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <Field label="Role in the deal">
        <Input
          maxLength={LABEL_MAX}
          onChange={rename}
          placeholder="Client, Freelancer, Sponsor"
          size="xl"
          value={party.label}
        />
      </Field>
      {party.open ? (
        <p className="text-cladd-fg-soft text-sm">
          Nobody holds this place yet. The reviewers of a check name the wallet
          later, and only then can a rule pay it.
        </p>
      ) : (
        <Field label="Wallet">
          {party.me ? (
            <p className="text-sm">
              {wallet ? (
                <>
                  Your connected wallet{" "}
                  <span className="font-mono text-cladd-fg-soft">
                    {shortAddress(wallet)}
                  </span>
                </>
              ) : (
                "Your wallet. It fills in when you connect one."
              )}
            </p>
          ) : (
            <AddressField
              autoFocus
              label={`Wallet address of ${party.label}`}
              onChange={setAddress}
              value={party.address}
            />
          )}
          <Button onClick={toggleMe} size="lg">
            {party.me ? "Use another address" : "This is me"}
          </Button>
        </Field>
      )}
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>
          Not known yet
          <span className="block text-cladd-fg-soft text-xs">
            An open place, for a bounty winner
          </span>
        </span>
        <Switch
          aria-label="This party is not known yet"
          checked={party.open}
          color="neutral"
          onChange={setOpen}
        />
      </div>
      {party.open ? null : (
        <Button disabled={funds} onClick={makeFunder} size="xl">
          {funds ? "Pays into the vault" : "Make this the one who pays in"}
        </Button>
      )}
      <PopoverClose>
        <RemoveLine
          disabled={!canRemoveParty(draft)}
          label="Remove from the deal"
          onClick={remove}
        />
      </PopoverClose>
    </div>
  );
}

function PartyEditor({ party }: { party: PartySlot }) {
  const { wallet, locked, mode } = useBuilder();
  const address = partyAddress(party, wallet) ?? "";
  const pill = (
    <SlotPill
      address={address}
      empty={emptyText(party)}
      label={party.label || "Unnamed"}
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
          aria-label={`Edit ${party.label || "party"}`}
          className="max-w-full rounded-full"
          id={anchorId(anchors.party(party.id))}
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
        <PartyForm party={party} />
      </Popover>
    </PopoverRoot>
  );
}

export function People() {
  const { edit, locked, mode } = useBuilder();
  const draft = useDraft();
  const add = useCallback(() => edit((d) => addParty(d, false)), [edit]);
  const editable = !locked && mode === "build";
  return (
    <section className="flex flex-col gap-3">
      <h2 className={SECTION_TITLE}>Who is in the deal</h2>
      <div className="flex flex-wrap items-center gap-2">
        {draft.parties.map((party) => (
          <Arrive key={party.id}>
            <PartyEditor party={party} />
          </Arrive>
        ))}
        {editable && canAddParty(draft) ? (
          <Button
            aria-label="Add a party"
            onClick={add}
            rounded
            size="lg"
            variant="transparent"
          >
            <Plus aria-hidden="true" size={15} />
            Add a party
          </Button>
        ) : null}
      </div>
      {draft.parties.map((party) => (
        <ProblemLines anchor={anchors.party(party.id)} key={party.id} />
      ))}
    </section>
  );
}
