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
import { ArrowRight, Plus } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useRef,
} from "react";
import { Amount } from "@/components/pact/amount";
import { PartyAvatar } from "@/components/pact/party";
import { useTone } from "@/components/pact/tone";
import { ArrivePiece } from "@/features/builder/arrive";
import { partyName, payoutAmount } from "@/features/builder/describe";
import {
  addPayout,
  type DraftPayout,
  type DraftRule,
  FULL,
  moveDivider,
  type PartySlot,
  partyAddress,
  removePayout,
  SHARE_STEP,
  setPay,
  splitEvenly,
} from "@/features/builder/model";
import { RemoveLine, SlotPill } from "@/features/builder/parts";
import { useBuilder, useDraft } from "@/features/builder/state";
import { formatShare } from "@/lib/format";

const BIG_STEP = 1000;
const MAX_PAYOUTS = 4;

const emptyText = (party: PartySlot) => {
  if (party.open) {
    return "named later";
  }
  return party.me ? "you" : "no address yet";
};

function RecipientOption({
  current,
  party,
  rule,
}: {
  current: string | null;
  party: PartySlot;
  rule: DraftRule;
}) {
  const { edit, wallet } = useBuilder();
  const draft = useDraft();
  const pick = useCallback(() => {
    const pay =
      current === null
        ? addPayout(rule.pay, party.id)
        : rule.pay.map((payout) =>
            payout.party === current ? { ...payout, party: party.id } : payout
          );
    edit((d) => setPay(d, rule.id, pay));
  }, [current, edit, party.id, rule.id, rule.pay]);
  return (
    <PopoverClose>
      <ListButton
        icon={
          <PartyAvatar
            seed={
              party.open ? null : partyAddress(party, wallet) || party.label
            }
            size={20}
          />
        }
        onClick={pick}
        size="xl"
      >
        {partyName(draft, party.id)}
      </ListButton>
    </PopoverClose>
  );
}

function RecipientMenu({
  current,
  rule,
}: {
  current: string | null;
  rule: DraftRule;
}) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const taken = new Set(rule.pay.map((payout) => payout.party));
  const options = draft.parties.filter((party) => !taken.has(party.id));
  const remove = useCallback(() => {
    if (current !== null) {
      edit((d) => setPay(d, rule.id, removePayout(rule.pay, current)));
    }
  }, [current, edit, rule.id, rule.pay]);
  return (
    <div className="flex flex-col p-1.5">
      {options.length > 0 ? (
        <List>
          {options.map((party) => (
            <RecipientOption
              current={current}
              key={party.id}
              party={party}
              rule={rule}
            />
          ))}
        </List>
      ) : (
        <p className="px-3 py-2 text-cladd-fg-soft text-sm">
          Every party is already paid by this rule.
        </p>
      )}
      {current !== null && rule.pay.length > 1 ? (
        <PopoverClose>
          <RemoveLine label="Remove from this payout" onClick={remove} />
        </PopoverClose>
      ) : null}
    </div>
  );
}

function PayoutRow({ payout, rule }: { payout: DraftPayout; rule: DraftRule }) {
  const { locked, mode, wallet } = useBuilder();
  const draft = useDraft();
  const tone = useTone();
  const editable = !locked && mode === "build";
  const party = draft.parties.find((entry) => entry.id === payout.party);
  const amount = payoutAmount(draft, payout.bps);
  const soft = tone === "ink" ? "text-pact-ink/70" : "text-cladd-fg-soft";
  const strong = tone === "ink" ? "text-pact-ink" : "text-cladd-fg";
  const whole = payout.bps === FULL;
  const pill = party ? (
    <SlotPill
      address={partyAddress(party, wallet) ?? ""}
      empty={emptyText(party)}
      label={partyName(draft, party.id)}
      open={party.open}
      you={party.me && wallet !== null}
    />
  ) : (
    <span className="text-pact-stop text-sm">someone removed</span>
  );
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
      {editable ? (
        <PopoverRoot>
          <PopoverTrigger>
            <button
              aria-label={`Change who is paid: ${party ? partyName(draft, party.id) : "nobody"}`}
              className="max-w-full rounded-full"
              type="button"
            >
              {pill}
            </button>
          </PopoverTrigger>
          <Popover className="w-64" offset={8} position="bottom-start">
            <RecipientMenu current={payout.party} rule={rule} />
          </Popover>
        </PopoverRoot>
      ) : (
        pill
      )}
    </span>
  );
}

export function Shares({ rule }: { rule: DraftRule }) {
  const { locked, mode } = useBuilder();
  const draft = useDraft();
  const editable = !locked && mode === "build";
  const canSplit =
    editable &&
    rule.pay.length < Math.min(MAX_PAYOUTS, draft.parties.length) &&
    rule.pay.every(
      (payout) => payout.bps >= SHARE_STEP * 2 || rule.pay.length === 0
    );
  return (
    <>
      {rule.pay.map((payout, position) => (
        <ArrivePiece
          className="inline-flex max-w-full"
          key={payout.party}
          position={rule.when.length + position + 1}
        >
          <PayoutRow payout={payout} rule={rule} />
        </ArrivePiece>
      ))}
      {canSplit ? (
        <PopoverRoot>
          <PopoverTrigger>
            <Button size="lg" variant="transparent">
              <Plus aria-hidden="true" size={15} />
              {rule.pay.length === 0 ? "Choose who is paid" : "Split"}
            </Button>
          </PopoverTrigger>
          <Popover className="w-64" offset={8} position="bottom-start">
            <RecipientMenu current={null} rule={rule} />
          </Popover>
        </PopoverRoot>
      ) : null}
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
      <Button onClick={even} size="lg" variant="transparent">
        Split evenly
      </Button>
    </div>
  );
}
