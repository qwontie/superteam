import {
  Button,
  Input,
  NumberField,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
} from "@cladd-ui/react";
import { Eye, Plus, Trash2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useCallback } from "react";
import { Arrive } from "@/features/builder/arrive";
import { partyName, quorum } from "@/features/builder/describe";
import {
  addCheck,
  addReviewer,
  canAddCheck,
  canAddReviewer,
  type DraftCheck,
  type PartySlot,
  type Reviewer,
  removeCheck,
  removeReviewer,
  updateCheck,
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

const LABEL_MAX = 40;
const TARGET_MAX = 128;

function ReviewerForm({
  check,
  reviewer,
}: {
  check: DraftCheck;
  reviewer: Reviewer;
}) {
  const { edit, wallet } = useBuilder();
  const patch = useCallback(
    (change: Partial<Reviewer>) =>
      edit((d) =>
        updateCheck(d, check.id, (current) => ({
          ...current,
          reviewers: current.reviewers.map((entry) =>
            entry.id === reviewer.id ? { ...entry, ...change } : entry
          ),
        }))
      ),
    [check.id, edit, reviewer.id]
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
  const remove = useCallback(
    () =>
      edit((d) =>
        updateCheck(d, check.id, (current) =>
          removeReviewer(current, reviewer.id)
        )
      ),
    [check.id, edit, reviewer.id]
  );
  return (
    <div className="flex flex-col gap-4 p-4">
      <Field label="Name">
        <Input
          maxLength={LABEL_MAX}
          onChange={rename}
          placeholder="Reviewer"
          size="xl"
          value={reviewer.label}
        />
      </Field>
      <Field label="Wallet that votes">
        <AddressField
          autoFocus
          label={`Wallet address of ${reviewer.label}`}
          onChange={setAddress}
          value={reviewer.address}
        />
        {wallet && reviewer.address.trim() !== wallet ? (
          <Button onClick={useMine} size="lg">
            This is me
          </Button>
        ) : null}
      </Field>
      <PopoverClose>
        <RemoveLine
          disabled={check.reviewers.length <= 1}
          label="Remove this reviewer"
          onClick={remove}
        />
      </PopoverClose>
    </div>
  );
}

function ReviewerEditor({
  check,
  reviewer,
}: {
  check: DraftCheck;
  reviewer: Reviewer;
}) {
  const { wallet, locked, mode } = useBuilder();
  const pill = (
    <SlotPill
      address={reviewer.address}
      empty="add address"
      label={reviewer.label || "Reviewer"}
      you={wallet !== null && reviewer.address.trim() === wallet}
    />
  );
  if (locked || mode === "play") {
    return pill;
  }
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <button
          aria-label={`Edit ${reviewer.label || "reviewer"}`}
          className="max-w-full rounded-full"
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
        <ReviewerForm check={check} reviewer={reviewer} />
      </Popover>
    </PopoverRoot>
  );
}

function BindToggle({ check, party }: { check: DraftCheck; party: PartySlot }) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const bound = check.binds === party.id;
  const toggle = useCallback(
    () =>
      edit((d) =>
        updateCheck(d, check.id, (current) => ({
          ...current,
          binds: bound ? null : party.id,
        }))
      ),
    [bound, check.id, edit, party.id]
  );
  return (
    <Button
      aria-pressed={bound}
      onClick={toggle}
      pressed={bound}
      size="lg"
      variant={bound ? "solid-fill" : "solid"}
    >
      A yes vote names {partyName(draft, party.id)}
    </Button>
  );
}

