import { describe, expect, test } from "bun:test";
import { createGithub, GithubRateLimited } from "../src/github";
import { verifyGithubChecks } from "../src/kinds/github-checks";
import {
  nomineeFromBody,
  verifyGithubPrMerged,
} from "../src/kinds/github-pr-merged";
import { fakeGithub, fixtureJson } from "./helpers";

interface RunsPage {
  check_runs: {
    conclusion: string | null;
    head_sha: string;
    name: string;
    status: string;
  }[];
  total_count: number;
}

const SHA = "a91e5bebf5761db0d8cf419650379d80340e68c9";
const PAGED_SHA = "33ffd41b5d909394df2844ae902c72f31e559e7b";
const runsPath = (ref: string, pageNumber = 1) =>
  `/repos/solana-foundation/anchor/commits/${encodeURIComponent(ref)}/check-runs?per_page=100&filter=latest&page=${pageNumber}`;
const success = fixtureJson<RunsPage>("check-runs-success.json");
const withRun = (
  status: string,
  conclusion: string | null,
  name = "late job"
): RunsPage => ({
  check_runs: [
    ...success.check_runs,
    { conclusion, head_sha: SHA, name, status },
  ],
  total_count: success.total_count + 1,
});

describe("github_checks", () => {
  test("yes when every check run of the ref concluded successfully", async () => {
    const github = fakeGithub({ [runsPath(SHA)]: { json: success } });
    const verdict = await verifyGithubChecks(
      `solana-foundation/anchor@${SHA}`,
      "success",
      github
    );
    expect(verdict.kind).toBe("yes");
    expect(verdict.evidence).toContain("18 check runs");
    expect(verdict.evidence).toContain("success 18");
    expect(verdict.evidence).toContain("commit a91e5bebf576");
  });

  test("reads every page up to total_count", async () => {
    const github = fakeGithub({
      [runsPath(PAGED_SHA, 1)]: { json: fixtureJson("check-runs-page-1.json") },
      [runsPath(PAGED_SHA, 2)]: { json: fixtureJson("check-runs-page-2.json") },
    });
    const verdict = await verifyGithubChecks(
      `solana-foundation/anchor@${PAGED_SHA}`,
      "success",
      github
    );
    expect(github.calls).toHaveLength(2);
    expect(verdict.kind).toBe("yes");
    expect(verdict.evidence).toContain("117 check runs");
  });

  test("skipped and neutral runs pass, but one success is required", async () => {
    const skippedOnly: RunsPage = {
      check_runs: [
        {
          conclusion: "skipped",
          head_sha: SHA,
          name: "deploy",
          status: "completed",
        },
      ],
      total_count: 1,
    };
    const passing = fakeGithub({
      [runsPath("main")]: { json: withRun("completed", "skipped") },
    });
    const empty = fakeGithub({ [runsPath("main")]: { json: skippedOnly } });
    expect(
      (
        await verifyGithubChecks(
          "solana-foundation/anchor@main",
          "success",
          passing
        )
      ).kind
    ).toBe("yes");
    expect(
      (
        await verifyGithubChecks(
          "solana-foundation/anchor@main",
          "success",
          empty
        )
      ).kind
    ).toBe("wait");
  });

  test.each([
    ["in_progress", null],
    ["queued", null],
    ["completed", "failure"],
    ["completed", "cancelled"],
    ["completed", "timed_out"],
    ["completed", "action_required"],
  ])(
    "wait while a run is %s %s, since a re-run can still pass",
    async (status, conclusion) => {
      const github = fakeGithub({
        [runsPath(SHA)]: { json: withRun(status, conclusion) },
      });
      const verdict = await verifyGithubChecks(
        `solana-foundation/anchor@${SHA}`,
        "success",
        github
      );
      expect(verdict.kind).toBe("wait");
    }
  );

  test("wait when there are no runs or the repo is missing", async () => {
    const none = fakeGithub({
      [runsPath(SHA)]: { json: { check_runs: [], total_count: 0 } },
    });
    expect(
      (
        await verifyGithubChecks(
          `solana-foundation/anchor@${SHA}`,
          "success",
          none
        )
      ).kind
    ).toBe("wait");
    const missing = await verifyGithubChecks(
      "nobody/nothing@main",
      "success",
      fakeGithub({})
    );
    expect(missing.kind).toBe("wait");
    expect(missing.evidence).toContain("404");
  });

  test("branch refs are URL encoded into one path segment", async () => {
    const github = fakeGithub({});
    await verifyGithubChecks(
      "solana-foundation/anchor@feature/x",
      "success",
      github
    );
    expect(github.calls[0]).toContain("/commits/feature%2Fx/check-runs");
  });

  test.each([
    ["solana-foundation/anchor", "success", "not owner/repo@ref"],
    ["anchor@main", "success", "not owner/repo@ref"],
    ["a/b@../../etc", "success", "not owner/repo@ref"],
    ["a/b@main", "green", "expect must be"],
    ["a/b@main", "", "expect must be"],
  ])("no for the malformed check %s / %s", async (target, expectText, why) => {
    const github = fakeGithub({});
    const verdict = await verifyGithubChecks(target, expectText, github);
    expect(verdict.kind).toBe("no");
    expect(verdict.evidence).toContain(why);
    expect(github.calls).toHaveLength(0);
  });
});

