import {
  Button,
  cn,
  List,
  ListButton,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
} from "@cladd-ui/react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  Ellipsis,
  GripVertical,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { Fragment, type ReactNode, useCallback, useState } from "react";
import { RuleBlock } from "@/components/pact/rule-block";
import { FiredNote } from "@/components/pact/vault";
import { ArrivePiece, LandingFlash } from "@/features/builder/arrive";
import type { PaletteKind } from "@/features/builder/blocks";
import { ConditionPiece } from "@/features/builder/condition-piece";
import {
  amountLamports,
  type DraftCondition,
  type DraftRule,
  isTimeOnly,
  removeRule,
  reorderRules,
} from "@/features/builder/model";
import { VAULT_FLIGHT } from "@/features/builder/money-line";
import { PaletteList, usePalette } from "@/features/builder/palette";
import { POPOVER_BODY, ProblemLines, REVEAL } from "@/features/builder/parts";
import { anchors } from "@/features/builder/problems";
import { ShareBar, Shares } from "@/features/builder/shares";
import { useSim } from "@/features/builder/simulation";
import { useBuilder, useDraft } from "@/features/builder/state";
import { formatCountdown } from "@/lib/format";

export interface RuleDrag {
  kind: "rule";
  ruleId: string;
}

export interface WhenDrop {
  kind: "when";
  ruleId: string;
}

const onlyTime = (kind: PaletteKind) => kind === "after";

function AddCondition({ rule }: { rule: DraftRule }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (rule.when.length > 0) {
    return null;
  }
  return (
    <PopoverRoot onOpenChange={setOpen} open={open}>
      <PopoverTrigger>
        <Button
          aria-label="Add a condition"
          className="border border-cladd-fg-softer border-dashed"
          data-anchor={anchors.rule(rule.id)}
          size="lg"
          square
          variant="transparent"
        >
          <Plus aria-hidden="true" size={15} />
        </Button>
      </PopoverTrigger>
      <Popover
        className="w-[19rem] max-w-[calc(100vw-2rem)]"
        offset={8}
        position="bottom-start"
      >
        <div className={POPOVER_BODY}>
          <PaletteList
            allow={rule.exit ? onlyTime : undefined}
            money={false}
            onPicked={close}
            ruleId={rule.id}
          />
        </div>
      </Popover>
    </PopoverRoot>
  );
}

const ruleNote = (rule: DraftRule, fired: boolean, bar: boolean) => {
  if (fired) {
    return <PlayNote />;
  }
  return bar ? <ShareBar rule={rule} /> : null;
};

function LivePiece({
  condition,
  detail,
  holds,
  rule,
}: {
  condition: DraftCondition;
  detail: (condition: DraftCondition, holds: boolean) => string | null;
  holds: boolean | undefined;
  rule: DraftRule;
}) {
  if (holds === undefined) {
    return <ConditionPiece condition={condition} rule={rule} />;
  }
  return (
    <ConditionPiece
      condition={condition}
      detail={detail(condition, holds)}
      rule={rule}
      state={holds ? "holds" : "pending"}
    />
  );
}

interface RuleBodyProps {
  action?: ReactNode;
  gutter: ReactNode;
  index: number;
  rule: DraftRule;
}

function FireButton({ ruleId }: { ruleId: string }) {
  const { fire } = useSim();
  const execute = useCallback(() => fire(ruleId), [fire, ruleId]);
  return (
    <Button onClick={execute} size="xl" variant="solid-fill">
      Execute
    </Button>
  );
}

function PlayNote() {
  const draft = useDraft();
  const lamports = amountLamports(draft.amount);
  if (lamports === null) {
    return (
      <p className="font-medium text-pact-ink text-sm">
        The whole vault left. No one approved it.
      </p>
    );
  }
  return <FiredNote flightId={VAULT_FLIGHT} lamports={lamports} />;
}

const usePlayDetail = () => {
  const { now, yesByCheck } = useSim();
  return (condition: DraftCondition, holds: boolean) => {
    if (condition.type === "after") {
      return holds ? null : `in ${formatCountdown(condition.ts - now)}`;
    }
    if (condition.type === "attested") {
      return `${yesByCheck[condition.check] ?? 0} so far`;
    }
    return null;
  };
};

