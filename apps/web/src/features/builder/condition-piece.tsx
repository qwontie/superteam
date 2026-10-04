import { cn } from "@cladd-ui/react";
import { useDraggable } from "@dnd-kit/core";
import { ArrowRightLeft, Copy, Trash2 } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
} from "react";
import {
  type BlockKind,
  blockOf,
  canDuplicate,
  duplicateCondition,
} from "@/features/builder/blocks";
import { CheckBody } from "@/features/builder/check-block";
import { conditionText } from "@/features/builder/describe";
import { type MenuItem, useMenu } from "@/features/builder/menu";
import {
  canRemoveCondition,
  canTake,
  type Draft,
  type DraftCondition,
  type DraftRule,
  moveCondition,
  removeCondition,
  updateCondition,
} from "@/features/builder/model";
import { PartyChip, type Place } from "@/features/builder/party-chip";
import { pointerDown } from "@/features/builder/pieces";
import { anchors, errorsAt } from "@/features/builder/problems";
import { useSim } from "@/features/builder/simulation";
import { BlockIcon, BlockShell, DateSlot } from "@/features/builder/slots";
import { useBuilder, useDraft } from "@/features/builder/state";
import { formatWhen } from "@/lib/format";
import type { ConditionState } from "@/lib/pact";

export interface ConditionDrag {
  conditionId: string;
  kind: "condition";
  ruleId: string;
}

type AfterCondition = Extract<DraftCondition, { type: "after" }>;
type PartyCondition = Extract<DraftCondition, { type: "signed" | "unsigned" }>;

interface BodyProps<T extends DraftCondition> {
  condition: T;
  ruleId: string;
}

function AfterBody({ condition, ruleId }: BodyProps<AfterCondition>) {
  const { edit, now } = useBuilder();
  const change = useCallback(
    (ts: number) =>
      edit((d) => updateCondition(d, ruleId, { ...condition, ts })),
    [condition, edit, ruleId]
  );
  return (
    <>
      <span>after</span>
      <DateSlot
        label="True from this moment on"
        late={condition.ts <= now}
        onChange={change}
        shown={formatWhen(condition.ts)}
        ts={condition.ts}
      />
    </>
  );
}

function SignBody({ condition, ruleId }: BodyProps<PartyCondition>) {
  const draft = useDraft();
  const place = useCallback<Place>(
    (d: Draft, partyId: string) =>
      updateCondition(d, ruleId, { ...condition, party: partyId }),
    [condition, ruleId]
  );
  const party = draft.parties.find((entry) => entry.id === condition.party);
  return (
    <>
      {party ? (
        <PartyChip
          options={draft.parties.filter(
            (entry) => entry.id !== condition.party
          )}
          party={party}
          place={place}
        />
      ) : (
        <span className="text-pact-stop">someone removed</span>
      )}
      <span>{condition.type === "signed" ? "signs" : "has not signed"}</span>
    </>
  );
}

function Body({ condition, ruleId }: BodyProps<DraftCondition>) {
  const draft = useDraft();
  if (condition.type === "after") {
    return <AfterBody condition={condition} ruleId={ruleId} />;
  }
  if (condition.type === "attested") {
    const check = draft.checks.find((entry) => entry.id === condition.check);
    return check ? (
      <CheckBody check={check} />
    ) : (
      <span className="text-pact-stop">a check that was removed</span>
    );
  }
  return <SignBody condition={condition} ruleId={ruleId} />;
}

const useBlockMenu = (condition: DraftCondition, rule: DraftRule) => {
  const { edit } = useBuilder();
  const draft = useDraft();
  return useCallback((): MenuItem[] => {
    const removable = canRemoveCondition(rule);
    const moves = removable
      ? draft.rules
          .map((entry, index) => ({ entry, index }))
          .filter(
            ({ entry }) =>
              entry.id !== rule.id && canTake(entry, condition.type)
          )
          .map(({ entry, index }) => ({
            icon: <ArrowRightLeft aria-hidden="true" size={16} />,
            key: `move:${entry.id}`,
            label: `Move to rule ${index + 1}`,
            run: () =>
              edit((d) => moveCondition(d, rule.id, entry.id, condition.id)),
          }))
      : [];
    return [
      ...moves,
      {
        disabled: !canDuplicate(draft, condition),
        icon: <Copy aria-hidden="true" size={16} />,
        key: "duplicate",
        label: "Duplicate",
        run: () => edit((d) => duplicateCondition(d, rule.id, condition.id)),
      },
      {
        danger: true,
        disabled: !removable,
        icon: <Trash2 aria-hidden="true" size={16} />,
        key: "remove",
        label: "Remove this block",
        run: () => edit((d) => removeCondition(d, rule.id, condition.id)),
      },
    ];
  }, [condition, draft, edit, rule]);
};

