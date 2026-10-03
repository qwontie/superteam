import type { GithubGet } from "../github";
import { no, reason, type Verdict, wait, yes } from "../verdict";

const TARGET =
  /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})@([A-Za-z0-9._/-]{1,100})$/;
const PASSING = new Set(["success", "neutral", "skipped"]);
const PER_PAGE = 100;
const MAX_PAGES = 10;

interface CheckRun {
  conclusion: string | null;
  head_sha: string;
  name: string;
  status: string;
}

interface CheckRunsPage {
  check_runs: CheckRun[];
  total_count: number;
}

export const parseRepoRef = (target: string) => {
  const match = target.match(TARGET);
  if (!(match?.[1] && match[2] && match[3]) || match[3].includes("..")) {
    return null;
  }
  return { owner: match[1], ref: match[3], repo: match[2] };
};

const fetchRuns = async (github: GithubGet, path: string) => {
  const runs: CheckRun[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: pages are read until total_count is reached
    const response = await github(
      `${path}?per_page=${PER_PAGE}&filter=latest&page=${page}`
    );
    if (response.status !== 200) {
      return { runs, status: response.status };
    }
    const body = response.json as CheckRunsPage;
    runs.push(...body.check_runs);
    if (runs.length >= body.total_count || body.check_runs.length === 0) {
      return { runs, status: 200, total: body.total_count };
    }
  }
  return { capped: true, runs, status: 200, total: runs.length };
};

const tally = (runs: CheckRun[]) => {
  const counts = new Map<string, number>();
  for (const run of runs) {
    const key = run.conclusion ?? run.status;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key} ${count}`)
    .join(", ");
};

export const verifyGithubChecks = async (
  target: string,
  expect: string,
  github: GithubGet
): Promise<Verdict> => {
  const parsed = parseRepoRef(target);
  if (!parsed) {
    return no(`target ${JSON.stringify(target)} is not owner/repo@ref`);
  }
  if (expect !== "success") {
    return no(`expect must be "success", got ${JSON.stringify(expect)}`);
  }
  const label = `${parsed.owner}/${parsed.repo}@${parsed.ref}`;
  let result: Awaited<ReturnType<typeof fetchRuns>>;
  try {
    result = await fetchRuns(
      github,
      `/repos/${parsed.owner}/${parsed.repo}/commits/${encodeURIComponent(parsed.ref)}/check-runs`
    );
  } catch (error) {
    return wait(`GitHub request failed: ${reason(error)}`);
  }
  if (result.status !== 200) {
    return wait(
      `GitHub answered ${result.status} for ${label} (missing, private or not pushed yet)`
    );
  }
  if ("capped" in result) {
    return wait(
      `${label} has more than ${MAX_PAGES * PER_PAGE} check runs, not judged`
    );
  }
  const { runs } = result;
  const sha = (runs[0]?.head_sha ?? "unknown").slice(0, 12);
  const summary = `${runs.length} check runs on ${label} (commit ${sha}): ${tally(runs)}`;
  if (runs.length === 0) {
    return wait(`no check runs on ${label} yet`);
  }
  if (runs.some((run) => run.status !== "completed")) {
    return wait(`still running: ${summary}`);
  }
  const failing = runs.filter((run) => !PASSING.has(run.conclusion ?? ""));
  if (failing.length > 0) {
    const names = failing
      .map((run) => run.name)
      .sort()
      .slice(0, 3)
      .join(", ");
    return wait(`not passing (${names}): ${summary}`);
  }
  if (!runs.some((run) => run.conclusion === "success")) {
    return wait(`no run concluded success: ${summary}`);
  }
  return yes(`all passed: ${summary}`);
};
