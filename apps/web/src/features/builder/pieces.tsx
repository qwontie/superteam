import { cn } from "@cladd-ui/react";
import { type DraggableSyntheticListeners, useDraggable } from "@dnd-kit/core";
import { Clock3, Eye, PenLine } from "lucide-react";
import { type PointerEventHandler, useCallback } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import {
  addCheck,
  addRule,
  canAddRule,
  newCondition,
  type PieceType,
} from "@/features/builder/model";
import { useBuilder, useDraft } from "@/features/builder/state";
import type { ConditionRole } from "@/lib/pact";

export interface PieceDrag {
  kind: "piece";
  type: PieceType;
}

interface PieceInfo {
  hint: string;
  label: string;
  role: ConditionRole;
}

export const PIECES: Record<PieceType, PieceInfo> = {
  after: {
    hint: "True from a date and time on",
    label: "After a time",
    role: "time",
  },
  attested: {
    hint: "Enough reviewers of a check vote yes",
    label: "Reviewers confirm",
    role: "proof",
  },
  signed: {
    hint: "One click from that party's wallet",
    label: "A party signs",
    role: "people",
  },
  unsigned: {
    hint: "True for as long as that party stays silent",
    label: "A party has not signed",
    role: "people",
  },
};

export const PIECE_ORDER: PieceType[] = [
  "after",
  "signed",
  "unsigned",
  "attested",
];

const ROLE_ICON = { people: PenLine, proof: Eye, time: Clock3 } as const;
const ROLE_CLASS: Record<ConditionRole, string> = {
  people: "pact-role-people",
  proof: "pact-role-proof",
  time: "pact-role-time",
};

export const pointerDown = (listeners: DraggableSyntheticListeners) =>
  listeners?.onPointerDown as PointerEventHandler<HTMLElement> | undefined;

export function PieceIcon({ type }: { type: PieceType }) {
  const { role } = PIECES[type];
  const Icon = ROLE_ICON[role];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-[6px] text-(--pact-role) shadow-[inset_0_0_0_1.5px_currentColor]",
        ROLE_CLASS[role]
      )}
    >
      <Icon size={12} strokeWidth={2.25} />
    </span>
  );
}

export function PieceChip({ type }: { type: PieceType }) {
  const piece = PIECES[type];
  return <ConditionChip label={piece.label} role={piece.role} />;
}

function PalettePiece({ type }: { type: PieceType }) {
  const { edit, now } = useBuilder();
  const draft = useDraft();
  const drag: PieceDrag = { kind: "piece", type };
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    data: drag,
    id: `piece:${type}`,
  });
  const start = useCallback(
    () =>
      edit((current) => {
        const base =
          type === "attested" && current.checks.length === 0
            ? addCheck(current)
            : current;
        const condition = newCondition(type, base, now);
        return condition ? addRule(base, condition) : current;
      }),
    [edit, now, type]
  );
  return (
    <button
      aria-describedby={attributes["aria-describedby"]}
      aria-label={`${PIECES[type].label}: start a new rule with this piece, or drag it into a rule`}
      className={cn(
        "cursor-grab touch-none rounded-chip transition-opacity duration-150 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40",
        isDragging && "opacity-40"
      )}
      disabled={!canAddRule(draft)}
      onClick={start}
      onPointerDown={pointerDown(listeners)}
      ref={setNodeRef}
      title={PIECES[type].hint}
      type="button"
    >
      <PieceChip type={type} />
    </button>
  );
}

export function Palette() {
  return (
    <div className="flex flex-col gap-2 rounded-block bg-cladd-surface-cut p-3 shadow-cladd-cut-outline">
      <div className="flex flex-wrap items-center gap-2">
        {PIECE_ORDER.map((type) => (
          <PalettePiece key={type} type={type} />
        ))}
      </div>
      <p className="text-cladd-fg-soft text-xs">
        Drag a piece into a rule. Press one to start a new rule with it.
      </p>
    </div>
  );
}
