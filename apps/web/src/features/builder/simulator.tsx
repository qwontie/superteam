import { Button, Slider } from "@cladd-ui/react";
import { RotateCcw } from "lucide-react";
import { useCallback } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import { partyName, readPayouts } from "@/features/builder/describe";
import type { DraftCheck, PartySlot, Reviewer } from "@/features/builder/model";
import { type TimeMark, useSim } from "@/features/builder/simulation";
import { useDraft } from "@/features/builder/state";
import { formatCountdown, formatWhen } from "@/lib/format";
import type { ConditionRole } from "@/lib/pact";

const STEP = 900;
const FULL_PERCENT = 100;

const useOutcome = () => {
  const draft = useDraft();
  const { armed, fired } = useSim();
  const number = (id: string) =>
    draft.rules.findIndex((entry) => entry.id === id) + 1;
  const firedRule = draft.rules.find((entry) => entry.id === fired);
  if (firedRule) {
    return {
      detail: "Nobody approved it. The other rules are cancelled.",
      title: `Rule ${number(firedRule.id)} fired: ${readPayouts(firedRule, draft)}.`,
    };
  }
  const [first, ...others] = armed;
  const rule = draft.rules.find((entry) => entry.id === first);
  if (!rule) {
    return {
      detail: "Move time forward or let someone act to see what opens.",
      title: "Nothing can fire now. The money stays locked.",
    };
  }
  if (others.length === 0) {
    return {
      detail: "Anyone can execute it. No approval is needed.",
      title: `Rule ${number(rule.id)} can fire: ${readPayouts(rule, draft)}.`,
    };
  }
  return {
    detail: "The first one somebody executes wins. The rest are cancelled.",
    title: `Rules ${armed.map(number).join(" and ")} can fire now.`,
  };
};

function ChipToggle({
  disabled,
  label,
  onToggle,
  pressed,
  tint,
}: {
  disabled: boolean;
  label: string;
  onToggle: () => void;
  pressed: boolean;
  tint: ConditionRole;
}) {
  return (
    <button
      aria-pressed={pressed}
      className="rounded-chip transition-opacity duration-150 disabled:opacity-45"
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <ConditionChip
        className="min-h-10"
        label={label}
        role={tint}
        state={pressed ? "holds" : "pending"}
      />
    </button>
  );
}

function SignalToggle({ party }: { party: PartySlot }) {
  const draft = useDraft();
  const { fired, signals, toggleSignal } = useSim();
  const pressed = signals[party.id] === true;
  const toggle = useCallback(
    () => toggleSignal(party.id),
    [party.id, toggleSignal]
  );
  return (
    <ChipToggle
      disabled={fired !== null}
      label={`${partyName(draft, party.id)} signs`}
      onToggle={toggle}
      pressed={pressed}
      tint="people"
    />
  );
}

function VoteToggle({ reviewer }: { reviewer: Reviewer }) {
  const { fired, toggleVote, votes } = useSim();
  const pressed = votes[reviewer.id] === true;
  const toggle = useCallback(
    () => toggleVote(reviewer.id),
    [reviewer.id, toggleVote]
  );
  return (
    <ChipToggle
      disabled={fired !== null}
      label={`${reviewer.label || "Reviewer"} votes yes`}
      onToggle={toggle}
      pressed={pressed}
      tint="proof"
    />
  );
}

function CheckVotes({ check, index }: { check: DraftCheck; index: number }) {
  const { yesByCheck } = useSim();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-cladd-fg-soft text-sm">
        Check {index + 1}: {yesByCheck[check.id] ?? 0} of {check.threshold}{" "}
        needed
        {check.binds === null ? "" : ", all for the same winner"}
      </span>
      <div className="flex flex-wrap gap-2">
        {check.reviewers.map((reviewer) => (
          <VoteToggle key={reviewer.id} reviewer={reviewer} />
        ))}
      </div>
    </div>
  );
}

function Jump({ mark }: { mark: TimeMark }) {
  const { fired, offset, setOffset } = useSim();
  const jump = useCallback(() => setOffset(mark.offset), [mark, setOffset]);
  const reached = offset >= mark.offset;
  return (
    <ChipToggle
      disabled={fired !== null}
      label={formatWhen(mark.ts)}
      onToggle={jump}
      pressed={reached}
      tint="time"
    />
  );
}

function TimeControl() {
  const { fired, marks, now, offset, setOffset, span } = useSim();
  const reset = useCallback(() => setOffset(0), [setOffset]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-display font-semibold tabular-nums">
          {formatWhen(now)}
        </span>
        <span className="text-cladd-fg-soft text-sm tabular-nums">
          {offset === 0 ? "now" : `${formatCountdown(offset)} from now`}
        </span>
      </div>
      <fieldset className="relative min-w-0">
        <legend className="sr-only">Move time forward</legend>
        <Slider
          color="time"
          disabled={fired !== null}
          max={span}
          min={0}
          onChange={setOffset}
          rangeFill
          size="md"
          step={STEP}
          value={offset}
        />
        <span aria-hidden="true" className="relative mt-1 block h-2">
          {marks.map((mark) => (
            <span
              className="absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded-full bg-pact-time"
              key={mark.ts}
              style={{ left: `${(mark.offset / span) * FULL_PERCENT}%` }}
            />
          ))}
        </span>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={fired !== null || offset === 0}
          onClick={reset}
          size="xl"
        >
          Now
        </Button>
        {marks.map((mark) => (
          <Jump key={mark.ts} mark={mark} />
        ))}
      </div>
    </div>
  );
}

export function Simulator() {
  const draft = useDraft();
  const { abandon, fired, restart } = useSim();
  const outcome = useOutcome();
  const signers = draft.parties.filter(
    (party) =>
      !party.open &&
      draft.rules.some((rule) =>
        rule.when.some(
          (condition) =>
            (condition.type === "signed" || condition.type === "unsigned") &&
            condition.party === party.id
        )
      )
  );
  return (
    <section
      aria-label="Play the deal"
      className="flex flex-col gap-5 rounded-block bg-cladd-surface-cut p-4 shadow-cladd-cut-outline"
    >
      <div aria-live="polite" className="flex flex-col gap-1.5">
        <p className="font-display font-semibold text-lg leading-snug tracking-[-0.01em]">
          {outcome.title}
        </p>
        <p className="text-cladd-fg-soft text-sm">{outcome.detail}</p>
      </div>
      <TimeControl />
      {signers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {signers.map((party) => (
            <SignalToggle key={party.id} party={party} />
          ))}
        </div>
      ) : null}
      {draft.checks.map((check, index) => (
        <CheckVotes check={check} index={index} key={check.id} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={fired !== null} onClick={abandon} size="xl">
          Everyone disappears
        </Button>
        <Button onClick={restart} size="xl" variant="transparent">
          <RotateCcw aria-hidden="true" size={15} />
          Start again
        </Button>
      </div>
      <p className="text-cladd-fg-soft text-xs">
        This runs the same checks as the program, in your browser. Nothing here
        touches the chain.
      </p>
    </section>
  );
}
