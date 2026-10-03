import { Button } from "@cladd-ui/react";
import {
  type DealState,
  evaluateDeal,
  gig,
  nowSeconds,
  solToLamports,
  votesFromBitmaps,
} from "@pact/sdk";
import { RotateCcw } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { DealRule } from "@/components/pact/deal-rule";
import { QUICK } from "@/components/pact/motion";
import { FiredNote, StatusPill, VaultAmount } from "@/components/pact/vault";
import { ruleStatus } from "@/lib/pact";
import { useNow } from "@/lib/use-now";

const DAY = 86_400;
const DEADLINE_DAYS = 5;
const JUMP_DAYS = 6;
const AMOUNT = solToLamports("2.5");
const LABELS = ["Client", "Freelancer"] as const;
const REVIEWERS = ["Reviewer 1", "Reviewer 2", "Reviewer 3"] as const;
const MONEY = "example-money";

interface Play {
  jumped: boolean;
  settledRule: number | null;
  signed: boolean;
  yes: number;
}

const START: Play = { jumped: false, settledRule: null, signed: false, yes: 0 };

interface ToggleProps {
  disabled: boolean;
  label: string;
  onToggle: () => void;
  pressed: boolean;
}

function Toggle({ label, pressed, disabled, onToggle }: ToggleProps) {
  return (
    <Button
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      pressed={pressed}
      size="xl"
      variant={pressed ? "solid-fill" : "solid"}
    >
      {label}
    </Button>
  );
}

function ReviewerToggle({
  bit,
  disabled,
  label,
  onFlip,
  yes,
}: {
  bit: number;
  disabled: boolean;
  label: string;
  onFlip: (bit: number) => void;
  yes: number;
}) {
  const flip = useCallback(() => onFlip(bit), [bit, onFlip]);
  return (
    <Toggle
      disabled={disabled}
      label={`${label} says yes`}
      onToggle={flip}
      // biome-ignore lint/suspicious/noBitwiseOperators: votes are an on-chain bitmap
      pressed={(yes & bit) !== 0}
    />
  );
}

export function ExampleDeal() {
  const [deadline] = useState(() => nowSeconds() + DEADLINE_DAYS * DAY);
  const [play, setPlay] = useState<Play>(START);
  const clock = useNow();
  const now = play.jumped ? clock + JUMP_DAYS * DAY : clock;
  const settled = play.settledRule !== null;

  const spec = useMemo(
    () =>
      gig({
        amount: AMOUNT,
        check: {
          target: "Landing page delivered as agreed",
          witnesses: [...REVIEWERS],
        },
        client: LABELS[0],
        deadline,
        freelancer: LABELS[1],
        title: "Landing page for Acme",
      }),
    [deadline]
  );

  const deal = useMemo<DealState>(
    () => ({
      address: "example",
      creator: LABELS[0],
      dealId: 0n,
      lamports: settled ? 0n : AMOUNT,
      settledRule: play.settledRule,
      signals: [play.signed ? clock : null, null],
      spec,
      status: settled ? "settled" : "funded",
      votes: [votesFromBitmaps(play.yes, 0, REVIEWERS.length)],
    }),
    [clock, play.settledRule, play.signed, play.yes, settled, spec]
  );

  const evaluation = useMemo(() => evaluateDeal(deal, now), [deal, now]);

  const flipVote = useCallback((bit: number) => {
    // biome-ignore lint/suspicious/noBitwiseOperators: votes are an on-chain bitmap
    setPlay((state) => ({ ...state, yes: state.yes ^ bit }));
  }, []);
  const flipSigned = useCallback(() => {
    setPlay((state) => ({ ...state, signed: !state.signed }));
  }, []);
  const flipJump = useCallback(() => {
    setPlay((state) => ({ ...state, jumped: !state.jumped }));
  }, []);
  const fire = useCallback((rule: number) => {
    setPlay((state) => ({ ...state, settledRule: rule }));
  }, []);
  const restart = useCallback(() => setPlay(START), []);

  return (
    <LayoutGroup>
      <section
        aria-label="Example deal"
        className="flex flex-col gap-5 rounded-[22px] bg-cladd-surface-cut p-4 shadow-cladd-cut-outline sm:p-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-h-[4.5rem] flex-col justify-end gap-1.5">
            <span className="text-cladd-fg-soft text-sm">{spec.title}</span>
            <VaultAmount
              flightId={MONEY}
              lamports={AMOUNT}
              status={deal.status}
            />
          </div>
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {settled ? (
                <motion.div
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  transition={QUICK}
                >
                  <Button onClick={restart} size="lg" variant="transparent">
                    <RotateCcw aria-hidden="true" size={14} />
                    Start over
                  </Button>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <StatusPill status={deal.status} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {evaluation.rules.map((rule) => {
            const status = ruleStatus(deal, rule);
            return (
              <DealRule
                action={
                  status === "armed" ? (
                    <FireButton onFire={fire} rule={rule.rule} />
                  ) : null
                }
                evaluation={rule}
                key={rule.rule}
                labels={LABELS}
                note={
                  status === "fired" ? (
                    <FiredNote flightId={MONEY} lamports={AMOUNT} />
                  ) : null
                }
                now={now}
                ruleIndex={rule.rule}
                showAddresses={false}
                spec={spec}
                status={status}
                votes={deal.votes}
              />
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-cladd-fg-soft text-sm">
            Try it: make a condition come true. This example runs in your
            browser, nothing here touches the chain.
          </p>
          <div className="flex flex-wrap gap-2">
            {REVIEWERS.map((label, position) => (
              <ReviewerToggle
                bit={2 ** position}
                disabled={settled}
                key={label}
                label={label}
                onFlip={flipVote}
                yes={play.yes}
              />
            ))}
            <Toggle
              disabled={settled}
              label="Client signs"
              onToggle={flipSigned}
              pressed={play.signed}
            />
            <Toggle
              disabled={settled}
              label="Skip past the deadline"
              onToggle={flipJump}
              pressed={play.jumped}
            />
          </div>
        </div>
      </section>
    </LayoutGroup>
  );
}

function FireButton({
  rule,
  onFire,
}: {
  rule: number;
  onFire: (rule: number) => void;
}) {
  const fire = useCallback(() => onFire(rule), [onFire, rule]);
  return (
    <Button onClick={fire} size="xl" variant="solid-fill">
      Execute
    </Button>
  );
}
