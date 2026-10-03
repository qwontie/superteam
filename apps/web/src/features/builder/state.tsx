import { nowSeconds } from "@pact/sdk";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Draft } from "@/features/builder/model";
import { type Validation, validateDraft } from "@/features/builder/problems";
import { useWallet } from "@/lib/use-wallet";

export type Mode = "build" | "play";

export interface Created {
  address: string;
  funded: boolean;
  funder: string;
  lamports: string;
  signature: string;
  title: string;
}

interface BuilderValue {
  created: Created | null;
  draft: Draft | null;
  edit: (change: (draft: Draft) => Draft) => void;
  locked: boolean;
  mode: Mode;
  now: number;
  replace: (draft: Draft | null) => void;
  setCreated: (created: Created | null) => void;
  setLocked: (locked: boolean) => void;
  setMode: (mode: Mode) => void;
  validation: Validation;
  wallet: string | null;
}

const STORAGE_KEY = "pact.builder.draft.v2";
const CLOCK_STEP_MS = 20_000;
const EMPTY: Validation = { problems: [], spec: null };

const BuilderContext = createContext<BuilderValue | null>(null);

const pruneChecks = (draft: Draft): Draft => {
  const used = new Set(
    draft.rules.flatMap((rule) =>
      rule.when.flatMap((condition) =>
        condition.type === "attested" ? [condition.check] : []
      )
    )
  );
  return draft.checks.every((check) => used.has(check.id))
    ? draft
    : { ...draft, checks: draft.checks.filter((check) => used.has(check.id)) };
};

const isDraft = (value: unknown): value is Draft => {
  const draft = value as Partial<Draft> | null;
  return (
    typeof draft === "object" &&
    draft !== null &&
    typeof draft.title === "string" &&
    typeof draft.amount === "string" &&
    typeof draft.funder === "string" &&
    Array.isArray(draft.parties) &&
    Array.isArray(draft.checks) &&
    Array.isArray(draft.rules)
  );
};

const loadDraft = (): Draft | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const saveDraft = (draft: Draft | null) => {
  try {
    if (draft) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    return false;
  }
  return true;
};

const useSlowClock = () => {
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => {
    const timer = setInterval(() => setNow(nowSeconds()), CLOCK_STEP_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
};

export function BuilderProvider({ children }: { children: ReactNode }) {
  const { address: wallet } = useWallet();
  const [raw, setDraft] = useState<Draft | null>(loadDraft);
  const [mode, setMode] = useState<Mode>("build");
  const [locked, setLocked] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const now = useSlowClock();
  const draft = useMemo(
    () => (raw && !locked ? pruneChecks(raw) : raw),
    [locked, raw]
  );

  useEffect(() => {
    if (!locked) {
      saveDraft(draft);
    }
  }, [draft, locked]);

  const edit = useCallback((change: (draft: Draft) => Draft) => {
    setDraft((current) =>
      current ? pruneChecks(change(pruneChecks(current))) : current
    );
  }, []);

  const validation = useMemo(
    () => (draft ? validateDraft(draft, wallet, now) : EMPTY),
    [draft, now, wallet]
  );

  const value = useMemo<BuilderValue>(
    () => ({
      created,
      draft,
      edit,
      locked,
      mode,
      now,
      replace: setDraft,
      setCreated,
      setLocked,
      setMode,
      validation,
      wallet,
    }),
    [created, draft, edit, locked, mode, now, validation, wallet]
  );

  return <BuilderContext value={value}>{children}</BuilderContext>;
}

export const useBuilder = () => {
  const value = useContext(BuilderContext);
  if (!value) {
    throw new Error("useBuilder must be used inside BuilderProvider");
  }
  return value;
};

export const useDraft = () => {
  const { draft } = useBuilder();
  if (!draft) {
    throw new Error("useDraft needs a draft on the canvas");
  }
  return draft;
};
