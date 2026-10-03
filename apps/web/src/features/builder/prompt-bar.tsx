import { Button, cn, Input, Spinner } from "@cladd-ui/react";
import { useSearch } from "@tanstack/react-router";
import { ArrowUp, RotateCw, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { QUICK, SETTLE } from "@/components/pact/motion";
import { GoPro } from "@/components/shell/go-pro";
import { type Question, useAi } from "@/features/builder/ai";
import { useBuilder } from "@/features/builder/state";
import { formatWhen } from "@/lib/format";
import { type Quota, useQuota } from "@/lib/use-quota";

type Variant = "hero" | "dock";

const TEXT_MAX = 2000;
const MAX_HEIGHT = 160;
const PLACEHOLDER: Record<Variant, string> = {
  dock: "Say what to change",
  hero: "Describe your deal",
};

const SWEEP = {
  duration: 1.3,
  ease: "linear",
  repeat: Number.POSITIVE_INFINITY,
} as const;

const quotaTag = (quota: Quota | null) => {
  if (!quota) {
    return null;
  }
  if (quota.tier === "pro") {
    return {
      short: "Pro",
      title: quota.pro_expires_at
        ? `Pro until ${formatWhen(quota.pro_expires_at)}: unlimited drafts`
        : "Pro: unlimited drafts",
    };
  }
  if (quota.remaining === null) {
    return null;
  }
  return {
    short: `${quota.remaining} left`,
    title: `${quota.remaining} of ${quota.limit ?? quota.remaining} free drafts left today`,
  };
};

function QuestionRow({ question }: { question: Question }) {
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
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-block bg-cladd-surface py-1.5 pr-1.5 pl-3.5 shadow-cladd-outline"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0, y: 8 }}
      transition={QUICK}
    >
      <p className="min-w-40 flex-1 text-sm">{question.text}</p>
      <form
        className="flex min-w-48 flex-1 items-center gap-1"
        onSubmit={submit}
      >
        <Input
          className="min-w-0 flex-1"
          inputComponentProps={{ "aria-label": `Answer: ${question.text}` }}
          onChange={setAnswer}
          placeholder="Answer"
          size="lg"
          value={answer}
        />
        <Button
          aria-label="Send the answer"
          disabled={answer.trim() === "" || status !== "idle"}
          size="lg"
          square
          type="submit"
        >
          <ArrowUp aria-hidden="true" size={15} />
        </Button>
        <Button
          aria-label="Dismiss this question"
          onClick={close}
          size="lg"
          square
          variant="transparent"
        >
          <X aria-hidden="true" size={15} />
        </Button>
      </form>
    </motion.li>
  );
}

function Upgrade() {
  const { wallet } = useBuilder();
  if (wallet === null) {
    return (
      <span className="text-cladd-fg-soft">Connect a wallet to go Pro.</span>
    );
  }
  return <GoPro quiet />;
}

function Trouble() {
  const { failure, online } = useAi();
  if (!failure || online === false) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 px-1 text-sm" role="status">
      <p className="flex flex-wrap gap-x-2">
        <span className="font-medium text-pact-stop">{failure.title}</span>
        <span className="text-cladd-fg-soft">{failure.detail}</span>
      </p>
      {failure.code === "quota_exhausted" ? <Upgrade /> : null}
    </div>
  );
}

function Action({
  hero,
  offline,
  ready,
}: {
  hero: boolean;
  offline: boolean;
  ready: boolean;
}) {
  const { recheck } = useAi();
  if (offline) {
    return (
      <Button
        aria-label="Check again"
        onClick={recheck}
        rounded
        size={hero ? "2xl" : "xl"}
        square
        title="Check again"
      >
        <RotateCw aria-hidden="true" size={16} />
      </Button>
    );
  }
  return (
    <Button
      aria-label={hero ? "Build the blocks" : "Change the blocks"}
      disabled={!ready}
      rounded
      size={hero ? "2xl" : "xl"}
      square
      type="submit"
      variant={hero ? "solid-fill" : "solid"}
    >
      <ArrowUp aria-hidden="true" size={hero ? 20 : 16} />
    </Button>
  );
}

const useAutoHeight = (text: string) => {
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = field.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    if (text !== "") {
      element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
    }
  }, [text]);
  return field;
};

export function PromptBar({ variant }: { variant: Variant }) {
  const {
    online,
    origin,
    questions,
    quota,
    send,
    setText,
    stage,
    status,
    text,
  } = useAi();
  const hero = variant === "hero";
  const busy = status !== "idle";
  const offline = online === false;
  const ready = text.trim() !== "" && !busy && !offline;
  const field = useAutoHeight(text);
  const reduced = useReducedMotion();

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
  const change = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value),
    [setText]
  );
  const known = useQuota();
  const usage = quotaTag(quota ?? known.data ?? null);

  const { template } = useSearch({ strict: false }) as { template?: unknown };
  const [focusFirst] = useState(() => template === "ai");
  useEffect(() => {
    if (focusFirst) {
      field.current?.focus();
    }
  }, [field, focusFirst]);

  const label =
    status === "retrying" ? `Second attempt. ${stage ?? ""}` : stage;
  const placeholder = offline
    ? "The AI helper is offline. The blocks work without it."
    : PLACEHOLDER[variant];

  return (
    <div className="flex w-full flex-col gap-2" data-status={status}>
      <AnimatePresence initial={false}>
        {questions.length > 0 ? (
          <motion.ul
            animate={{ opacity: 1 }}
            aria-label="Questions from the helper"
            className="flex flex-col gap-1.5"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={QUICK}
          >
            {questions.map((question) => (
              <QuestionRow key={question.id} question={question} />
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
      <Trouble />
      <motion.form
        aria-label="Describe or change the deal"
        className={cn(
          "relative flex items-end gap-2 overflow-hidden rounded-[1.25rem] bg-cladd-surface shadow-cladd-outline transition-shadow duration-200 focus-within:shadow-[inset_0_0_0_1.5px_var(--color-cladd-fg)]",
          hero ? "p-2.5 pl-5" : "p-2 pl-4"
        )}
        layout="position"
        layoutId="builder-prompt"
        onSubmit={submit}
        ref={origin as React.RefObject<HTMLFormElement | null>}
        transition={SETTLE}
      >
        {busy && !reduced ? (
          <motion.span
            animate={{ left: ["-30%", "100%"] }}
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 h-0.5 w-[30%] rounded-full bg-cladd-fg"
            transition={SWEEP}
          />
        ) : null}
        {busy ? (
          <p
            aria-live="polite"
            className={cn(
              "flex flex-1 items-center gap-2.5",
              hero ? "min-h-12 text-lg" : "min-h-10 text-sm"
            )}
          >
            <Spinner color="neutral" size="sm" />
            {label}
          </p>
        ) : (
          <textarea
            aria-label={PLACEHOLDER[variant]}
            className={cn(
              "min-w-0 flex-1 resize-none bg-transparent text-cladd-fg outline-none placeholder:text-cladd-fg-soft focus-visible:outline-none! disabled:cursor-not-allowed",
              hero ? "py-2.5 text-base sm:text-lg" : "py-2.5 text-sm leading-5"
            )}
            disabled={offline}
            maxLength={TEXT_MAX}
            onChange={change}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            ref={field}
            rows={1}
            value={text}
          />
        )}
        {usage && !busy ? (
          <span
            className="shrink-0 self-center whitespace-nowrap text-cladd-fg-soft text-xs"
            title={usage.title}
          >
            {usage.short}
          </span>
        ) : null}
        <Action hero={hero} offline={offline} ready={ready} />
      </motion.form>
    </div>
  );
}
