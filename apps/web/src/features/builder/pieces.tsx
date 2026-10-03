import { cn } from "@cladd-ui/react";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import { Clock3, Eye, PenLine } from "lucide-react";
import type { PointerEventHandler } from "react";
import type { PieceType } from "@/features/builder/model";
import type { ConditionRole } from "@/lib/pact";

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
