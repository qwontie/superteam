import {
  Button,
  cn,
  Input,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
} from "@cladd-ui/react";
import { Eraser, Plus, Radio, Server, Trash2, UserRound } from "lucide-react";
import { useCallback } from "react";
import { partyName, slotGap } from "@/features/builder/describe";
import { isOracle } from "@/features/builder/gate";
import { type MenuItem, useMenu } from "@/features/builder/menu";
import {
  addReviewer,
  canAddReviewer,
  type DraftCheck,
  hasDemoNodes,
  type PartySlot,
  type Reviewer,
  removeReviewer,
  updateCheck,
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
import {
  PickSlot,
  useBlockAnchor,
  useEditable,
} from "@/features/builder/slots";
import { useBuilder, useDraft } from "@/features/builder/state";

const LABEL_MAX = 40;

export const useCheckEdit = (id: string) => {
  const { edit } = useBuilder();
  return useCallback(
    (change: (check: DraftCheck) => DraftCheck) =>
      edit((d) => updateCheck(d, id, change)),
    [edit, id]
  );
};

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    label: String(index + 1),
    value: String(index + 1),
  }));

function VoterSlot({
  anchored,
  check,
  position,
  reviewer,
}: {
  anchored: boolean;
  check: DraftCheck;
  position: number;
  reviewer: Reviewer;
}) {
  const { wallet } = useBuilder();
  const editable = useEditable();
  const change = useCheckEdit(check.id);
  const { block, find } = useBlockAnchor();
  const patch = useCallback(
    (next: Partial<Reviewer>) =>
      change((current) => ({
        ...current,
        reviewers: current.reviewers.map((entry) =>
          entry.id === reviewer.id ? { ...entry, ...next } : entry
        ),
      })),
    [change, reviewer.id]
  );
  const rename = useCallback((label: string) => patch({ label }), [patch]);
  const setAddress = useCallback(
    (address: string) => patch({ address }),
    [patch]
  );
  const useMine = useCallback(
    () => patch({ address: wallet ?? "" }),
    [patch, wallet]
  );
  const clear = useCallback(() => patch({ address: "" }), [patch]);
  const remove = useCallback(
    () => change((current) => removeReviewer(current, reviewer.id)),
    [change, reviewer.id]
  );
  const typed = reviewer.address.trim();
  const mine = wallet !== null && typed === wallet;
  const only = check.reviewers.length <= 1;
  const name = reviewer.label.trim() || `Voter ${position + 1}`;
  const items = useCallback(
    (): MenuItem[] => [
      {
        disabled: wallet === null || mine,
        icon: <UserRound aria-hidden="true" size={16} />,
        key: "me",
        label: "This is me",
        run: useMine,
      },
      {
        disabled: typed === "",
        icon: <Eraser aria-hidden="true" size={16} />,
        key: "clear",
        label: "Clear the address",
        run: clear,
      },
      {
        danger: true,
        disabled: only,
        icon: <Trash2 aria-hidden="true" size={16} />,
        key: "remove",
        label: "Remove this voter",
        run: remove,
      },
    ],
    [clear, mine, only, remove, typed, useMine, wallet]
  );
  const menu = useMenu(items, editable);
  const pill = (
    <SlotPill address={typed} empty="add address" label={name} you={mine} />
  );
  if (!editable) {
    return pill;
  }
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <button
          aria-label={`Edit voter ${name}`}
          className="max-w-full rounded-full"
          data-anchor={
            anchored && typed === "" ? anchors.check(check.id) : undefined
          }
          data-slot=""
          ref={find}
          type="button"
          {...menu.handlers}
        >
          {pill}
        </button>
      </PopoverTrigger>
      <Popover
        anchorRef={block}
        className="w-80 max-w-[calc(100vw-2rem)]"
        offset={8}
        position="bottom-start"
      >
        <div className={POPOVER_BODY}>
          <Field label="Name">
            <Input
              inputComponentProps={{ "aria-label": `Name of voter ${name}` }}
              maxLength={LABEL_MAX}
              onChange={rename}
              placeholder="Anna, Reviewer 1"
              size="xl"
              value={reviewer.label}
            />
          </Field>
          <Field label="Wallet">
            <AddressField
              autoFocus={typed === ""}
              label={`Wallet address of ${name}`}
              onChange={setAddress}
              value={reviewer.address}
            />
          </Field>
          {wallet === null ? null : (
            <Button
              aria-pressed={mine}
              className={cn("self-start", pickedClass(mine))}
              onClick={useMine}
              size="lg"
            >
              This is me
            </Button>
          )}
          {only ? null : (
            <PopoverClose>
              <RemoveLine label="Remove this voter" onClick={remove} />
            </PopoverClose>
          )}
        </div>
      </Popover>
    </PopoverRoot>
  );
}

