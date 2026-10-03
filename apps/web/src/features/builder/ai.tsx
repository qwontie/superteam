import { nowSeconds } from "@pact/sdk";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AiEvent,
  checkHealth,
  streamDeal,
} from "@/features/builder/ai-stream";
import { readRule } from "@/features/builder/describe";
import {
  type Draft,
  draftFromWire,
  draftToWire,
  emptyIds,
  type IdTable,
  newId,
  type WireDraft,
} from "@/features/builder/model";
import { useBuilder } from "@/features/builder/state";
import type { Quota } from "@/lib/use-quota";
import type { WalletProof } from "@/lib/wallet-proof";

export type AiStatus = "idle" | "streaming" | "retrying";

export interface AiFailure {
  code: string;
  detail: string;
  title: string;
}

export interface Question {
  id: string;
  text: string;
}

interface AiValue {
  dismiss: (id: string) => void;
  failure: AiFailure | null;
  note: string | null;
  online: boolean | null;
  origin: RefObject<HTMLElement | null>;
  questions: Question[];
  quota: Quota | null;
  recheck: () => void;
  send: (text: string) => void;
  setText: (text: string) => void;
  stage: string | null;
  status: AiStatus;
  text: string;
}

interface Run {
  abort: AbortController;
  acc: WireDraft;
  base: Draft | null;
  ids: IdTable;
  initial: WireDraft;
  queue: AiEvent[];
  timer: ReturnType<typeof setTimeout> | null;
}

const EMPTY_WIRE: WireDraft = {
  amount: null,
  checks: [],
  funder: 0,
  parties: [],
  rules: [],
  title: "",
};

const PACE: Record<AiEvent["type"], number> = {
  check: 260,
  done: 0,
  error: 0,
  meta: 160,
  party: 130,
  question: 0,
  reset: 500,
  rule: 360,
};

const OFFLINE = new Set(["ai_unavailable", "unreachable", "interrupted"]);
const SERVER_ERROR = /^http_5/;

const AiContext = createContext<AiValue | null>(null);

const copyWire = (wire: WireDraft): WireDraft => ({
  ...wire,
  checks: [...wire.checks],
  parties: [...wire.parties],
  rules: [...wire.rules],
});

const isOffline = (code: string) =>
  OFFLINE.has(code) || SERVER_ERROR.test(code);

const describeFailure = (
  event: Extract<AiEvent, { type: "error" }>
): AiFailure => {
  const { code } = event;
  if (isOffline(code)) {
    return {
      code,
      detail:
        "Everything else works without it: start from a template or build the blocks by hand.",
      title: "The AI helper is offline",
    };
  }
  switch (code) {
    case "not_a_deal":
      return {
        code,
        detail:
          "Say who pays whom, how much, and what has to happen before the money moves.",
        title: "That did not read as a deal",
      };
    case "rate_limited":
      return {
        code,
        detail: event.retryAfter
          ? `Wait ${event.retryAfter} seconds and send it again.`
          : "Wait a minute and send it again.",
        title: "Too many requests in a row",
      };
    case "quota_exhausted":
      return {
        code,
        detail:
          "Blocks and templates stay free. Pro gives unlimited drafts, paid on chain.",
        title: "Today's free drafts are used up",
      };
    case "bad_proof":
      return {
        code,
        detail: "Send it again and sign the fresh request in your wallet.",
        title: "The wallet proof was not accepted",
      };
    case "ai_failed":
      return {
        code,
        detail: "Say it more simply, or start from a template and edit it.",
        title: "The helper could not build a valid deal from that",
      };
    case "timeout":
      return {
        code,
        detail: "Nothing changed on the canvas. Send it again.",
        title: "The helper took too long",
      };
    case "too_large":
      return {
        code,
        detail: "Shorten the text and send it again.",
        title: "That is too long",
      };
    default:
      return {
        code,
        detail:
          event.message || "Nothing changed on the canvas. Send it again.",
        title: "The helper could not answer",
      };
  }
};

const stageOf = (event: AiEvent): string | null => {
  switch (event.type) {
    case "party":
      return "Placing the people";
    case "meta":
      return "Filling the vault";
    case "check":
      return "Adding what must be confirmed";
    case "rule":
      return `Writing rule ${event.index + 1}`;
    case "reset":
      return "The first attempt did not pass the checks. Building it again";
    default:
      return null;
  }
};

const patch = (acc: WireDraft, event: AiEvent) => {
  switch (event.type) {
    case "party":
      acc.parties[event.index] = event.slot;
      break;
    case "meta":
      acc.title = event.title;
      acc.funder = event.funder;
      acc.amount = event.amount;
      break;
    case "check":
      acc.checks[event.index] = event.check;
      break;
    case "rule":
      acc.rules[event.index] = event.rule;
      break;
    default:
      break;
  }
};

const dense = (wire: WireDraft): WireDraft => ({
  ...wire,
  checks: wire.checks.filter(Boolean),
  parties: wire.parties.filter(Boolean),
  rules: wire.rules.filter(Boolean),
});

const keepMe = (wire: WireDraft, run: Run): WireDraft => ({
  ...wire,
  parties: wire.parties.map((slot, index) => {
    const before = run.base?.parties.find(
      (party) => party.id === run.ids.parties[index]
    );
    return before?.me && slot.address === null && !slot.open
      ? { ...slot, me: true }
      : slot;
  }),
});

