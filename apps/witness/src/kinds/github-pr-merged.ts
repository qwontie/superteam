import { isAddress } from "@solana/kit";
import type { GithubGet } from "../github";
import { no, reason, type Verdict, wait, yes } from "../verdict";

const TARGET =
  /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})#([1-9][0-9]{0,9})$/;
const NOMINEE_LINE = /^[ \t]*pact:[ \t]*([1-9A-HJ-NP-Za-km-z]{32,44})[ \t]*$/im;

interface PullRequest {
  body: string | null;
  merge_commit_sha: string | null;
  merged: boolean;
  merged_at: string | null;
  number: number;
  state: string;
}

export const parsePullTarget = (target: string) => {
  const match = target.match(TARGET);
  if (!(match?.[1] && match[2] && match[3])) {
    return null;
  }
  return { number: Number(match[3]), owner: match[1], repo: match[2] };
};

export const nomineeFromBody = (body: string | null): string | null => {
  const candidate = body?.replace(/\r\n/g, "\n").match(NOMINEE_LINE)?.[1];
  return candidate && isAddress(candidate) ? candidate : null;
};

export const verifyGithubPrMerged = async (
  target: string,
  expect: string,
  binds: boolean,
  github: GithubGet
): Promise<Verdict> => {
  const parsed = parsePullTarget(target);
  if (!parsed) {
    return no(`target ${JSON.stringify(target)} is not owner/repo#number`);
  }
  if (expect !== "") {
    return no(`expect must be empty, got ${JSON.stringify(expect)}`);
  }
  const label = `${parsed.owner}/${parsed.repo}#${parsed.number}`;
  let response: Awaited<ReturnType<GithubGet>>;
  try {
    response = await github(
      `/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`
    );
  } catch (error) {
    return wait(`GitHub request failed: ${reason(error)}`);
  }
  if (response.status !== 200) {
    return wait(
      `GitHub answered ${response.status} for ${label} (missing or private)`
    );
  }
  const pull = response.json as PullRequest;
  if (!(pull.merged && pull.merged_at)) {
    return wait(`${label} is ${pull.state} and not merged`);
  }
  const merged = `${label} merged at ${pull.merged_at} as ${pull.merge_commit_sha?.slice(0, 12) ?? "unknown"}`;
  if (!binds) {
    return yes(merged);
  }
  const nominee = nomineeFromBody(pull.body);
  if (!nominee) {
    return wait(`${merged}, but the body has no "pact: <address>" line`);
  }
  return yes(`${merged}, nominee ${nominee} from the body`, nominee);
};