export function Voters({ check, word }: { check: DraftCheck; word: string }) {
  const editable = useEditable();
  const change = useCheckEdit(check.id);
  const setThreshold = useCallback(
    (value: string) => change((c) => ({ ...c, threshold: Number(value) })),
    [change]
  );
  const add = useCallback(
    () =>
      change((current) => {
        const next = addReviewer(current);
        const last = next.reviewers.at(-1);
        return last && next !== current
          ? {
              ...next,
              reviewers: [
                ...current.reviewers,
                { ...last, label: `${word} ${next.reviewers.length}` },
              ],
            }
          : current;
      }),
    [change, word]
  );
  const anchored = !slotGap(check);
  return (
    <>
      <PickSlot
        label="Yes votes needed"
        onChange={setThreshold}
        options={range(check.reviewers.length)}
        value={String(check.threshold)}
      />
      <span>of</span>
      {check.reviewers.map((reviewer, position) => (
        <VoterSlot
          anchored={anchored}
          check={check}
          key={reviewer.id}
          position={position}
          reviewer={reviewer}
        />
      ))}
      {editable && canAddReviewer(check) ? (
        <button
          aria-label="Add a voter"
          className="grid size-8 shrink-0 place-items-center rounded-full border border-current border-dashed opacity-70 transition-opacity duration-150 hover:opacity-100"
          data-slot=""
          onClick={add}
          type="button"
        >
          <Plus aria-hidden="true" size={14} />
        </button>
      ) : null}
    </>
  );
}

const BADGE =
  "inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_45%,transparent)] px-2 font-medium text-xs [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:text-[13px]";

function BindToggle({ check, party }: { check: DraftCheck; party: PartySlot }) {
  const draft = useDraft();
  const change = useCheckEdit(check.id);
  const bound = check.binds === party.id;
  const toggle = useCallback(
    () => change((current) => ({ ...current, binds: bound ? null : party.id })),
    [bound, change, party.id]
  );
  return (
    <button
      aria-pressed={bound}
      className={cn(
        BADGE,
        "cursor-pointer",
        bound ? "border-current" : "opacity-70"
      )}
      data-slot=""
      onClick={toggle}
      title='The servers take the wallet from the line "pact: <address>" in the pull request'
      type="button"
    >
      names {partyName(draft, party.id)}
    </button>
  );
}

const VERIFIERS = {
  nodes: {
    hint: "Three servers run by Pact read GitHub and vote. Anyone can run one.",
    icon: Server,
    label: "3 Pact servers",
  },
  oracle: {
    hint: "Three independent Switchboard oracles read the source and sign the answer.",
    icon: Radio,
    label: "Switchboard, 3 oracles",
  },
} as const;

const verifierOf = (check: DraftCheck) => {
  if (isOracle(check)) {
    return "oracle";
  }
  return hasDemoNodes(check) ? "nodes" : null;
};

export function Verifier({ check }: { check: DraftCheck }) {
  const draft = useDraft();
  const editable = useEditable();
  const key = verifierOf(check);
  const openParties =
    editable && check.kind === "github_pr_merged"
      ? draft.parties.filter((party) => party.open)
      : [];
  if (key === null) {
    return <Voters check={check} word="Reviewer" />;
  }
  const { hint, icon: Icon, label } = VERIFIERS[key];
  const gate = check.reviewers[0]?.address.trim() ?? "";
  return (
    <>
      <span
        className={BADGE}
        title={key === "oracle" && gate !== "" ? `${hint} Gate ${gate}` : hint}
      >
        <Icon aria-hidden="true" className="shrink-0" size={12} />
        <span className="truncate">{label}</span>
      </span>
      {openParties.map((party) => (
        <BindToggle check={check} key={party.id} party={party} />
      ))}
    </>
  );
}