const NOMINEE = "3iKMsEWGThBcMqviN4FCsqj3um9TacshQXXZCnjcG8YM";
const pullPath = "/repos/solana-foundation/anchor/pulls/5125";
const merged = fixtureJson<Record<string, unknown>>("pull-merged.json");

describe("github_pr_merged", () => {
  test("yes on a merged pull request", async () => {
    const github = fakeGithub({ [pullPath]: { json: merged } });
    const verdict = await verifyGithubPrMerged(
      "solana-foundation/anchor#5125",
      "",
      false,
      github
    );
    expect(verdict).toEqual({
      evidence:
        "solana-foundation/anchor#5125 merged at 2026-10-02T09:39:20Z as a91e5bebf576",
      kind: "yes",
    });
  });

  test("wait on an open or closed unmerged pull request", async () => {
    const open = await verifyGithubPrMerged(
      "solana-foundation/anchor#5137",
      "",
      false,
      fakeGithub({
        "/repos/solana-foundation/anchor/pulls/5137": {
          json: fixtureJson("pull-open.json"),
        },
      })
    );
    const closed = await verifyGithubPrMerged(
      "octocat/Hello-World#1",
      "",
      false,
      fakeGithub({
        "/repos/octocat/Hello-World/pulls/1": {
          json: fixtureJson("pull-closed.json"),
        },
      })
    );
    expect(open.kind).toBe("wait");
    expect(closed.kind).toBe("wait");
    expect(closed.evidence).toContain("is closed and not merged");
  });

  test("a binding check nominates the address from the body", async () => {
    const body = `Fixes the parser.\r\n\r\npact: ${NOMINEE}\r\n`;
    const github = fakeGithub({ [pullPath]: { json: { ...merged, body } } });
    const verdict = await verifyGithubPrMerged(
      "solana-foundation/anchor#5125",
      "",
      true,
      github
    );
    expect(verdict.kind).toBe("yes");
    expect(verdict.kind === "yes" && verdict.nominee).toBe(NOMINEE);
  });

  test("a binding check waits when the body names no address", async () => {
    const github = fakeGithub({ [pullPath]: { json: merged } });
    const verdict = await verifyGithubPrMerged(
      "solana-foundation/anchor#5125",
      "",
      true,
      github
    );
    expect(verdict.kind).toBe("wait");
  });

  test("nominee line rules", () => {
    expect(nomineeFromBody(`pact: ${NOMINEE}`)).toBe(NOMINEE);
    expect(nomineeFromBody(`  PACT:\t${NOMINEE}  `)).toBe(NOMINEE);
    expect(
      nomineeFromBody(
        `text\npact: ${NOMINEE}\npact: 8aBswR9arwLWu7YnG94Qswv7yfNfL6vahzrNqi898QbX`
      )
    ).toBe(NOMINEE);
    expect(nomineeFromBody(`see pact: ${NOMINEE}`)).toBeNull();
    expect(
      nomineeFromBody("pact: 0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl")
    ).toBeNull();
    expect(nomineeFromBody("pact: abc")).toBeNull();
    expect(nomineeFromBody(null)).toBeNull();
  });

  test.each([
    ["solana-foundation/anchor", ""],
    ["solana-foundation/anchor#0", ""],
    ["solana-foundation/anchor#12a", ""],
    ["https://github.com/a/b/pull/1", ""],
    ["a/b#1", "merged"],
  ])("no for the malformed check %s / %s", async (target, expectText) => {
    const github = fakeGithub({});
    const verdict = await verifyGithubPrMerged(
      target,
      expectText,
      false,
      github
    );
    expect(verdict.kind).toBe("no");
    expect(github.calls).toHaveLength(0);
  });
});

describe("GitHub client", () => {
  test("sends the etag back and reuses the cached body on 304", async () => {
    const seen: (string | null)[] = [];
    const fetchImpl = ((_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      seen.push(headers.get("if-none-match"));
      return Promise.resolve(
        seen.length === 1
          ? Response.json({ merged: true }, { headers: { etag: '"abc"' } })
          : new Response(null, { status: 304 })
      );
    }) as typeof fetch;
    const github = createGithub({ fetchImpl, token: "t" });
    expect(await github("/x")).toEqual({ json: { merged: true }, status: 200 });
    expect(await github("/x")).toEqual({ json: { merged: true }, status: 200 });
    expect(seen).toEqual([null, '"abc"']);
  });

  test("pauses until the rate limit resets", async () => {
    let calls = 0;
    let clock = 1_000_000;
    const fetchImpl = (() => {
      calls += 1;
      return Promise.resolve(
        new Response("{}", {
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(clock / 1000 + 60),
          },
          status: 403,
        })
      );
    }) as unknown as typeof fetch;
    const github = createGithub({ fetchImpl, now: () => clock });
    await expect(github("/x")).rejects.toBeInstanceOf(GithubRateLimited);
    await expect(github("/x")).rejects.toBeInstanceOf(GithubRateLimited);
    expect(calls).toBe(1);
    clock += 61_000;
    await expect(github("/x")).rejects.toBeInstanceOf(GithubRateLimited);
    expect(calls).toBe(2);
  });
});
