import { Button, cn } from "@cladd-ui/react";
import {
  type DealState,
  evaluateDeal,
  freelanceWithCheck,
  nowSeconds,
  solToLamports,
  votesFromBitmaps,
} from "@pact/sdk";
import { RotateCcw } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { Amount } from "@/components/pact/amount";
import { DealRule } from "@/components/pact/deal-rule";
import { FLIGHT, QUICK } from "@/components/pact/motion";
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
      freelanceWithCheck({
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
  const yesVotes = deal.votes.map((votes) => votes.yes);

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
            {settled ? (
              <motion.span
                animate={{ opacity: 1 }}
                className="font-display font-semibold text-4xl text-cladd-fg-softer leading-none tracking-[-0.03em]"
                initial={{ opacity: 0 }}
                transition={QUICK}
              >
                Vault is empty
              </motion.span>
            ) : (
              <motion.span
                className="inline-flex"
                layoutId={MONEY}
                transition={FLIGHT}
              >
                <Amount lamports={AMOUNT} size="lg" />
              </motion.span>
            )}
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
            <span
              className={cn(
                "inline-flex h-7 items-center gap-2 rounded-full px-3 font-medium text-xs transition-colors duration-300",
                settled
                  ? "bg-pact-money text-pact-ink"
                  : "text-pact-money shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-pact-money)_40%,transparent)]"
              )}
            >
              {settled ? "Settled" : "Locked in the vault"}
            </span>
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
                    <motion.p
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-pact-ink text-sm"
                      initial={{ opacity: 0, y: 6 }}
                      transition={{ ...QUICK, delay: 0.45 }}
                    >
                      <motion.span
                        className="inline-flex"
                        layoutId={MONEY}
                        transition={FLIGHT}
                      >
                        <Amount lamports={AMOUNT} size="md" tone="ink" />
                      </motion.span>
                      left the vault. No one approved it.
                    </motion.p>
                  ) : null
                }
                now={now}
                ruleIndex={rule.rule}
                showAddresses={false}
                spec={spec}
                status={status}
                yesVotes={yesVotes}
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
