import { Button, cn } from "@cladd-ui/react";
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
  addCheck,
  addCondition,
  addRule,
  canAddRule,
  moveCondition,
  newCondition,
  removeCondition,
  reorderRules,
} from "@/features/builder/model";
import { SECTION_TITLE } from "@/features/builder/parts";
import { Palette, PieceChip, type PieceDrag } from "@/features/builder/pieces";
import {
  ExitRule,
  type RuleDrag,
  SortableRule,
  type WhenDrop,
} from "@/features/builder/rule-editor";
import { useBuilder, useDraft } from "@/features/builder/state";

type Drag = ConditionDrag | PieceDrag | RuleDrag;
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

function NewRuleZone({ dragging }: { dragging: boolean }) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const { isOver, setNodeRef } = useDroppable({
    data: { kind: NEW_RULE },
    disabled: !canAddRule(draft),
    id: NEW_RULE,
  });
  const add = useCallback(() => edit((d) => addRule(d, null)), [edit]);
  if (!canAddRule(draft)) {
    return (
      <p className="pl-8 text-cladd-fg-soft text-sm sm:pl-10">
        A deal holds up to six rules.
      </p>
    );
  }
  return (
    <div className="pl-8 sm:pl-10" ref={setNodeRef}>
      <Button
        className={cn(
          "w-full justify-center border border-dashed transition-colors duration-150",
          isOver ? "border-cladd-fg" : "border-cladd-outline"
        )}
        onClick={add}
        size="2xl"
        variant="transparent"
      >
        <Plus aria-hidden="true" size={16} />
        {dragging ? "Drop here to start a new rule" : "Add a rule"}
      </Button>
    </div>
  );
}

function Overlay({ drag }: { drag: Drag | null }) {
  const draft = useDraft();
  if (!drag || drag.kind === "rule") {
    return null;
  }
  if (drag.kind === "piece") {
    return <PieceChip type={drag.type} />;
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
  const { edit, locked, mode, now } = useBuilder();
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
      if (from.kind === "condition") {
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
        return;
      }
      edit((current) => {
        const base =
          from.type === "attested" && current.checks.length === 0
            ? addCheck(current)
            : current;
        const condition = newCondition(from.type, base, now);
        if (!condition) {
          return current;
        }
        if (to.kind === "when") {
          return addCondition(base, to.ruleId, condition);
        }
        return to.kind === NEW_RULE ? addRule(base, condition) : current;
      });
    },
    [edit, now]
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
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className={SECTION_TITLE}>What happens to the money</h2>
          <p className="text-cladd-fg-soft text-sm">
            The first rule that comes true and is executed pays out. The rest
            are cancelled.
          </p>
        </div>
        {editable ? <Palette /> : null}
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
        {editable ? <NewRuleZone dragging={drag !== null} /> : null}
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1 pl-8 sm:pl-10">
            <h3 className="font-display font-semibold text-base">
              The exit, so money never gets stuck
            </h3>
            <p className="max-w-[60ch] text-cladd-fg-soft text-sm">
              After this moment anyone can close the deal, even if every party
              has disappeared. The program refuses a deal without it, so this
              block can be changed but not removed.
            </p>
          </div>
          <AnimatePresence initial={false}>
            {exit ? (
              <Arrive follow key={exit.id}>
                <ExitRule index={free.length} rule={exit} />
              </Arrive>
            ) : null}
          </AnimatePresence>
          {exit ? null : (
            <div className="pl-8 sm:pl-10">
              <div className="rounded-block border border-cladd-outline border-dashed px-4 py-5 text-cladd-fg-soft text-sm">
                The exit lands here.
              </div>
            </div>
          )}
        </div>
      </section>
      <DragOverlay dropAnimation={null}>
        <Overlay drag={drag} />
      </DragOverlay>
    </DndContext>
  );
}
