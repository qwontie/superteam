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
import { GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { Fragment, type ReactNode, useCallback } from "react";
import { RuleBlock } from "@/components/pact/rule-block";
import { ArrivePiece } from "@/features/builder/arrive";
import { ConditionPiece } from "@/features/builder/condition-piece";
import { readRule } from "@/features/builder/describe";
import {
  addCheck,
  addCondition,
  canTake,
  type DraftRule,
  isTimeOnly,
  newCondition,
  type PieceType,
  removeRule,
} from "@/features/builder/model";
import { anchorId, ProblemLines } from "@/features/builder/parts";
import { PIECES, PieceIcon } from "@/features/builder/pieces";
import { anchors } from "@/features/builder/problems";
import { ShareBar, Shares } from "@/features/builder/shares";
import { useBuilder, useDraft } from "@/features/builder/state";

export interface RuleDrag {
  kind: "rule";
  ruleId: string;
}

export interface WhenDrop {
  kind: "when";
  ruleId: string;
}

const GUTTER = "flex w-7 shrink-0 justify-center pt-2.5 sm:w-8";

export const useAddPiece = () => {
  const { edit, now } = useBuilder();
  return useCallback(
    (ruleId: string, type: PieceType) =>
      edit((current) => {
        const draft =
          type === "attested" && current.checks.length === 0
            ? addCheck(current)
            : current;
        const condition = newCondition(type, draft, now);
        return condition ? addCondition(draft, ruleId, condition) : current;
      }),
    [edit, now]
  );
};

function PieceOption({ rule, type }: { rule: DraftRule; type: PieceType }) {
  const addPiece = useAddPiece();
  const piece = PIECES[type];
  const pick = useCallback(
    () => addPiece(rule.id, type),
    [addPiece, rule.id, type]
  );
  return (
    <PopoverClose>
      <ListButton
        icon={<PieceIcon type={type} />}
        multiline
        onClick={pick}
        size="xl"
      >
        {piece.label}
        <span className="block text-cladd-fg-soft text-xs">{piece.hint}</span>
      </ListButton>
    </PopoverClose>
  );
}

function AddCondition({ rule }: { rule: DraftRule }) {
  const types = (Object.keys(PIECES) as PieceType[]).filter((type) =>
    canTake(rule, type)
  );
  if (types.length === 0) {
    return null;
  }
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button
          aria-label="Add a condition"
          size="lg"
          square={rule.when.length > 0}
          variant="transparent"
        >
          <Plus aria-hidden="true" size={15} />
          {rule.when.length === 0 ? "Add a condition" : null}
        </Button>
      </PopoverTrigger>
      <Popover className="w-72" offset={8} position="bottom-start">
        <List className="p-1.5">
          {types.map((type) => (
            <PieceOption key={type} rule={rule} type={type} />
          ))}
        </List>
      </Popover>
    </PopoverRoot>
  );
}

interface RuleBodyProps {
  action?: ReactNode;
  gutter: ReactNode;
  index: number;
  rule: DraftRule;
}

function RuleBody({ action, gutter, index, rule }: RuleBodyProps) {
  const { locked, mode } = useBuilder();
  const draft = useDraft();
  const editable = !locked && mode === "build";
  const drop: WhenDrop = { kind: "when", ruleId: rule.id };
  const { isOver, setNodeRef, active } = useDroppable({
    data: drop,
    disabled: !editable,
    id: `when:${rule.id}`,
  });
  const dragged = active?.data.current as
    | { kind: string; ruleId?: string; type?: PieceType }
    | undefined;
  const welcome =
    isOver &&
    dragged !== undefined &&
    dragged.kind !== "rule" &&
    dragged.ruleId !== rule.id;

  return (
    <div className="flex items-start gap-1 sm:gap-2">
      <div className={GUTTER}>{gutter}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div
          className={cn(
            "rounded-block outline-2 outline-offset-2 transition-[outline-color] duration-150",
            welcome ? "outline-dashed outline-cladd-fg" : "outline-transparent"
          )}
          id={anchorId(anchors.rule(rule.id))}
          ref={setNodeRef}
        >
          <RuleBlock
            action={action}
            exit={isTimeOnly(rule)}
            index={index}
            note={
              editable && rule.pay.length > 1 ? <ShareBar rule={rule} /> : null
            }
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
                      <ConditionPiece condition={condition} rule={rule} />
                    </ArrivePiece>
                  </Fragment>
                ))}
                {editable ? <AddCondition rule={rule} /> : null}
              </>
            }
          />
        </div>
        <p className="px-1 text-cladd-fg-soft text-sm">
          {readRule(rule, draft)}
        </p>
        <ProblemLines anchor={anchors.rule(rule.id)} className="px-1" />
      </div>
    </div>
  );
}

export function SortableRule({
  index,
  rule,
}: {
  index: number;
  rule: DraftRule;
}) {
  const { edit, locked, mode } = useBuilder();
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
  const remove = useCallback(
    () => edit((d) => removeRule(d, rule.id)),
    [edit, rule.id]
  );
  return (
    <div
      className={cn("relative", isDragging && "z-10 opacity-80")}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <RuleBody
        action={
          editable ? (
            <Button
              aria-label={`Remove rule ${index + 1}`}
              onClick={remove}
              size="lg"
              square
              variant="transparent"
            >
              <Trash2 aria-hidden="true" size={15} />
            </Button>
          ) : null
        }
        gutter={
          editable ? (
            <button
              {...attributes}
              {...listeners}
              aria-label={`Move rule ${index + 1}. Press space, then the arrow keys.`}
              className="grid h-8 w-6 cursor-grab touch-none place-items-center rounded-chip text-cladd-fg-softer transition-colors duration-150 hover:text-cladd-fg active:cursor-grabbing"
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
      gutter={
        <span
          className="grid h-8 w-6 place-items-center text-cladd-fg-soft"
          title="The exit cannot be removed"
        >
          <Lock aria-hidden="true" size={15} />
        </span>
      }
      index={index}
      rule={rule}
    />
  );
}
