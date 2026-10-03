import { cn, PopoverRoot, PopoverTrigger } from "@cladd-ui/react";
import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useCallback, useState } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import { Arrive } from "@/features/builder/arrive";
import type { ConditionDrag } from "@/features/builder/condition-piece";
import { conditionText } from "@/features/builder/describe";
import {
  addRule,
  canAddRule,
  moveCondition,
  type PieceType,
  removeCondition,
  reorderRules,
} from "@/features/builder/model";
import { PIECE_ORDER } from "@/features/builder/pieces";
import {
  ExitRule,
  PieceMenu,
  type RuleDrag,
  SortableRule,
  usePiece,
  type WhenDrop,
} from "@/features/builder/rule-editor";
import { useBuilder, useDraft } from "@/features/builder/state";

type Drag = ConditionDrag | RuleDrag;
type Drop = WhenDrop | RuleDrag | { kind: "new-rule" };

const DRAG_DISTANCE = 6;
const NEW_RULE = "new-rule";

const collision: CollisionDetection = (args) => {
  const dragged = args.active.data.current as Drag | undefined;
  const sorting = dragged?.kind === "rule";
  const droppableContainers = args.droppableContainers.filter((container) => {
    const kind = (container.data.current as Drop | undefined)?.kind;
    return sorting ? kind === "rule" : kind === "when" || kind === NEW_RULE;
  });
  return sorting
    ? closestCenter({ ...args, droppableContainers })
    : pointerWithin({ ...args, droppableContainers });
};

function AddRule({ dragging }: { dragging: boolean }) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const piece = usePiece();
  const { isOver, setNodeRef } = useDroppable({
    data: { kind: NEW_RULE },
    disabled: !canAddRule(draft),
    id: NEW_RULE,
  });
  const add = useCallback(
    (type: PieceType) => edit((d) => piece(d, type, addRule)),
    [edit, piece]
  );
  if (!canAddRule(draft)) {
    return null;
  }
  return (
    <div ref={setNodeRef}>
      <PopoverRoot>
        <PopoverTrigger>
          <button
            aria-label="Add a rule"
            className={cn(
              "flex h-8 w-full items-center justify-center rounded-block border border-dashed text-cladd-fg-softer transition-colors duration-150 hover:border-cladd-fg-softer hover:text-cladd-fg",
              isOver || dragging
                ? "border-cladd-fg-soft text-cladd-fg"
                : "border-transparent"
            )}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
          </button>
        </PopoverTrigger>
        <PieceMenu onPick={add} types={PIECE_ORDER} />
      </PopoverRoot>
    </div>
  );
}

function Overlay({ drag }: { drag: Drag | null }) {
  const draft = useDraft();
  if (!drag || drag.kind === "rule") {
    return null;
  }
  const condition = draft.rules
    .find((rule) => rule.id === drag.ruleId)
    ?.when.find((entry) => entry.id === drag.conditionId);
  if (!condition) {
    return null;
  }
  const text = conditionText(condition, draft);
  return <ConditionChip label={text.label} role={text.role} />;
}

export function Rules() {
  const { edit, locked, mode } = useBuilder();
  const draft = useDraft();
  const [drag, setDrag] = useState<Drag | null>(null);
  const editable = !locked && mode === "build";
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_DISTANCE },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setDrag((event.active.data.current as Drag | undefined) ?? null);
  }, []);

  const onDragCancel = useCallback(() => setDrag(null), []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDrag(null);
      const from = event.active.data.current as Drag | undefined;
      const to = event.over?.data.current as Drop | undefined;
      if (!(from && to)) {
        return;
      }
      if (from.kind === "rule") {
        if (to.kind === "rule") {
          edit((d) => reorderRules(d, from.ruleId, to.ruleId));
        }
        return;
      }
      edit((d) => {
        if (to.kind === "when") {
          return moveCondition(d, from.ruleId, to.ruleId, from.conditionId);
        }
        const condition = d.rules
          .find((rule) => rule.id === from.ruleId)
          ?.when.find((entry) => entry.id === from.conditionId);
        if (!(condition && to.kind === NEW_RULE && canAddRule(d))) {
          return d;
        }
        return addRule(
          removeCondition(d, from.ruleId, from.conditionId),
          condition
        );
      });
    },
    [edit]
  );

  const free = draft.rules.filter((rule) => !rule.exit);
  const exit = draft.rules.find((rule) => rule.exit);

  return (
    <DndContext
      collisionDetection={collision}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      sensors={sensors}
    >
      <section aria-label="Rules" className="flex flex-col gap-3">
        <SortableContext
          items={free.map((rule) => rule.id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence initial={false}>
            {free.map((rule, index) => (
              <Arrive follow key={rule.id}>
                <SortableRule index={index} rule={rule} />
              </Arrive>
            ))}
          </AnimatePresence>
        </SortableContext>
        {editable ? <AddRule dragging={drag?.kind === "condition"} /> : null}
        <AnimatePresence initial={false}>
          {exit ? (
            <Arrive follow key={exit.id}>
              <ExitRule index={free.length} rule={exit} />
            </Arrive>
          ) : null}
        </AnimatePresence>
      </section>
      <DragOverlay dropAnimation={null}>
        <Overlay drag={drag} />
      </DragOverlay>
    </DndContext>
  );
}
