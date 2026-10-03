import {
  Button,
  cn,
  Input,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
  Segmented,
  SegmentedButton,
} from "@cladd-ui/react";
import { useDraggable } from "@dnd-kit/core";
import { Trash2 } from "lucide-react";
import { type KeyboardEvent, useCallback } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import { CheckEditor } from "@/features/builder/check-editor";
import { checkGap, conditionText } from "@/features/builder/describe";
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
import { Field, POPOVER_BODY } from "@/features/builder/parts";
import {
  PartyFields,
  PartyPicker,
  type Place,
} from "@/features/builder/party-chip";
import { pointerDown } from "@/features/builder/pieces";
import { anchors, errorsAt } from "@/features/builder/problems";
import { useSim } from "@/features/builder/simulation";
import { useBuilder, useDraft } from "@/features/builder/state";
import { formatCountdown } from "@/lib/format";
import type { ConditionState } from "@/lib/pact";

export interface ConditionDrag {
  conditionId: string;
  kind: "condition";
  ruleId: string;
}

type AfterCondition = Extract<DraftCondition, { type: "after" }>;
type PartyCondition = Extract<DraftCondition, { type: "signed" | "unsigned" }>;

const DAY = 86_400;
const HOUR = 3600;
const MINUTE_MS = 60_000;
const LOCAL_LENGTH = 16;
const PRESETS = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "30 days" },
] as const;

const toLocalInput = (ts: number) => {
  const date = new Date(ts * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * MINUTE_MS);
  return local.toISOString().slice(0, LOCAL_LENGTH);
};

const fromLocalInput = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : Math.floor(time / 1000);
};

interface EditorProps<T extends DraftCondition> {
  condition: T;
  ruleId: string;
}

function Preset({
  condition,
  days,
  label,
  ruleId,
}: EditorProps<AfterCondition> & { days: number; label: string }) {
  const { edit, now } = useBuilder();
  const apply = useCallback(() => {
    const ts = Math.ceil(now / HOUR) * HOUR + days * DAY;
    edit((d) => updateCondition(d, ruleId, { ...condition, ts }));
  }, [condition, days, edit, now, ruleId]);
  return (
    <Button onClick={apply} size="lg">
      {label}
    </Button>
  );
}

function AfterEditor({ condition, ruleId }: EditorProps<AfterCondition>) {
  const { edit, now } = useBuilder();
  const change = useCallback(
    (value: string) => {
      const ts = fromLocalInput(value);
      if (ts !== null) {
        edit((d) => updateCondition(d, ruleId, { ...condition, ts }));
      }
    },
    [condition, edit, ruleId]
  );
  const left = condition.ts - now;
  return (
    <>
      <Field
        label={
          left > 0 ? `In ${formatCountdown(left)}` : "This moment has passed"
        }
      >
        <Input
          inputClassName="tabular-nums"
          inputComponentProps={{ "aria-label": "True from this moment on" }}
          onChange={change}
          size="xl"
          type="datetime-local"
          valid={left > 0}
          value={toLocalInput(condition.ts)}
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <Preset
            condition={condition}
            days={preset.days}
            key={preset.days}
            label={preset.label}
            ruleId={ruleId}
          />
        ))}
      </div>
    </>
  );
}

function SignEditor({ condition, ruleId }: EditorProps<PartyCondition>) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const setSigned = useCallback(
    () =>
      edit((d) => updateCondition(d, ruleId, { ...condition, type: "signed" })),
    [condition, edit, ruleId]
  );
  const setUnsigned = useCallback(
    () =>
      edit((d) =>
        updateCondition(d, ruleId, { ...condition, type: "unsigned" })
      ),
    [condition, edit, ruleId]
  );
  const place = useCallback<Place>(
    (d: Draft, partyId: string) =>
      updateCondition(d, ruleId, { ...condition, party: partyId }),
    [condition, ruleId]
  );
  const party = draft.parties.find((entry) => entry.id === condition.party);
  return (
    <>
      <Segmented size="xl">
        <SegmentedButton
          active={condition.type === "signed"}
          onClick={setSigned}
        >
          Signs
        </SegmentedButton>
        <SegmentedButton
          active={condition.type === "unsigned"}
          onClick={setUnsigned}
        >
          Has not signed
        </SegmentedButton>
      </Segmented>
      {party ? <PartyFields party={party} /> : null}
      <PartyPicker
        label="Someone else"
        options={draft.parties.filter((entry) => entry.id !== condition.party)}
        place={place}
      />
    </>
  );
}

function Editor({ condition, ruleId }: EditorProps<DraftCondition>) {
  if (condition.type === "after") {
    return <AfterEditor condition={condition} ruleId={ruleId} />;
  }
  if (condition.type === "attested") {
    return <CheckEditor condition={condition} ruleId={ruleId} />;
  }
  return <SignEditor condition={condition} ruleId={ruleId} />;
}

