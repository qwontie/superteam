import {
  Button,
  cn,
  Input,
  List,
  ListButton,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
  Segmented,
  SegmentedButton,
} from "@cladd-ui/react";
import { useDraggable } from "@dnd-kit/core";
import { Check, Eye } from "lucide-react";
import { type KeyboardEvent, useCallback } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import { PartyAvatar } from "@/components/pact/party";
import {
  checkName,
  conditionText,
  partyName,
} from "@/features/builder/describe";
import {
  canRemoveCondition,
  type DraftCheck,
  type DraftCondition,
  type DraftRule,
  type PartySlot,
  partyAddress,
  removeCondition,
  updateCondition,
} from "@/features/builder/model";
import { Field, RemoveLine } from "@/features/builder/parts";
import { pointerDown } from "@/features/builder/pieces";
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
type CheckCondition = Extract<DraftCondition, { type: "attested" }>;

const DAY = 86_400;
const HOUR = 3600;
const MINUTE_MS = 60_000;
const LOCAL_LENGTH = 16;
const PRESETS = [
  { days: 1, label: "In 1 day" },
  { days: 3, label: "In 3 days" },
  { days: 7, label: "In 1 week" },
  { days: 14, label: "In 2 weeks" },
  { days: 30, label: "In 30 days" },
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
      <Field label="True from this moment on">
        <Input
          inputClassName="tabular-nums"
          onChange={change}
          size="xl"
          type="datetime-local"
          value={toLocalInput(condition.ts)}
        />
        <span
          className={cn(
            "text-xs",
            left > 0 ? "text-cladd-fg-soft" : "text-pact-stop"
          )}
        >
          {left > 0
            ? `${formatCountdown(left)} from now, in your local time`
            : "This moment has already passed"}
        </span>
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

function PartyOption({
  condition,
  party,
  ruleId,
}: EditorProps<PartyCondition> & { party: PartySlot }) {
  const { edit, wallet } = useBuilder();
  const draft = useDraft();
  const pick = useCallback(
    () =>
      edit((d) =>
        updateCondition(d, ruleId, { ...condition, party: party.id })
      ),
    [condition, edit, party.id, ruleId]
  );
  const selected = condition.party === party.id;
  return (
    <ListButton
      aria-pressed={selected}
      icon={
        <PartyAvatar
          seed={party.open ? null : partyAddress(party, wallet) || party.label}
          size={20}
        />
      }
      onClick={pick}
      size="xl"
    >
      <span className="flex w-full items-center justify-between gap-2">
        {partyName(draft, party.id)}
        {selected ? <Check aria-hidden="true" size={15} /> : null}
      </span>
    </ListButton>
  );
}

function PartyEditor({ condition, ruleId }: EditorProps<PartyCondition>) {
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
      <p className="text-cladd-fg-soft text-xs">
        Signing is one click on the deal page from that party's wallet. It
        cannot be undone.
      </p>
      <List className="-mx-2">
        {draft.parties.map((party) => (
          <PartyOption
            condition={condition}
            key={party.id}
            party={party}
            ruleId={ruleId}
          />
        ))}
      </List>
    </>
  );
}

function CheckOption({
  check,
  condition,
  ruleId,
}: EditorProps<CheckCondition> & { check: DraftCheck }) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const pick = useCallback(
    () =>
      edit((d) =>
        updateCondition(d, ruleId, { ...condition, check: check.id })
      ),
    [check.id, condition, edit, ruleId]
  );
  const selected = condition.check === check.id;
  return (
    <ListButton
      aria-pressed={selected}
      icon={<Eye aria-hidden="true" size={16} />}
      multiline
      onClick={pick}
      size="xl"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="min-w-0">
          {checkName(draft, check.id)}
          <span className="block truncate text-cladd-fg-soft text-xs">
            {check.target || "No statement yet"}
          </span>
        </span>
        {selected ? <Check aria-hidden="true" size={15} /> : null}
      </span>
    </ListButton>
  );
}

function CheckEditor({ condition, ruleId }: EditorProps<CheckCondition>) {
  const draft = useDraft();
  return (
    <List className="-mx-2">
      {draft.checks.map((check) => (
        <CheckOption
          check={check}
          condition={condition}
          key={check.id}
          ruleId={ruleId}
        />
      ))}
    </List>
  );
}

function Editor({ condition, ruleId }: EditorProps<DraftCondition>) {
  if (condition.type === "after") {
    return <AfterEditor condition={condition} ruleId={ruleId} />;
  }
  if (condition.type === "attested") {
    return <CheckEditor condition={condition} ruleId={ruleId} />;
  }
  return <PartyEditor condition={condition} ruleId={ruleId} />;
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

  const chip = (
    <ConditionChip
      detail={detail ?? text.detail}
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
          onKeyDown={onKeyDown}
          onPointerDown={pointerDown(listeners)}
          ref={setNodeRef}
          type="button"
        >
          {chip}
        </button>
      </PopoverTrigger>
      <Popover
        className="w-72 max-w-[calc(100vw-2rem)]"
        offset={8}
        position="bottom-start"
      >
        <div className="flex flex-col gap-3 p-4">
          <Editor condition={condition} ruleId={rule.id} />
          {removable ? (
            <PopoverClose>
              <RemoveLine label="Remove this condition" onClick={remove} />
            </PopoverClose>
          ) : (
            <p className="text-cladd-fg-soft text-xs">
              The exit always keeps one time, so it cannot be removed here.
            </p>
          )}
        </div>
      </Popover>
    </PopoverRoot>
  );
}