function CheckBlock({ check, index }: { check: DraftCheck; index: number }) {
  const { edit, locked, mode } = useBuilder();
  const draft = useDraft();
  const editable = !locked && mode === "build";
  const openParties = draft.parties.filter((party) => party.open);

  const setTarget = useCallback(
    (target: string) =>
      edit((d) => updateCheck(d, check.id, (c) => ({ ...c, target }))),
    [check.id, edit]
  );
  const setThreshold = useCallback(
    (threshold: number) =>
      edit((d) => updateCheck(d, check.id, (c) => ({ ...c, threshold }))),
    [check.id, edit]
  );
  const add = useCallback(
    () => edit((d) => updateCheck(d, check.id, addReviewer)),
    [check.id, edit]
  );
  const remove = useCallback(
    () => edit((d) => removeCheck(d, check.id)),
    [check.id, edit]
  );

  return (
    <article
      aria-label={`Check ${index + 1}`}
      className="pact-role-proof flex flex-col gap-3 rounded-block bg-cladd-surface p-3 shadow-cladd-outline sm:p-4"
      id={anchorId(anchors.check(check.id))}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-[7px] text-(--pact-role) shadow-[inset_0_0_0_1.5px_currentColor]"
        >
          <Eye size={14} strokeWidth={2.25} />
        </span>
        <h3 className="font-display font-semibold text-sm">
          Check {index + 1}
        </h3>
        <span className="text-cladd-fg-soft text-sm">
          {check.binds === null
            ? "reviewers confirm a statement"
            : "reviewers name the winner"}
        </span>
        {editable ? (
          <Button
            aria-label={`Remove check ${index + 1}`}
            className="ml-auto"
            onClick={remove}
            size="lg"
            square
            variant="transparent"
          >
            <Trash2 aria-hidden="true" size={15} />
          </Button>
        ) : null}
      </div>
      <Input
        disabled={!editable}
        inputComponentProps={{ "aria-label": "What the reviewers confirm" }}
        maxLength={TARGET_MAX}
        onChange={setTarget}
        placeholder="What do they confirm? For example: the landing page is live and matches the brief"
        size="xl"
        value={check.target}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-2 text-sm">
          <span className="text-cladd-fg-soft">Needs</span>
          {editable ? (
            <NumberField
              className="w-28"
              max={Math.max(1, check.reviewers.length)}
              min={1}
              onChange={setThreshold}
              size="lg"
              value={check.threshold}
            />
          ) : (
            <span className="font-display font-semibold tabular-nums">
              {check.threshold}
            </span>
          )}
          <span className="text-cladd-fg-soft">
            of {check.reviewers.length}
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {check.reviewers.map((reviewer) => (
            <Arrive key={reviewer.id}>
              <ReviewerEditor check={check} reviewer={reviewer} />
            </Arrive>
          ))}
          {editable && canAddReviewer(check) ? (
            <Button
              aria-label="Add a reviewer"
              onClick={add}
              rounded
              size="lg"
              square
              variant="transparent"
            >
              <Plus aria-hidden="true" size={15} />
            </Button>
          ) : null}
        </div>
      </div>
      {editable && openParties.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {openParties.map((party) => (
            <BindToggle check={check} key={party.id} party={party} />
          ))}
        </div>
      ) : null}
      {check.binds === null ? null : (
        <p className="text-cladd-fg-soft text-sm">
          Each yes vote carries a wallet. When {quorum(check)} pick the same
          one, it becomes {partyName(draft, check.binds)}.
        </p>
      )}
      <ProblemLines anchor={anchors.check(check.id)} />
    </article>
  );
}

export function Checks() {
  const { edit, locked, mode } = useBuilder();
  const draft = useDraft();
  const add = useCallback(() => edit(addCheck), [edit]);
  const editable = !locked && mode === "build";
  if (draft.checks.length === 0 && !editable) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className={SECTION_TITLE}>What people must confirm</h2>
        <p className="text-cladd-fg-soft text-sm">
          A check passes when enough of its reviewers vote yes from their own
          wallets.
        </p>
      </div>
      <AnimatePresence initial={false}>
        {draft.checks.map((check, index) => (
          <Arrive flash key={check.id}>
            <CheckBlock check={check} index={index} />
          </Arrive>
        ))}
      </AnimatePresence>
      {editable && canAddCheck(draft) ? (
        <div>
          <Button onClick={add} size="xl" variant="transparent">
            <Plus aria-hidden="true" size={16} />
            Add a check
          </Button>
        </div>
      ) : null}
    </section>
  );
}