const doneNote = (wire: WireDraft) => {
  const rules = wire.rules.length;
  return `${rules === 1 ? "1 rule is" : `${rules} rules are`} on the canvas. Nothing is signed: read them, change anything, then play the deal.`;
};

export function AiProvider({
  children,
  getProof,
  onQuota,
}: {
  children: ReactNode;
  getProof: () => Promise<WalletProof | null>;
  onQuota: (quota: Quota) => void;
}) {
  const { draft, replace, setLocked, setMode, wallet } = useBuilder();
  const [status, setStatus] = useState<AiStatus>("idle");
  const [stage, setStage] = useState<string | null>(null);
  const [failure, setFailure] = useState<AiFailure | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const origin = useRef<HTMLElement>(null);
  const run = useRef<Run | null>(null);
  const latest = useRef({ draft, wallet });

  useEffect(() => {
    latest.current = { draft, wallet };
  }, [draft, wallet]);

  const recheck = useCallback(() => {
    setOnline(null);
    checkHealth()
      .then(setOnline)
      .catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    recheck();
    return () => {
      const { current } = run;
      if (current) {
        current.abort.abort();
        if (current.timer !== null) {
          clearTimeout(current.timer);
        }
      }
    };
  }, [recheck]);

  const show = useCallback(
    (current: Run) => {
      replace(
        draftFromWire(keepMe(dense(current.acc), current), {
          ids: current.ids,
          origin: "ai",
          wallet: latest.current.wallet,
        })
      );
    },
    [replace]
  );

  const finish = useCallback(
    (current: Run) => {
      if (current.timer !== null) {
        clearTimeout(current.timer);
      }
      run.current = null;
      setLocked(false);
      setStatus("idle");
      setStage(null);
    },
    [setLocked]
  );

  const handle = useCallback(
    (current: Run, event: AiEvent) => {
      const label = stageOf(event);
      if (label) {
        setStage(label);
      }
      if (event.type === "error") {
        replace(current.base);
        setFailure(describeFailure(event));
        if (isOffline(event.code)) {
          setOnline(false);
        }
        finish(current);
        return;
      }
      if (event.type === "done") {
        current.acc = copyWire(event.draft);
        show(current);
        setQuestions(
          event.questions.map((entry) => ({ id: newId(), text: entry }))
        );
        setNote(doneNote(event.draft));
        setText("");
        if (event.quota) {
          setQuota(event.quota);
          onQuota(event.quota);
        }
        finish(current);
        return;
      }
      if (event.type === "reset") {
        current.acc = copyWire(current.initial);
        setStatus("retrying");
        show(current);
        return;
      }
      if (event.type !== "question") {
        setStatus("streaming");
        patch(current.acc, event);
        show(current);
      }
    },
    [finish, onQuota, replace, show]
  );

  const pump = useCallback(
    (current: Run) => {
      const event = current.queue.shift();
      if (!event || run.current !== current) {
        current.timer = null;
        return;
      }
      handle(current, event);
      if (run.current === current) {
        current.timer = setTimeout(() => pump(current), PACE[event.type]);
      }
    },
    [handle]
  );

  const receive = useCallback(
    (current: Run, event: AiEvent) => {
      if (run.current !== current) {
        return;
      }
      if (event.type === "reset") {
        current.queue.length = 0;
      }
      current.queue.push(event);
      if (current.timer === null) {
        pump(current);
      }
    },
    [pump]
  );

  const send = useCallback(
    (input: string) => {
      const prompt = input.trim();
      if (prompt === "" || run.current) {
        return;
      }
      const base = latest.current.draft;
      const out = base
        ? draftToWire(
            base,
            latest.current.wallet,
            base.rules.map((rule) => readRule(rule, base))
          )
        : null;
      const initial = out?.wire ?? EMPTY_WIRE;
      const current: Run = {
        abort: new AbortController(),
        acc: copyWire(initial),
        base,
        ids: out?.ids ?? emptyIds(),
        initial,
        queue: [],
        timer: null,
      };
      run.current = current;
      setFailure(null);
      setNote(null);
      setQuestions([]);
      setStatus("streaming");
      setStage("Reading your words");
      setLocked(true);
      setMode("build");
      show(current);
      getProof()
        .catch(() => null)
        .then((proof) =>
          streamDeal(
            {
              draft: out?.wire ?? null,
              now: nowSeconds(),
              proof,
              text: prompt,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              wallet: latest.current.wallet,
            },
            (event) => receive(current, event),
            current.abort.signal
          )
        )
        .catch(() =>
          receive(current, { code: "unreachable", message: "", type: "error" })
        );
    },
    [getProof, receive, setLocked, setMode, show]
  );

  const dismiss = useCallback((id: string) => {
    setQuestions((list) => list.filter((question) => question.id !== id));
  }, []);

  const value = useMemo<AiValue>(
    () => ({
      dismiss,
      failure,
      note,
      online,
      origin,
      questions,
      quota,
      recheck,
      send,
      setText,
      stage,
      status,
      text,
    }),
    [
      dismiss,
      failure,
      note,
      online,
      questions,
      quota,
      recheck,
      send,
      stage,
      status,
      text,
    ]
  );

  return <AiContext value={value}>{children}</AiContext>;
}

export const useAi = () => {
  const value = useContext(AiContext);
  if (!value) {
    throw new Error("useAi must be used inside AiProvider");
  }
  return value;
};
