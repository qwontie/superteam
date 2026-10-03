import { Button, cn, Input, Spinner, Textarea } from "@cladd-ui/react";
import { ArrowUp, CircleCheck, CloudOff, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useState,
} from "react";
import { QUICK } from "@/components/pact/motion";
import { GoPro } from "@/components/shell/go-pro";
import { type Question, useAi } from "@/features/builder/ai";
import { useBuilder } from "@/features/builder/state";
import { formatWhen } from "@/lib/format";
import { type Quota, useQuota } from "@/lib/use-quota";

type Variant = "start" | "side";

const TEXT_MAX = 2000;
const EXAMPLES = [
  "I pay 2 SOL for a landing page. Three reviewers, two must approve. If nothing happens in 10 days, I get the money back.",
  "Bounty of 5 SOL for the best bug report. Two of three judges pick the winner. Refund to me after two weeks.",
  "1 SOL to my designer once she marks the logo as done and I stay silent for 3 days. No delivery in a week means a refund.",
] as const;

const COPY: Record<
  Variant,
  { button: string; hint: string; lead: string; title: string }
> = {
  side: {
    button: "Change the blocks",
    hint: "Make the deadline two weeks. Add a second reviewer. Split the refund in half.",
    lead: "Say what to change. The blocks update in place and nothing is signed.",
    title: "Change it in your own words",
  },
  start: {
    button: "Build the blocks",
    hint: "Who pays whom, how much, and what has to happen first",
    lead: "The helper turns your text into the same blocks. It only proposes: you read every block and sign exactly what is on the canvas.",
    title: "Describe it in your own words",
  },
};

const quotaText = (quota: Quota | null) => {
  if (!quota) {
    return null;
  }
  if (quota.tier === "pro") {
    return quota.pro_expires_at
      ? `Pro until ${formatWhen(quota.pro_expires_at)}: unlimited drafts`
      : "Pro: unlimited drafts";
  }
  if (quota.remaining === null) {
    return null;
  }
  return `${quota.remaining} of ${quota.limit ?? quota.remaining} free drafts left today`;
};

function Example({ text }: { text: string }) {
  const { setText } = useAi();
  const pick = useCallback(() => setText(text), [setText, text]);
  return (
    <li>
      <button
        className="w-full rounded-chip px-3 py-2 text-left text-cladd-fg-soft text-sm shadow-cladd-outline transition-colors duration-150 hover:bg-cladd-surface-hover hover:text-cladd-fg"
        onClick={pick}
        type="button"
      >
        {text}
      </button>
    </li>
  );
}

function QuestionCard({ question }: { question: Question }) {
  const { dismiss, send, status } = useAi();
  const [answer, setAnswer] = useState("");
  const close = useCallback(() => dismiss(question.id), [dismiss, question.id]);
  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (answer.trim() !== "") {
        send(`${question.text} ${answer.trim()}`);
      }
    },
    [answer, question.text, send]
  );
  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 rounded-chip bg-cladd-surface-cut p-3 shadow-cladd-cut-outline"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0, y: 6 }}
      transition={QUICK}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm">{question.text}</p>
        <Button
          aria-label="Dismiss this question"
          onClick={close}
          size="sm"
          square
          variant="transparent"
        >
          <X aria-hidden="true" size={14} />
        </Button>
      </div>
      <form className="flex gap-2" onSubmit={submit}>
        <Input
          className="min-w-0 flex-1"
          inputComponentProps={{ "aria-label": `Answer: ${question.text}` }}
          onChange={setAnswer}
          placeholder="Answer here, or fill the block yourself"
          size="lg"
          value={answer}
        />
        <Button
          disabled={answer.trim() === "" || status !== "idle"}
          size="lg"
          type="submit"
        >
          Answer
        </Button>
      </form>
    </motion.li>
  );
}

