import { cn, Popover, PopoverRoot, PopoverTrigger } from "@cladd-ui/react";
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
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { Arrive } from "@/features/builder/arrive";
import { blockOf, isMoney } from "@/features/builder/blocks";
import type { ConditionDrag } from "@/features/builder/condition-piece";
import { conditionText } from "@/features/builder/describe";
import {
  addRule,
  canAddRule,
  moveCondition,
  removeCondition,
  reorderRules,
} from "@/features/builder/model";
import {
  BlockFace,
  type PaletteDrag,
  PaletteList,
  usePalette,
} from "@/features/builder/palette";
import { POPOVER_BODY } from "@/features/builder/parts";
import {
  ExitRule,
  type RuleDrag,
  SortableRule,
  type WhenDrop,
} from "@/features/builder/rule-editor";
import { BlockShell } from "@/features/builder/slots";
import { useBuilder, useDraft } from "@/features/builder/state";

type Drag = ConditionDrag | RuleDrag | PaletteDrag;
type Drop = WhenDrop | RuleDrag | { kind: "new-rule" };

const DRAG_DISTANCE = 6;
const NEW_RULE = "new-rule";

const DragContext = createContext<Drag | null>(null);

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

function AddRule() {
  const draft = useDraft();
  const drag = useContext(DragContext);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { isOver, setNodeRef } = useDroppable({
    data: { kind: NEW_RULE },
    disabled: !canAddRule(draft),
    id: NEW_RULE,
  });
  if (!canAddRule(draft)) {
    return null;
  }
  const dragging =
    drag?.kind === "condition" ||
    (drag?.kind === "palette" && !isMoney(drag.block));
  return (
    <div ref={setNodeRef}>
      <PopoverRoot onOpenChange={setOpen} open={open}>
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
        <Popover
          className="w-[19rem] max-w-[calc(100vw-2rem)]"
          offset={8}
          position="bottom-start"
        >
          <div className={POPOVER_BODY}>
            <PaletteList money={false} onPicked={close} ruleId={null} />
          </div>
        </Popover>
      </PopoverRoot>
    </div>
  );
}

function Overlay({ drag }: { drag: Drag | null }) {
  const draft = useDraft();
  if (!drag || drag.kind === "rule") {
    return null;
  }
  if (drag.kind === "palette") {
    return <BlockFace kind={drag.block} />;
  }
  const condition = draft.rules
    .find((rule) => rule.id === drag.ruleId)
    ?.when.find((entry) => entry.id === drag.conditionId);
  if (!condition) {
    return null;
  }
  return (
    <BlockShell kind={blockOf(condition, draft)}>
      <span>{conditionText(condition, draft).label}</span>
    </BlockShell>
  );
}

export function Board({ children }: { children: ReactNode }) {
  const { edit } = useBuilder();
  const { add } = usePalette();
  const [drag, setDrag] = useState<Drag | null>(null);
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
      if (from.kind === "palette") {
        if (to.kind === "when") {
          add(from.block, to.ruleId);
        } else if (to.kind === NEW_RULE && !isMoney(from.block)) {
          add(from.block, null);
        }
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
    [add, edit]
  );

  return (
    <DndContext
      collisionDetection={collision}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      sensors={sensors}
    >
      <DragContext value={drag}>{children}</DragContext>
      <DragOverlay dropAnimation={null}>
        <Overlay drag={drag} />
      </DragOverlay>
    </DndContext>
  );
}

export function Rules() {
  const { locked, mode } = useBuilder();
  const draft = useDraft();
  const editable = !locked && mode === "build";
  const free = draft.rules.filter((rule) => !rule.exit);
  const exit = draft.rules.find((rule) => rule.exit);
  return (
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
      {editable ? <AddRule /> : null}
      <AnimatePresence initial={false}>
        {exit ? (
          <Arrive follow key={exit.id}>
            <ExitRule index={free.length} rule={exit} />
          </Arrive>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