function MoveOption({
  condition,
  from,
  index,
  to,
}: {
  condition: DraftCondition;
  from: string;
  index: number;
  to: string;
}) {
  const { edit } = useBuilder();
  const move = useCallback(
    () => edit((d) => moveCondition(d, from, to, condition.id)),
    [condition.id, edit, from, to]
  );
  return (
    <PopoverClose>
      <Button
        aria-label={`Move to rule ${index + 1}`}
        className="font-mono tabular-nums"
        onClick={move}
        size="lg"
        square
      >
        {index + 1}
      </Button>
    </PopoverClose>
  );
}

function Footer({
  condition,
  rule,
}: {
  condition: DraftCondition;
  rule: DraftRule;
}) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const removable = canRemoveCondition(rule);
  const remove = useCallback(
    () => edit((d) => removeCondition(d, rule.id, condition.id)),
    [condition.id, edit, rule.id]
  );
  if (!removable) {
    return null;
  }
  const targets = draft.rules
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) => entry.id !== rule.id && canTake(entry, condition.type)
    );
  return (
    <div className="flex items-center gap-1.5 pt-1">
      {targets.length > 0 ? (
        <span className="text-cladd-fg-soft text-xs">Move to</span>
      ) : null}
      {targets.map(({ entry, index }) => (
        <MoveOption
          condition={condition}
          from={rule.id}
          index={index}
          key={entry.id}
          to={entry.id}
        />
      ))}
      <PopoverClose>
        <Button
          aria-label="Remove this condition"
          className="ml-auto text-pact-stop"
          onClick={remove}
          size="lg"
          square
          variant="transparent"
        >
          <Trash2 aria-hidden="true" size={15} />
        </Button>
      </PopoverClose>
    </div>
  );
}

const anchorOf = (condition: DraftCondition) => {
  if (condition.type === "attested") {
    return anchors.check(condition.check);
  }
  return condition.type === "after"
    ? undefined
    : anchors.party(condition.party);
};

const useGap = (condition: DraftCondition) => {
  const { validation } = useBuilder();
  const draft = useDraft();
  if (condition.type !== "attested") {
    return { broken: false, gap: null };
  }
  const check = draft.checks.find((entry) => entry.id === condition.check);
  return {
    broken:
      errorsAt(validation.problems, anchors.check(condition.check)).length > 0,
    gap: check ? checkGap(check) : null,
  };
};

function PlayPiece({
  condition,
  detail,
  state,
}: {
  condition: DraftCondition;
  detail?: string | null;
  state: ConditionState;
}) {
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
      <ConditionChip
        detail={detail ?? text.detail}
        label={text.label}
        role={text.role}
        state={state}
      />
    </button>
  );
}

interface ConditionPieceProps {
  condition: DraftCondition;
  detail?: string | null;
  rule: DraftRule;
  state?: ConditionState;
}

export function ConditionPiece({
  condition,
  detail,
  rule,
  state = "static",
}: ConditionPieceProps) {
  const { edit, locked, mode } = useBuilder();
  const draft = useDraft();
  const text = conditionText(condition, draft);
  const { broken, gap } = useGap(condition);
  const editable = !locked && mode === "build";
  const removable = canRemoveCondition(rule);
  const drag: ConditionDrag = {
    conditionId: condition.id,
    kind: "condition",
    ruleId: rule.id,
  };
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    data: drag,
    disabled: !(editable && removable),
    id: `condition:${condition.id}`,
  });

  const remove = useCallback(
    () => edit((d) => removeCondition(d, rule.id, condition.id)),
    [condition.id, edit, rule.id]
  );
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if ((event.key === "Backspace" || event.key === "Delete") && removable) {
        event.preventDefault();
        remove();
      }
    },
    [removable, remove]
  );

  if (mode === "play" && !locked) {
    return <PlayPiece condition={condition} detail={detail} state={state} />;
  }
  const chip = (
    <ConditionChip
      className={cn(
        (gap || broken) &&
          "outline-dashed outline-1 outline-current outline-offset-2",
        broken && "text-pact-stop"
      )}
      detail={detail ?? gap ?? text.detail}
      label={text.label}
      role={text.role}
      state={state}
    />
  );
  if (!editable) {
    return chip;
  }
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <button
          aria-describedby={attributes["aria-describedby"]}
          aria-label={`Edit condition: ${text.label}`}
          className={cn(
            "max-w-full touch-none rounded-chip text-left transition-opacity duration-150",
            isDragging && "opacity-40"
          )}
          data-anchor={anchorOf(condition)}
          onKeyDown={onKeyDown}
          onPointerDown={pointerDown(listeners)}
          ref={setNodeRef}
          type="button"
        >
          {chip}
        </button>
      </PopoverTrigger>
      <Popover
        className={cn(
          "max-w-[calc(100vw-2rem)]",
          condition.type === "attested" ? "w-[27rem]" : "w-80"
        )}
        offset={8}
        position="bottom-start"
      >
        <div className={POPOVER_BODY}>
          <Editor condition={condition} ruleId={rule.id} />
          <Footer condition={condition} rule={rule} />
        </div>
      </Popover>
    </PopoverRoot>
  );
}
