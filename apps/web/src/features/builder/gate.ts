import { useEffect } from "react";
import { type DraftCheck, newId, updateCheck } from "@/features/builder/model";
import { ORACLE_WITNESS } from "@/features/builder/starters";
import { useBuilder } from "@/features/builder/state";

export const ORACLE_LABEL = ORACLE_WITNESS;
export const ORACLE_COUNT = 3;

const loadGate = () => import("@pact/sdk/gate-feed");

export const isOracle = (check: DraftCheck) =>
  check.kind === "http_contains" &&
  check.reviewers.length === 1 &&
  check.reviewers[0]?.label === ORACLE_LABEL;

export const withOracle = (check: DraftCheck): DraftCheck => ({
  ...check,
  binds: null,
  reviewers: [{ address: "", id: newId(), label: ORACLE_LABEL }],
  threshold: 1,
});

export const withoutOracle = (check: DraftCheck): DraftCheck =>
  isOracle(check)
    ? {
        ...check,
        reviewers: [{ address: "", id: newId(), label: "Node 1" }],
        threshold: 1,
      }
    : check;

export const gateOf = async (check: DraftCheck) => {
  const gate = await loadGate();
  return await gate.gateFeedFor(check.target.trim(), check.expect.trim());
};

export const storeOracleJobs = async (checks: readonly DraftCheck[]) => {
  const jobs = checks.filter(isOracle);
  if (jobs.length === 0) {
    return true;
  }
  const gate = await loadGate();
  const stored = await Promise.all(
    jobs.map((check) =>
      gate.storeGateFeed(check.target.trim(), check.expect.trim())
    )
  );
  return stored.every(
    (feed, index) =>
      feed.gateAddress === jobs[index]?.reviewers[0]?.address.trim()
  );
};

interface Fix {
  address?: string;
  drop?: boolean;
  expect: string;
  id: string;
  target: string;
}

const soleWitness = (check: DraftCheck) =>
  check.kind === "http_contains" &&
  check.reviewers.length === 1 &&
  check.threshold === 1 &&
  (check.reviewers[0]?.address.trim() ?? "") !== "";

const strayOracle = (check: DraftCheck) =>
  check.kind !== "http_contains" &&
  check.reviewers.some((reviewer) => reviewer.label === ORACLE_LABEL);

const fixFor = async (check: DraftCheck): Promise<Fix | null> => {
  const fix = { expect: check.expect, id: check.id, target: check.target };
  const [witness] = check.reviewers;
  if (strayOracle(check)) {
    return { ...fix, drop: true };
  }
  if (isOracle(check)) {
    const address = await gateOf(check)
      .then((feed) => feed.gateAddress as string)
      .catch(() => "");
    return witness?.address === address ? null : { ...fix, address };
  }
  const gate = await loadGate();
  const matches = await gate
    .isGateCheck({
      expect: check.expect.trim(),
      kind: check.kind,
      target: check.target.trim(),
      threshold: check.threshold,
      witnesses: [witness?.address.trim() ?? ""],
    })
    .catch(() => false);
  return matches ? fix : null;
};

const applyFix = (check: DraftCheck, fix: Fix): DraftCheck => {
  const [witness] = check.reviewers;
  if (!witness || check.target !== fix.target || check.expect !== fix.expect) {
    return check;
  }
  if (fix.drop) {
    return {
      ...check,
      reviewers: [{ address: "", id: newId(), label: "Reviewer 1" }],
      threshold: 1,
    };
  }
  return {
    ...check,
    reviewers: [
      {
        ...witness,
        address: fix.address ?? witness.address,
        label: ORACLE_LABEL,
      },
    ],
  };
};

export const useGateSync = () => {
  const { draft, edit, locked } = useBuilder();
  const checks = draft?.checks;
  useEffect(() => {
    const watched = (checks ?? []).filter(
      (check) => isOracle(check) || soleWitness(check) || strayOracle(check)
    );
    if (locked || watched.length === 0) {
      return;
    }
    let live = true;
    Promise.all(watched.map(fixFor))
      .then((fixes) => {
        const real = fixes.filter((fix) => fix !== null);
        if (!live || real.length === 0) {
          return;
        }
        edit((current) =>
          real.reduce(
            (next, fix) =>
              updateCheck(next, fix.id, (check) => applyFix(check, fix)),
            current
          )
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [checks, edit, locked]);
};
