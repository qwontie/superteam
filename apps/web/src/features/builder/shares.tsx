import {
  Button,
  cn,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
} from "@cladd-ui/react";
import { ArrowRight, Equal, Plus } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { Amount } from "@/components/pact/amount";
import { useTone } from "@/components/pact/tone";
import { ArrivePiece } from "@/features/builder/arrive";
import { setShare } from "@/features/builder/blocks";
import { partyName, payoutAmount } from "@/features/builder/describe";
import {
  addPayout,
  type DraftPayout,
  type DraftRule,
  FULL,
  moveDivider,
  removePayout,
  SHARE_STEP,
  setPay,
  splitEvenly,
} from "@/features/builder/model";
import { RemoveLine } from "@/features/builder/parts";
import {
  PartyChip,
  PartyPicker,
  type Place,
} from "@/features/builder/party-chip";
import { anchors } from "@/features/builder/problems";
import {
  BlockShell,
  SOCKET,
  StaticSlot,
  useEditable,
} from "@/features/builder/slots";
import { useBuilder, useDraft } from "@/features/builder/state";
import { formatShare } from "@/lib/format";

const BIG_STEP = 1000;
const MAX_PAYOUTS = 4;

const DIGITS = /\D/g;
const PERCENT_DIGITS = 3;
const PERCENT_MAX = 100;

function ShareSlot({ payout, rule }: { payout: DraftPayout; rule: DraftRule }) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const editable = useEditable();
  const [typed, setTyped] = useState<string | null>(null);
  const percent = payout.bps / SHARE_STEP;
  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const text = event.target.value
        .replace(DIGITS, "")
        .slice(0, PERCENT_DIGITS);
      setTyped(text);
      const wanted = Number(text);
      if (text !== "" && wanted >= 1 && wanted <= PERCENT_MAX) {
        edit((d) =>
          setPay(
            d,
            rule.id,
            setShare(d, rule.pay, payout.party, wanted * SHARE_STEP)
          )
        );
      }
    },
    [edit, payout.party, rule.id, rule.pay]
  );
  const settle = useCallback(() => setTyped(null), []);
  if (!editable) {
    return <StaticSlot className="tabular-nums">{percent}%</StaticSlot>;
  }
  return (
    <label
      className={cn(
        SOCKET,
        "inline-flex items-center tabular-nums focus-within:border-(--pact-role)"
      )}
    >
      <input
        aria-label={`Share of ${partyName(draft, payout.party)} in percent`}
        className="w-[3ch] bg-transparent text-right outline-none focus-visible:outline-none!"
        data-slot=""
        inputMode="numeric"
        onBlur={settle}
        onChange={change}
        value={typed ?? String(percent)}
      />
      %
    </label>
  );
}

function PayBlock({
  amount,
  children,
  payout,
  rule,
}: {
  amount: bigint | null;
  children: ReactNode;
  payout: DraftPayout;
  rule: DraftRule;
}) {
  const { locked, mode } = useBuilder();
  const draft = useDraft();
  const refund = payout.party === draft.funder;
  return (
    <BlockShell
      editable={!locked && mode === "build"}
      kind={refund ? "refund" : "pay"}
    >
      <span>{refund ? "refund" : "pay"}</span>
      {refund && payout.bps === FULL ? null : (
        <>
          <ShareSlot payout={payout} rule={rule} />
          <span>to</span>
        </>
      )}
      {children}
      {amount === null ? null : <Amount lamports={amount} size="sm" />}
    </BlockShell>
  );
}

function PayoutRow({ payout, rule }: { payout: DraftPayout; rule: DraftRule }) {
  const { edit, mode } = useBuilder();
  const draft = useDraft();
  const tone = useTone();
  const party = draft.parties.find((entry) => entry.id === payout.party);
  const amount = payoutAmount(draft, payout.bps);
  const soft = tone === "ink" ? "text-pact-ink/70" : "text-cladd-fg-soft";
  const strong = tone === "ink" ? "text-pact-ink" : "text-cladd-fg";
  const whole = payout.bps === FULL;
  const taken = new Set(rule.pay.map((entry) => entry.party));
  const place = useCallback<Place>(
    (d, partyId) =>
      setPay(
        d,
        rule.id,
        rule.pay.map((entry) =>
          entry.party === payout.party ? { ...entry, party: partyId } : entry
        )
      ),
    [payout.party, rule.id, rule.pay]
  );
  const split = useCallback<Place>(
    (d, partyId) => setPay(d, rule.id, addPayout(rule.pay, partyId)),
    [rule.id, rule.pay]
  );
  const remove = useCallback(
    () => edit((d) => setPay(d, rule.id, removePayout(rule.pay, payout.party))),
    [edit, payout.party, rule.id, rule.pay]
  );
  const others = draft.parties.filter((entry) => !taken.has(entry.id));
  const canSplit =
    rule.pay.length < MAX_PAYOUTS &&
    rule.pay.every((entry) => entry.bps >= SHARE_STEP * 2);
  const chip = party ? (
    <PartyChip
      extra={
        <>
          {canSplit ? (
            <PartyPicker label="Split with" options={others} place={split} />
          ) : null}
          {rule.pay.length > 1 ? (
            <PopoverClose>
              <RemoveLine label="Remove from this payout" onClick={remove} />
            </PopoverClose>
          ) : null}
        </>
      }
      options={others}
      party={party}
      pickLabel="Pay someone else"
      place={place}
    />
  ) : (
    <span className="text-pact-stop text-sm">someone removed</span>
  );
  if (mode === "build" || tone !== "ink") {
    return (
      <PayBlock amount={amount} payout={payout} rule={rule}>
        {chip}
      </PayBlock>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={cn("text-sm", soft)}>
        {payout.party === draft.funder ? "refund" : "pay"}
      </span>
      {whole && amount !== null ? null : (
        <span
          className={cn(
            "font-display font-semibold text-sm tabular-nums",
            strong
          )}
        >
          {whole ? "everything" : formatShare(payout.bps)}
        </span>
      )}
      {amount === null ? null : <Amount lamports={amount} size="md" />}
      <ArrowRight aria-label="to" className={soft} size={15} strokeWidth={2} />
      {chip}
    </span>
  );
}

function ChoosePayee({ rule }: { rule: DraftRule }) {
  const draft = useDraft();
  const place = useCallback<Place>(
    (d, partyId) => setPay(d, rule.id, addPayout([], partyId)),
    [rule.id]
  );
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button
          aria-label="Choose who is paid"
          className="border border-cladd-fg-softer border-dashed"
          data-anchor={anchors.rule(rule.id)}
          rounded
          size="lg"
          square
          variant="transparent"
        >
          <Plus aria-hidden="true" size={15} />
        </Button>
      </PopoverTrigger>
      <Popover className="w-72" offset={8} position="bottom-start">
        <div className="p-4">
          <PartyPicker label="Pay" options={draft.parties} place={place} />
        </div>
      </Popover>
    </PopoverRoot>
  );
}

