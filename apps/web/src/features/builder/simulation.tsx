import {
  type CheckVotes,
  type DealSpec,
  type DealState,
  evaluateDeal,
  type RuleEvaluation,
} from "@pact/sdk";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  amountLamports,
  checkIndex,
  type Draft,
  partyIndex,
} from "@/features/builder/model";
import { useBuilder } from "@/features/builder/state";
import { type RuleStatus, ruleStatus } from "@/lib/pact";

interface Play {
  fired: string | null;
  offset: number;
  signals: Record<string, boolean>;
  votes: Record<string, boolean>;
}

export interface RuleSim {
  evaluation: RuleEvaluation;
  status: RuleStatus;
}

export interface TimeMark {
  offset: number;
  ts: number;
}

interface SimValue {
  abandon: () => void;
  armed: string[];
  byRule: Record<string, RuleSim>;
  fire: (ruleId: string) => void;
  fired: string | null;
  marks: TimeMark[];
  now: number;
  offset: number;
  restart: () => void;
  setOffset: (offset: number) => void;
  signals: Record<string, boolean>;
  span: number;
  toggleSignal: (partyId: string) => void;
  toggleVote: (reviewerId: string) => void;
  votes: Record<string, boolean>;
  yesByCheck: Record<string, number>;
}

const START: Play = { fired: null, offset: 0, signals: {}, votes: {} };
const DAY = 86_400;
const HOUR = 3600;
const MARGIN = 1.15;
const SIM_ADDRESS = "simulation";

const SimContext = createContext<SimValue | null>(null);

const afterTimes = (draft: Draft) => {
  const times = new Set<number>();
  for (const rule of draft.rules) {
    for (const condition of rule.when) {
      if (condition.type === "after") {
        times.add(condition.ts);
      }
    }
  }
  return [...times].sort((a, b) => a - b);
};

const checkVotes = (draft: Draft, play: Play): CheckVotes[] =>
  draft.checks.map((check) => {
    const byWitness = check.reviewers.map((reviewer) =>
      play.votes[reviewer.id] ? ("yes" as const) : null
    );
    return {
      byWitness,
      no: 0,
      nominees: byWitness.map((vote) =>
        vote && check.binds !== null ? `winner:${check.binds}` : null
      ),
      yes: byWitness.filter((vote) => vote !== null).length,
    };
  });

const simSpec = (draft: Draft, votes: CheckVotes[]): DealSpec => {
  const named = new Set<string>();
  for (const [index, check] of draft.checks.entries()) {
    if (check.binds !== null && (votes[index]?.yes ?? 0) >= check.threshold) {
      named.add(check.binds);
    }
  }
  return {
    amount: amountLamports(draft.amount) ?? "0",
    checks: draft.checks.map((check) => ({
      binds: check.binds === null ? null : partyIndex(draft, check.binds),
      expect: check.expect,
      kind: check.kind,
      target: check.target,
      threshold: check.threshold,
      witnesses: check.reviewers.map((reviewer) => reviewer.id),
    })),
    funder: partyIndex(draft, draft.funder),
    parties: draft.parties.map((party) => {
      if (!party.open) {
        return `party:${party.id}`;
      }
      return named.has(party.id) ? `winner:${party.id}` : null;
    }),
    rules: draft.rules.map((rule) => ({
      pay: rule.pay.map((payout) => ({
        bps: payout.bps,
        party: partyIndex(draft, payout.party),
      })),
      when: rule.when.map((condition) => {
        if (condition.type === "after") {
          return { ts: condition.ts, type: condition.type };
        }
        if (condition.type === "attested") {
          return {
            check: checkIndex(draft, condition.check),
            type: condition.type,
          };
        }
        return {
          party: partyIndex(draft, condition.party),
          type: condition.type,
        };
      }),
    })),
    title: draft.title,
  };
};

const simulate = (draft: Draft, play: Play, now: number) => {
  const votes = checkVotes(draft, play);
  const spec = simSpec(draft, votes);
  const settledRule = draft.rules.findIndex((rule) => rule.id === play.fired);
  const deal: DealState = {
    address: SIM_ADDRESS,
    creator: SIM_ADDRESS,
    dealId: 0n,
    lamports: BigInt(spec.amount),
    settledRule: settledRule < 0 ? null : settledRule,
    signals: draft.parties.map((party) =>
      play.signals[party.id] ? now : null
    ),
    spec,
    status: settledRule < 0 ? "funded" : "settled",
    votes,
  };
  const evaluation = evaluateDeal(deal, now);
  const byRule: Record<string, RuleSim> = {};
  const armed: string[] = [];
  for (const [index, rule] of draft.rules.entries()) {
    const result = evaluation.rules[index];
    if (result) {
      const status = ruleStatus(deal, result);
      byRule[rule.id] = { evaluation: result, status };
      if (status === "armed") {
        armed.push(rule.id);
      }
    }
  }
  const yesByCheck: Record<string, number> = {};
  for (const [index, check] of draft.checks.entries()) {
    yesByCheck[check.id] = votes[index]?.yes ?? 0;
  }
  return { armed, byRule, settled: settledRule >= 0, yesByCheck };
};

export function SimulationProvider({
  children,
  draft,
}: {
  children: ReactNode;
  draft: Draft;
}) {
  const { now: clock } = useBuilder();
  const [play, setPlay] = useState<Play>(START);

  const times = useMemo(() => afterTimes(draft), [draft]);
  const last = Math.max(clock, ...times);
  const span = Math.ceil((Math.max(last - clock, DAY) * MARGIN) / HOUR) * HOUR;
  const offset = Math.min(play.offset, span);
  const now = clock + offset;

  const result = useMemo(() => simulate(draft, play, now), [draft, now, play]);

  const setOffset = useCallback((next: number) => {
    setPlay((state) => ({ ...state, offset: Math.max(0, next) }));
  }, []);
  const toggleSignal = useCallback((partyId: string) => {
    setPlay((state) => ({
      ...state,
      signals: { ...state.signals, [partyId]: !state.signals[partyId] },
    }));
  }, []);
  const toggleVote = useCallback((reviewerId: string) => {
    setPlay((state) => ({
      ...state,
      votes: { ...state.votes, [reviewerId]: !state.votes[reviewerId] },
    }));
  }, []);
  const fire = useCallback((ruleId: string) => {
    setPlay((state) => ({ ...state, fired: ruleId }));
  }, []);
  const restart = useCallback(() => setPlay(START), []);
  const abandon = useCallback(() => {
    setPlay({ ...START, offset: Number.MAX_SAFE_INTEGER });
  }, []);

  const value = useMemo<SimValue>(
    () => ({
      abandon,
      armed: result.armed,
      byRule: result.byRule,
      fire,
      fired: result.settled ? play.fired : null,
      marks: times
        .filter((ts) => ts > clock)
        .map((ts) => ({ offset: ts - clock, ts })),
      now,
      offset,
      restart,
      setOffset,
      signals: play.signals,
      span,
      toggleSignal,
      toggleVote,
      votes: play.votes,
      yesByCheck: result.yesByCheck,
    }),
    [
      abandon,
      clock,
      fire,
      now,
      offset,
      play,
      restart,
      result,
      setOffset,
      span,
      times,
      toggleSignal,
      toggleVote,
    ]
  );

  return <SimContext value={value}>{children}</SimContext>;
}

export const useSim = () => {
  const value = useContext(SimContext);
  if (!value) {
    throw new Error("useSim must be used inside SimulationProvider");
  }
  return value;
};