function Status() {
  const { failure, note, online, recheck, stage, status } = useAi();
  if (status !== "idle") {
    return (
      <p className="flex items-center gap-2.5 text-sm">
        <Spinner color="neutral" size="sm" />
        {stage}
      </p>
    );
  }
  if (failure) {
    const offline = online === false;
    return (
      <div className="flex flex-col gap-2.5">
        <p className="flex flex-col gap-1 text-sm">
          <span className={cn("font-medium", !offline && "text-pact-stop")}>
            {failure.title}
          </span>
          <span className="text-cladd-fg-soft">{failure.detail}</span>
        </p>
        {failure.code === "quota_exhausted" ? <GoPro /> : null}
        {offline ? (
          <div>
            <Button onClick={recheck} size="lg">
              Check again
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  if (online === false) {
    return (
      <div className="flex flex-col gap-2.5">
        <p className="flex items-start gap-2 text-sm">
          <CloudOff
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-cladd-fg-soft"
            size={16}
          />
          <span>
            <span className="font-medium">The AI helper is offline.</span>{" "}
            <span className="text-cladd-fg-soft">
              Everything else works without it: start from a template or build
              the blocks by hand.
            </span>
          </span>
        </p>
        <div>
          <Button onClick={recheck} size="lg">
            Check again
          </Button>
        </div>
      </div>
    );
  }
  if (note) {
    return (
      <p className="flex items-start gap-2 text-sm">
        <CircleCheck
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-cladd-fg-soft"
          size={16}
        />
        {note}
      </p>
    );
  }
  return null;
}

export function PromptBox({ variant }: { variant: Variant }) {
  const { online, origin, questions, quota, send, setText, status, text } =
    useAi();
  const { mode } = useBuilder();
  const copy = COPY[variant];
  const busy = status !== "idle";
  const blocked = busy || online === false;
  const ready = text.trim() !== "" && !blocked;

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      send(text);
    },
    [send, text]
  );
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        send(text);
      }
    },
    [send, text]
  );
  const known = useQuota();
  const usage = quotaText(quota ?? known.data ?? null);

  if (mode === "play") {
    return null;
  }
  return (
    <section
      aria-label={copy.title}
      className={cn(
        "flex flex-col gap-4 rounded-block bg-cladd-surface p-4 shadow-cladd-outline",
        variant === "start" && "sm:p-5"
      )}
      ref={origin}
    >
      <div className="flex flex-col gap-1.5">
        <h2
          className={cn(
            "font-display font-semibold tracking-[-0.01em]",
            variant === "start" ? "text-2xl" : "text-base"
          )}
        >
          {copy.title}
        </h2>
        <p className="text-cladd-fg-soft text-sm">{copy.lead}</p>
      </div>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Textarea
          aria-label={copy.title}
          disabled={blocked}
          inputClassName={variant === "start" ? "min-h-28" : "min-h-16"}
          maxLength={TEXT_MAX}
          onChange={setText}
          onKeyDown={onKeyDown}
          placeholder={copy.hint}
          size="xl"
          value={text}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="text-cladd-fg-soft text-xs">
            {usage ?? "Enter sends, Shift and Enter adds a line"}
          </span>
          <Button
            disabled={!ready}
            size="xl"
            type="submit"
            variant="solid-fill"
          >
            <ArrowUp aria-hidden="true" size={16} />
            {copy.button}
          </Button>
        </div>
      </form>
      <div aria-live="polite" className="empty:hidden">
        <Status />
      </div>
      <AnimatePresence initial={false}>
        {questions.length > 0 ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="flex flex-col gap-2"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={QUICK}
          >
            <h3 className="font-medium text-cladd-fg-soft text-xs">
              The helper could not tell from your text
            </h3>
            <ul className="flex flex-col gap-2">
              {questions.map((question) => (
                <QuestionCard key={question.id} question={question} />
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {variant === "start" ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-cladd-fg-soft text-xs">
            Try one of these
          </h3>
          <ul className="flex flex-col gap-2">
            {EXAMPLES.map((example) => (
              <Example key={example} text={example} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
