import { describe, expect, test } from "bun:test";
import {
  bounty,
  type DealSpec,
  type DealState,
  gig,
  votesFromBitmaps,
} from "@pact/sdk";
import { pendingChecks } from "../src/node";

const CLIENT = "8aBswR9arwLWu7YnG94Qswv7yfNfL6vahzrNqi898QbX";
const FREELANCER = "3iKMsEWGThBcMqviN4FCsqj3um9TacshQXXZCnjcG8YM";
const WITNESSES = [
  "3LsndN1YHY4stDPH3Mzm3SMG86tEe2ifseCohiiB7XgY",
  "8MuJTQ8H6vbpB7aYZCMHFba4XMq9dxnVuyVgi9CMyJCk",
  "wNrW7RVE5KtChXRNNpBHEHMe9Nd1eEKuaVB2zvYrD95",
];
const [ME = "", OTHER = ""] = WITNESSES;
const KINDS = new Set(["http_contains", "github_checks", "github_pr_merged"]);
const DEADLINE = 1_790_000_000;

const gigSpec = (kind: DealSpec["checks"][number]["kind"]) =>
  gig({
    amount: 10_000_000n,
    check: {
      expect: "pact-1",
      kind,
      target: "https://example.com",
      threshold: 2,
      witnesses: WITNESSES,
    },
    client: CLIENT,
    deadline: DEADLINE,
    freelancer: FREELANCER,
    title: "Landing",
  });

const state = (
  spec: DealSpec,
  overrides: Partial<DealState> = {},
  bitmaps: [number, number] = [0, 0],
  nominees: string[] = []
): DealState => ({
  address: "11111111111111111111111111111111",
  creator: CLIENT,
  dealId: 1n,
  lamports: BigInt(spec.amount),
  settledRule: null,
  signals: spec.parties.map(() => null),
  spec,
  status: "funded",
  votes: spec.checks.map((check) =>
    votesFromBitmaps(bitmaps[0], bitmaps[1], check.witnesses.length, nominees)
  ),
  ...overrides,
});

describe("pendingChecks", () => {
  test("picks a funded deal whose check names this key", () => {
    const pending = pendingChecks([state(gigSpec("http_contains"))], ME, KINDS);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.position).toBe(0);
    expect(pending[0]?.index).toBe(0);
  });

  test("ignores manual checks, other witnesses and unfunded deals", () => {
    expect(pendingChecks([state(gigSpec("manual"))], ME, KINDS)).toEqual([]);
    expect(
      pendingChecks([state(gigSpec("http_contains"))], CLIENT, KINDS)
    ).toEqual([]);
    for (const status of ["draft", "settled"] as const) {
      expect(
        pendingChecks([state(gigSpec("http_contains"), { status })], ME, KINDS)
      ).toEqual([]);
    }
  });

  test("never picks a check this key already voted on", () => {
    expect(
      pendingChecks(
        [state(gigSpec("http_contains"), {}, [0b001, 0])],
        ME,
        KINDS
      )
    ).toEqual([]);
    expect(
      pendingChecks(
        [state(gigSpec("http_contains"), {}, [0, 0b001])],
        ME,
        KINDS
      )
    ).toEqual([]);
    expect(
      pendingChecks(
        [state(gigSpec("http_contains"), {}, [0b001, 0])],
        OTHER,
        KINDS
      )
    ).toHaveLength(1);
  });

  test("skips a check that already reached its threshold", () => {
    expect(
      pendingChecks(
        [state(gigSpec("http_contains"), {}, [0b110, 0])],
        ME,
        KINDS
      )
    ).toEqual([]);
  });

  test("a binding check stays open until its slot is filled", () => {
    const spec = bounty({
      amount: 10_000_000n,
      check: {
        kind: "github_pr_merged",
        target: "qwontie/superteam#1",
        threshold: 2,
        witnesses: WITNESSES,
      },
      deadline: DEADLINE,
      sponsor: CLIENT,
      title: "Bounty",
    });
    expect(pendingChecks([state(spec)], ME, KINDS)).toHaveLength(1);
    const filled: DealSpec = { ...spec, parties: [CLIENT, FREELANCER] };
    expect(pendingChecks([state(filled)], ME, KINDS)).toEqual([]);
  });
});
