import { Button, Slider } from "@cladd-ui/react";
import { RotateCcw } from "lucide-react";
import { readPayouts } from "@/features/builder/describe";
import { useSim } from "@/features/builder/simulation";
import { useDraft } from "@/features/builder/state";
import { formatWhen } from "@/lib/format";

const STEP = 900;
const FULL_PERCENT = 100;

const useOutcome = () => {
  const draft = useDraft();
  const { armed, fired } = useSim();
  const number = (id: string) =>
    draft.rules.findIndex((entry) => entry.id === id) + 1;
  const firedRule = draft.rules.find((entry) => entry.id === fired);
  if (firedRule) {
    return `Rule ${number(firedRule.id)} fired: ${readPayouts(firedRule, draft)}.`;
  }
  if (armed.length === 0) {
    return "Nothing can fire now. The money stays locked.";
  }
  return `Can fire now: rule ${armed.map(number).join(" and ")}.`;
};

export function PlayBar() {
  const { abandon, fired, marks, now, offset, restart, setOffset, span } =
    useSim();
  const outcome = useOutcome();
  return (
    <section
      aria-label="Play the deal"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[1.25rem] bg-cladd-surface py-2 pr-2 pl-4 shadow-cladd-outline"
    >
      <p aria-live="polite" className="sr-only">
        {outcome}
      </p>
      <span className="w-28 shrink-0 font-display font-semibold text-sm tabular-nums">
        {formatWhen(now)}
      </span>
      <fieldset className="relative order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-0">
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
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-1 block h-1.5"
        >
          {marks.map((mark) => (
            <span
              className="absolute top-0 h-1.5 w-0.5 -translate-x-1/2 rounded-full bg-pact-time"
              key={mark.ts}
              style={{ left: `${(mark.offset / span) * FULL_PERCENT}%` }}
            />
          ))}
        </span>
      </fieldset>
      <span className="ml-auto flex items-center gap-1.5">
        <Button
          disabled={fired !== null}
          onClick={abandon}
          size="xl"
          title="Jump past every deadline with nobody acting"
        >
          Everyone disappears
        </Button>
        <Button
          aria-label="Start again"
          onClick={restart}
          size="xl"
          square
          title="Start again"
          variant="transparent"
        >
          <RotateCcw aria-hidden="true" size={15} />
        </Button>
      </span>
    </section>
  );
}