export function Shares({ rule }: { rule: DraftRule }) {
  const { locked, mode } = useBuilder();
  return (
    <>
      {rule.pay.length === 0 && !locked && mode === "build" ? (
        <ChoosePayee rule={rule} />
      ) : null}
      {rule.pay.map((payout, position) => (
        <ArrivePiece
          className="inline-flex max-w-full"
          key={payout.party}
          position={rule.when.length + position + 1}
        >
          <PayoutRow payout={payout} rule={rule} />
        </ArrivePiece>
      ))}
    </>
  );
}

function Divider({
  index,
  rule,
  track,
}: {
  index: number;
  rule: DraftRule;
  track: React.RefObject<HTMLDivElement | null>;
}) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const left = rule.pay[index];
  const right = rule.pay[index + 1];
  const before = rule.pay
    .slice(0, index)
    .reduce((sum, payout) => sum + payout.bps, 0);
  const leftBps = left?.bps ?? 0;
  const pair = leftBps + (right?.bps ?? 0);

  const move = useCallback(
    (next: number) =>
      edit((d) => setPay(d, rule.id, moveDivider(rule.pay, index, next))),
    [edit, index, rule.id, rule.pay]
  );
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    []
  );
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const rect = track.current?.getBoundingClientRect();
      if (!(rect && event.currentTarget.hasPointerCapture(event.pointerId))) {
        return;
      }
      const position = ((event.clientX - rect.left) / rect.width) * FULL;
      move(position - before);
    },
    [before, move, track]
  );
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? BIG_STEP : SHARE_STEP;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        move(leftBps - step);
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        move(leftBps + step);
      }
    },
    [leftBps, move]
  );

  if (!(left && right)) {
    return null;
  }
  return (
    <button
      aria-label={`Share of ${partyName(draft, left.party)} against ${partyName(draft, right.party)}`}
      aria-orientation="horizontal"
      aria-valuemax={(pair - SHARE_STEP) / SHARE_STEP}
      aria-valuemin={1}
      aria-valuenow={leftBps / SHARE_STEP}
      aria-valuetext={`${partyName(draft, left.party)} ${formatShare(leftBps)}, ${partyName(draft, right.party)} ${formatShare(right.bps)}`}
      className="group absolute top-0 z-10 flex h-full w-6 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      role="slider"
      style={{ left: `${(before + leftBps) / SHARE_STEP}%` }}
      type="button"
    >
      <span className="h-5 w-1.5 rounded-full bg-cladd-fg shadow-[0_0_0_3px_var(--color-cladd-surface-cut)] transition-transform duration-150 group-hover:scale-y-125 group-active:scale-y-125" />
    </button>
  );
}

export function ShareBar({ rule }: { rule: DraftRule }) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const track = useRef<HTMLDivElement>(null);
  const even = useCallback(
    () => edit((d) => setPay(d, rule.id, splitEvenly(rule.pay))),
    [edit, rule.id, rule.pay]
  );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className="relative flex h-8 min-w-48 flex-1 rounded-chip"
        ref={track}
      >
        {rule.pay.map((payout, position) => (
          <div
            className={cn(
              "flex min-w-0 items-center justify-center overflow-hidden bg-cladd-surface px-2 text-xs shadow-cladd-outline",
              position === 0 && "rounded-l-chip",
              position === rule.pay.length - 1 && "rounded-r-chip"
            )}
            key={payout.party}
            style={{ width: `${payout.bps / SHARE_STEP}%` }}
          >
            <span className="truncate">
              <span className="font-display font-semibold tabular-nums">
                {formatShare(payout.bps)}
              </span>{" "}
              <span className="text-cladd-fg-soft">
                {partyName(draft, payout.party)}
              </span>
            </span>
          </div>
        ))}
        {rule.pay.slice(0, -1).map((payout, index) => (
          <Divider index={index} key={payout.party} rule={rule} track={track} />
        ))}
      </div>
      <Button
        aria-label="Split evenly"
        onClick={even}
        size="lg"
        square
        title="Split evenly"
        variant="transparent"
      >
        <Equal aria-hidden="true" size={15} />
      </Button>
    </div>
  );
}
