import { cn } from "@cladd-ui/react";
import { useDraggable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { QUICK, SNAP } from "@/components/pact/motion";
import {
  BLOCKS,
  CATEGORIES,
  canPlace,
  isMoney,
  type PaletteKind,
  placeBlock,
} from "@/features/builder/blocks";
import { pointerDown } from "@/features/builder/pieces";
import {
  BlockShell,
  CATEGORY_CLASS,
  StaticSlot,
} from "@/features/builder/slots";
import { useBuilder, useDraft } from "@/features/builder/state";

export interface PaletteDrag {
  block: PaletteKind;
  kind: "palette";
}

interface PaletteValue {
  add: (kind: PaletteKind, ruleId?: string | null) => void;
  focus: string | null;
  setFocus: (ruleId: string) => void;
  setSheet: (open: boolean) => void;
  sheet: boolean;
}

const PaletteContext = createContext<PaletteValue | null>(null);

export const usePalette = () => {
  const value = useContext(PaletteContext);
  if (!value) {
    throw new Error("usePalette must be used inside PaletteProvider");
  }
  return value;
};

export function PaletteProvider({ children }: { children: ReactNode }) {
  const { edit, now } = useBuilder();
  const draft = useDraft();
  const [chosen, setFocus] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const focus =
    draft.rules.find((rule) => rule.id === chosen)?.id ??
    draft.rules[0]?.id ??
    null;
  const add = useCallback(
    (kind: PaletteKind, ruleId?: string | null) => {
      const target = ruleId === undefined ? focus : ruleId;
      const placed = placeBlock(draft, kind, target, now);
      if (placed.draft === draft) {
        return;
      }
      edit(() => placed.draft);
      if (placed.ruleId) {
        setFocus(placed.ruleId);
      }
    },
    [draft, edit, focus, now]
  );
  const value = useMemo<PaletteValue>(
    () => ({ add, focus, setFocus, setSheet, sheet }),
    [add, focus, sheet]
  );
  return <PaletteContext value={value}>{children}</PaletteContext>;
}

export function BlockFace({
  className,
  kind,
}: {
  className?: string;
  kind: PaletteKind;
}) {
  return (
    <BlockShell className={className} kind={kind}>
      {BLOCKS[kind].parts.map((part) =>
        typeof part === "string" ? (
          <span key={part}>{part}</span>
        ) : (
          <StaticSlot key={part.slot}>{part.slot}</StaticSlot>
        )
      )}
    </BlockShell>
  );
}

interface ItemProps {
  drag: boolean;
  kind: PaletteKind;
  onPicked?: () => void;
  ruleId?: string | null;
}

function PaletteBlock({ drag, kind, onPicked, ruleId }: ItemProps) {
  const { add } = usePalette();
  const draft = useDraft();
  const allowed = canPlace(draft, kind);
  const data: PaletteDrag = { block: kind, kind: "palette" };
  const { isDragging, listeners, setNodeRef } = useDraggable({
    data,
    disabled: !(drag && allowed),
    id: `palette:${kind}`,
  });
  const pick = useCallback(() => {
    add(kind, ruleId);
    onPicked?.();
  }, [add, kind, onPicked, ruleId]);
  return (
    <button
      aria-label={`Add block: ${BLOCKS[kind].name}`}
      className={cn(
        "max-w-full rounded-chip text-left transition-[opacity,translate] duration-150 hover:translate-x-0.5 disabled:translate-x-0 disabled:opacity-35",
        drag && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
      disabled={!allowed}
      onClick={pick}
      onPointerDown={drag ? pointerDown(listeners) : undefined}
      ref={setNodeRef}
      title={
        allowed ? undefined : "A deal holds three checks. Remove one first."
      }
      type="button"
    >
      <BlockFace
        className={drag ? "min-h-7 py-0.5 text-[13px]" : undefined}
        kind={kind}
      />
    </button>
  );
}

interface ListProps {
  allow?: (kind: PaletteKind) => boolean;
  drag?: boolean;
  money?: boolean;
  onPicked?: () => void;
  ruleId?: string | null;
  wrap?: boolean;
}

const anyKind = () => true;

export function PaletteList({
  allow = anyKind,
  drag = false,
  money = true,
  onPicked,
  ruleId,
  wrap = false,
}: ListProps) {
  const shown = (kind: PaletteKind) => allow(kind) && (money || !isMoney(kind));
  const groups = CATEGORIES.filter((category) => category.blocks.some(shown));
  return (
    <>
      {groups.map((category) => (
        <section className="flex flex-col gap-2" key={category.key}>
          <h2
            className={cn(
              "flex items-center gap-2 font-medium text-cladd-fg-soft text-xs",
              CATEGORY_CLASS[category.key]
            )}
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-(--pact-role)"
            />
            {category.name}
          </h2>
          <div
            className={cn(
              "flex items-start gap-1.5",
              wrap ? "flex-wrap" : "flex-col"
            )}
          >
            {category.blocks.filter(shown).map((kind) => (
              <PaletteBlock
                drag={drag}
                key={kind}
                kind={kind}
                onPicked={onPicked}
                ruleId={ruleId}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function PaletteRail() {
  const { locked, mode } = useBuilder();
  const idle = locked || mode !== "build";
  return (
    <aside
      aria-label="Blocks"
      className={cn(
        "sticky top-20 hidden max-h-[calc(100dvh-6rem)] w-[19rem] shrink-0 flex-col gap-3.5 self-start overflow-y-auto overflow-x-hidden pr-1 pb-4 transition-opacity duration-200 lg:flex",
        idle && "pointer-events-none opacity-35"
      )}
      inert={idle}
    >
      <PaletteList drag />
    </aside>
  );
}

export function PaletteSheet() {
  const { setSheet, sheet } = usePalette();
  const close = useCallback(() => setSheet(false), [setSheet]);
  useEffect(() => {
    if (!sheet) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheet(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSheet, sheet]);
  return (
    <AnimatePresence>
      {sheet ? (
        <>
          <motion.button
            animate={{ opacity: 1 }}
            aria-label="Close the blocks"
            className="fixed inset-0 z-40 bg-cladd-bg/70 lg:hidden"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key="backdrop"
            onClick={close}
            transition={QUICK}
            type="button"
          />
          <motion.div
            animate={{ y: 0 }}
            aria-label="Blocks"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col gap-4 overflow-y-auto rounded-t-block bg-cladd-surface px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-cladd-outline lg:hidden"
            exit={{ y: "100%" }}
            initial={{ y: "100%" }}
            key="sheet"
            role="dialog"
            transition={SNAP}
          >
            <PaletteList onPicked={close} wrap />
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