function Handle({
  kind,
  label,
  onOpen,
  onRemove,
}: {
  kind: BlockKind;
  label: string;
  onOpen: (element: HTMLElement) => void;
  onRemove: () => void;
}) {
  const open = useCallback(
    (event: MouseEvent<HTMLButtonElement>) =>
      onOpen(
        event.currentTarget.closest<HTMLElement>("[data-block]") ??
          event.currentTarget
      ),
    [onOpen]
  );
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        onRemove();
      }
    },
    [onRemove]
  );
  return (
    <button
      aria-haspopup="menu"
      aria-label={`Block ${label}: move, duplicate or remove`}
      className="cursor-grab rounded-[6px] active:cursor-grabbing [@media(pointer:coarse)]:-m-2 [@media(pointer:coarse)]:p-2"
      onClick={open}
      onKeyDown={onKeyDown}
      type="button"
    >
      <BlockIcon kind={kind} />
    </button>
  );
}

const useBroken = (condition: DraftCondition) => {
  const { validation } = useBuilder();
  return (
    condition.type === "attested" &&
    errorsAt(validation.problems, anchors.check(condition.check)).length > 0
  );
};

function Detail({ text }: { text?: string | null }) {
  return text ? (
    <span className="whitespace-nowrap font-normal tabular-nums opacity-80">
      {text}
    </span>
  ) : null;
}

interface ConditionPieceProps {
  condition: DraftCondition;
  detail?: string | null;
  rule: DraftRule;
  state?: ConditionState;
}

function PlayPiece({
  condition,
  detail,
  rule,
  state = "static",
}: ConditionPieceProps) {
  const draft = useDraft();
  const sim = useSim();
  const text = conditionText(condition, draft);
  const toggle = useCallback(() => {
    if (condition.type === "after") {
      const offset = condition.ts - (sim.now - sim.offset);
      sim.setOffset(sim.offset >= offset ? 0 : offset);
      return;
    }
    if (condition.type === "attested") {
      const voters =
        draft.checks.find((entry) => entry.id === condition.check)?.reviewers ??
        [];
      const next = voters.find((voter) => !sim.votes[voter.id]);
      for (const voter of next ? [next] : voters) {
        sim.toggleVote(voter.id);
      }
      return;
    }
    sim.toggleSignal(condition.party);
  }, [condition, draft.checks, sim]);
  return (
    <button
      aria-label={`${text.label}: press to change`}
      aria-pressed={state === "holds"}
      className="max-w-full rounded-chip text-left transition-opacity duration-150 disabled:opacity-60"
      disabled={sim.fired !== null}
      onClick={toggle}
      type="button"
    >
      <BlockShell kind={blockOf(condition, draft)} state={state}>
        <Body condition={condition} ruleId={rule.id} />
        <Detail text={detail} />
      </BlockShell>
    </button>
  );
}

const SLOT = "[data-slot],input,select,textarea";

export function ConditionPiece({
  condition,
  detail,
  rule,
  state = "static",
}: ConditionPieceProps) {
  const { edit, locked, mode } = useBuilder();
  const draft = useDraft();
  const broken = useBroken(condition);
  const editable = !locked && mode === "build";
  const kind = blockOf(condition, draft);
  const drag: ConditionDrag = {
    conditionId: condition.id,
    kind: "condition",
    ruleId: rule.id,
  };
  const { isDragging, listeners, setNodeRef } = useDraggable({
    data: drag,
    disabled: !(editable && canRemoveCondition(rule)),
    id: `condition:${condition.id}`,
  });
  const menu = useMenu(useBlockMenu(condition, rule), editable);
  const remove = useCallback(() => {
    if (canRemoveCondition(rule)) {
      edit((d) => removeCondition(d, rule.id, condition.id));
    }
  }, [condition.id, edit, rule]);
  const start = pointerDown(listeners);
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!(event.target as HTMLElement).closest(SLOT)) {
        start?.(event);
      }
    },
    [start]
  );

  if (mode === "play" && !locked) {
    return (
      <PlayPiece
        condition={condition}
        detail={detail}
        rule={rule}
        state={state}
      />
    );
  }
  if (!editable) {
    return (
      <BlockShell kind={kind} state={state}>
        <Body condition={condition} ruleId={rule.id} />
        <Detail text={detail} />
      </BlockShell>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex max-w-full touch-none transition-opacity duration-150",
        isDragging && "opacity-40"
      )}
      onPointerDown={onPointerDown}
      ref={setNodeRef}
      {...menu.handlers}
    >
      <BlockShell
        broken={broken}
        editable
        handle={
          <Handle
            kind={kind}
            label={conditionText(condition, draft).label}
            onOpen={menu.openAt}
            onRemove={remove}
          />
        }
        kind={kind}
      >
        <Body condition={condition} ruleId={rule.id} />
      </BlockShell>
    </span>
  );
}