function RuleBody({ action, gutter, index, rule }: RuleBodyProps) {
  const { locked, mode } = useBuilder();
  const { focus, setFocus } = usePalette();
  const sim = useSim();
  const playDetail = usePlayDetail();
  const editable = !locked && mode === "build";
  const mark = useCallback(() => setFocus(rule.id), [rule.id, setFocus]);
  const focused = editable && focus === rule.id;
  const live = mode === "play" ? sim.byRule[rule.id] : undefined;
  const status = live?.status ?? "idle";
  const drop: WhenDrop = { kind: "when", ruleId: rule.id };
  const { isOver, setNodeRef, active } = useDroppable({
    data: drop,
    disabled: !editable,
    id: `when:${rule.id}`,
  });
  const dragged = active?.data.current as
    | { kind: string; ruleId?: string }
    | undefined;
  const welcome =
    isOver &&
    dragged !== undefined &&
    dragged.kind !== "rule" &&
    dragged.ruleId !== rule.id;

  return (
    <div
      className="group/rule relative flex flex-col gap-1.5"
      data-anchor-block={anchors.rule(rule.id)}
      data-focused={focused ? "" : undefined}
      onFocusCapture={mark}
      onPointerDownCapture={mark}
      tabIndex={-1}
    >
      {gutter}
      <div
        className={cn(
          "relative rounded-block outline-2 outline-offset-2 transition-[outline-color] duration-150",
          welcome && "outline-dashed outline-cladd-fg",
          !welcome && focused && "outline-cladd-fg-softer",
          !(welcome || focused) && "outline-transparent"
        )}
        ref={setNodeRef}
      >
        <RuleBlock
          action={status === "armed" ? <FireButton ruleId={rule.id} /> : action}
          exit={isTimeOnly(rule)}
          index={index}
          note={ruleNote(
            rule,
            status === "fired",
            editable && rule.pay.length > 1
          )}
          status={status}
          then={<Shares rule={rule} />}
          when={
            <>
              {rule.when.map((condition, position) => (
                <Fragment key={condition.id}>
                  {position > 0 ? (
                    <span className="text-cladd-fg-soft text-sm">and</span>
                  ) : null}
                  <ArrivePiece
                    className="inline-flex max-w-full"
                    position={position}
                  >
                    <LivePiece
                      condition={condition}
                      detail={playDetail}
                      holds={live?.evaluation.conditions[position]?.holds}
                      rule={rule}
                    />
                  </ArrivePiece>
                </Fragment>
              ))}
              {editable ? <AddCondition rule={rule} /> : null}
            </>
          }
        />
        <LandingFlash />
      </div>
      <ProblemLines anchor={anchors.rule(rule.id)} className="px-1" />
      {rule.when.map((condition) =>
        condition.type === "attested" ? (
          <ProblemLines
            anchor={anchors.check(condition.check)}
            className="px-1"
            key={condition.id}
          />
        ) : null
      )}
    </div>
  );
}

function MoveItem({
  down,
  rule,
  target,
}: {
  down: boolean;
  rule: DraftRule;
  target: DraftRule | undefined;
}) {
  const { edit } = useBuilder();
  const move = useCallback(() => {
    if (target) {
      edit((d) => reorderRules(d, rule.id, target.id));
    }
  }, [edit, rule.id, target]);
  const Icon = down ? ArrowDown : ArrowUp;
  return (
    <PopoverClose>
      <ListButton
        disabled={!target}
        icon={<Icon aria-hidden="true" size={16} />}
        onClick={move}
        size="xl"
      >
        {down ? "Move down" : "Move up"}
      </ListButton>
    </PopoverClose>
  );
}

function RuleMenu({ index, rule }: { index: number; rule: DraftRule }) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const free = draft.rules.filter((entry) => !entry.exit);
  const remove = useCallback(
    () => edit((d) => removeRule(d, rule.id)),
    [edit, rule.id]
  );
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button
          aria-label={`Rule ${index + 1}: move or remove`}
          className={REVEAL}
          size="lg"
          square
          variant="transparent"
        >
          <Ellipsis aria-hidden="true" size={16} />
        </Button>
      </PopoverTrigger>
      <Popover className="w-52" offset={8} position="bottom-end">
        <List className="p-1.5">
          <MoveItem down={false} rule={rule} target={free[index - 1]} />
          <MoveItem down rule={rule} target={free[index + 1]} />
          <PopoverClose>
            <ListButton
              className="text-pact-stop"
              icon={<Trash2 aria-hidden="true" size={16} />}
              onClick={remove}
              size="xl"
            >
              Remove rule
            </ListButton>
          </PopoverClose>
        </List>
      </Popover>
    </PopoverRoot>
  );
}

export function SortableRule({
  index,
  rule,
}: {
  index: number;
  rule: DraftRule;
}) {
  const { locked, mode } = useBuilder();
  const editable = !locked && mode === "build";
  const drag: RuleDrag = { kind: "rule", ruleId: rule.id };
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ data: drag, disabled: !editable, id: rule.id });
  return (
    <div
      className={cn("relative", isDragging && "z-10 opacity-80")}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <RuleBody
        action={editable ? <RuleMenu index={index} rule={rule} /> : null}
        gutter={
          editable ? (
            <button
              {...attributes}
              {...listeners}
              aria-label={`Drag rule ${index + 1}. Press space, then the arrow keys.`}
              className={cn(
                "absolute top-2.5 -left-7 hidden h-8 w-6 cursor-grab touch-none place-items-center rounded-chip text-cladd-fg-softer hover:text-cladd-fg active:cursor-grabbing lg:grid",
                REVEAL
              )}
              ref={setActivatorNodeRef}
              type="button"
            >
              <GripVertical aria-hidden="true" size={16} />
            </button>
          ) : null
        }
        index={index}
        rule={rule}
      />
    </div>
  );
}

export function ExitRule({ index, rule }: { index: number; rule: DraftRule }) {
  return (
    <RuleBody
      action={
        <span
          className="grid size-8 place-items-center text-cladd-fg-softer"
          title="The exit keeps the money from getting stuck. It cannot be removed."
        >
          <Lock aria-label="Pinned: the exit cannot be removed" size={14} />
        </span>
      }
      gutter={null}
      index={index}
      rule={rule}
    />
  );
}
