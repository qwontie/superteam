import { cn } from "@cladd-ui/react";
import {
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  Coins,
  FileText,
  GitMerge,
  PenLine,
  PenOff,
  Split,
  TrendingUp,
  Trophy,
  Undo2,
  UsersRound,
} from "lucide-react";
import {
  type ChangeEvent,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
} from "react";
import {
  BLOCKS,
  type Category,
  type PaletteKind,
} from "@/features/builder/blocks";
import type { ConditionState } from "@/lib/pact";

export const CATEGORY_CLASS: Record<Category, string> = {
  facts: "pact-role-proof",
  github: "[--pact-role:oklch(0.8_0.12_258)]",
  money: "pact-role-money",
  people: "pact-role-people",
  time: "pact-role-time",
};

const ICON = {
  after: Clock3,
  api: Braces,
  green: CircleCheck,
  judges: Trophy,
  merged: GitMerge,
  page: FileText,
  pay: Coins,
  price: TrendingUp,
  refund: Undo2,
  signed: PenLine,
  split: Split,
  unsigned: PenOff,
  vote: UsersRound,
  wikidata: BookOpen,
} as const;

const EditableContext = createContext(false);

export const useEditable = () => useContext(EditableContext);

const SHELL =
  "group/block relative inline-flex min-h-8 max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-chip py-1 pr-2 pl-1.5 text-left font-medium text-sm transition-colors duration-200 ease-pact";
const HOLLOW =
  "bg-[color-mix(in_oklab,var(--pact-role)_13%,transparent)] text-(--pact-role) shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--pact-role)_34%,transparent)]";
const SOLID = "bg-(--pact-role) text-pact-ink";

export function BlockIcon({
  holds = false,
  kind,
}: {
  holds?: boolean;
  kind: PaletteKind;
}) {
  const Icon = ICON[kind];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-[6px]",
        holds
          ? "bg-pact-ink text-(--pact-role)"
          : "shadow-[inset_0_0_0_1.5px_currentColor]"
      )}
    >
      {holds ? (
        <Check size={13} strokeWidth={3} />
      ) : (
        <Icon size={12} strokeWidth={2.25} />
      )}
    </span>
  );
}

interface BlockShellProps {
  broken?: boolean;
  children: ReactNode;
  className?: string;
  editable?: boolean;
  handle?: ReactNode;
  kind: PaletteKind;
  state?: ConditionState;
}

export function BlockShell({
  broken = false,
  children,
  className,
  editable = false,
  handle,
  kind,
  state = "static",
}: BlockShellProps) {
  const holds = state === "holds";
  return (
    <EditableContext value={editable}>
      <span
        className={cn(
          SHELL,
          CATEGORY_CLASS[BLOCKS[kind].category],
          holds ? SOLID : HOLLOW,
          broken &&
            "outline-dashed outline-1 outline-pact-stop outline-offset-2",
          className
        )}
        data-block={kind}
        data-state={state}
      >
        {handle ?? <BlockIcon holds={holds} kind={kind} />}
        {children}
      </span>
    </EditableContext>
  );
}

export const SOCKET =
  "h-6 min-w-6 max-w-full rounded-[6px] border border-transparent bg-cladd-bg/70 px-1.5 font-medium text-[13px] text-cladd-fg leading-[22px] outline-none transition-[border-color] duration-150 focus:border-(--pact-role) focus-visible:outline-none! group-data-[state=holds]/block:bg-pact-ink/15 group-data-[state=holds]/block:text-pact-ink";
const EMPTY =
  "border-(--pact-role) border-dashed bg-transparent text-(--pact-role) placeholder:text-(--pact-role) placeholder:opacity-75";

const SIZING =
  typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");
const MIN_CH = 3;

interface TextSlotProps {
  anchor?: string;
  label: string;
  max?: number;
  mode?: "decimal" | "numeric" | "text" | "url";
  mono?: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}

export function TextSlot({
  anchor,
  label,
  max,
  mode = "text",
  mono = false,
  onChange,
  placeholder,
  value,
}: TextSlotProps) {
  const editable = useEditable();
  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    [onChange]
  );
  const empty = value.trim() === "";
  const look = cn(SOCKET, empty && EMPTY, mono && "font-mono text-xs");
  const shown = empty ? placeholder : value;
  if (!editable) {
    return (
      <span
        className={cn(look, "inline-block truncate", empty && "opacity-75")}
      >
        {shown}
      </span>
    );
  }
  return (
    <input
      aria-label={label}
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      className={cn(look, "field-sizing-content")}
      data-anchor={empty ? anchor : undefined}
      data-slot=""
      inputMode={mode}
      maxLength={max}
      onChange={change}
      placeholder={placeholder}
      spellCheck={false}
      style={
        SIZING
          ? undefined
          : {
              width: `${Math.max(MIN_CH, (value || placeholder).length) + 2}ch`,
            }
      }
      value={value}
    />
  );
}

export interface PickOption {
  label: string;
  value: string;
}

interface PickSlotProps {
  label: string;
  onChange: (value: string) => void;
  options: readonly PickOption[];
  value: string;
}

export function PickSlot({ label, onChange, options, value }: PickSlotProps) {
  const editable = useEditable();
  const change = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
    [onChange]
  );
  const shown = options.find((option) => option.value === value)?.label;
  if (!editable) {
    return (
      <span className={cn(SOCKET, "inline-block truncate")}>
        {shown ?? value}
      </span>
    );
  }
  return (
    <span className="relative inline-flex max-w-full">
      <select
        aria-label={label}
        className={cn(
          SOCKET,
          "field-sizing-content cursor-pointer appearance-none pr-5"
        )}
        data-slot=""
        onChange={change}
        value={value}
      >
        {shown === undefined ? <option value={value}>{value}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-cladd-fg-soft group-data-[state=holds]/block:text-pact-ink"
        size={12}
      />
    </span>
  );
}

const MINUTE_MS = 60_000;
const LOCAL_LENGTH = 16;

const toLocalInput = (ts: number) => {
  const date = new Date(ts * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * MINUTE_MS);
  return local.toISOString().slice(0, LOCAL_LENGTH);
};

const fromLocalInput = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : Math.floor(time / 1000);
};

interface DateSlotProps {
  label: string;
  late: boolean;
  onChange: (ts: number) => void;
  shown: string;
  ts: number;
}

export function DateSlot({ label, late, onChange, shown, ts }: DateSlotProps) {
  const editable = useEditable();
  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = fromLocalInput(event.target.value);
      if (next !== null) {
        onChange(next);
      }
    },
    [onChange]
  );
  if (!editable) {
    return (
      <span className={cn(SOCKET, "inline-block tabular-nums")}>{shown}</span>
    );
  }
  return (
    <input
      aria-label={label}
      className={cn(
        SOCKET,
        "tabular-nums [color-scheme:dark]",
        late && "border-pact-stop border-dashed text-pact-stop"
      )}
      data-slot=""
      onChange={change}
      type="datetime-local"
      value={toLocalInput(ts)}
    />
  );
}

export function StaticSlot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(SOCKET, "inline-block truncate", className)}>
      {children}
    </span>
  );
}

export const SOCKET_BUTTON = cn(
  SOCKET,
  "inline-flex cursor-pointer items-center gap-1 truncate"
);
export const SOCKET_EMPTY = EMPTY;
