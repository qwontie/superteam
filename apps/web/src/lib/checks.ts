import type { Check, DealSpec } from "@pact/sdk";
import { shortAddress } from "@/lib/format";

export interface CheckFact {
  automated: boolean;
  href: string | null;
  linkText: string | null;
  method: string;
  statement: string;
  verb: { many: string; one: string };
}

const REPO_REF = /^([\w.-]+)\/([\w.-]+)@([\w./-]+)$/;
const REPO_PR = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const SHORT_SHA = 7;
const NODES = "Witness nodes check this on their own and vote";

const httpsOnly = (value: string) => {
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

const pageFact = (check: Check): CheckFact => ({
  automated: true,
  href: httpsOnly(check.target),
  linkText: check.target,
  method: NODES,
  statement: `The page contains "${check.expect}"`,
  verb: {
    many: "see the text on the page",
    one: "sees the text on the page",
  },
});

const checksFact = (check: Check): CheckFact => {
  const match = REPO_REF.exec(check.target);
  const [, owner, repo, ref] = match ?? [];
  const shown =
    ref && FULL_SHA.test(ref) ? ref.slice(0, SHORT_SHA) : (ref ?? "");
  return {
    automated: true,
    href: match ? `https://github.com/${owner}/${repo}/commits/${ref}` : null,
    linkText: match ? `${owner}/${repo}@${shown}` : check.target,
    method: NODES,
    statement: "All GitHub checks are green",
    verb: { many: "see green checks", one: "sees green checks" },
  };
};

const mergedFact = (check: Check): CheckFact => {
  const match = REPO_PR.exec(check.target);
  const [, owner, repo, pull] = match ?? [];
  const binding = typeof check.binds === "number";
  return {
    automated: true,
    href: match ? `https://github.com/${owner}/${repo}/pull/${pull}` : null,
    linkText: check.target,
    method: binding
      ? `${NODES}. The winner is the address on the "pact:" line of the pull request`
      : NODES,
    statement: binding
      ? "The pull request is merged and names the winner"
      : "The pull request is merged",
    verb: binding
      ? {
          many: "see the merged PR and its winner",
          one: "sees the merged PR and its winner",
        }
      : { many: "see the PR merged", one: "sees the PR merged" },
  };
};

const manualFact = (check: Check): CheckFact => {
  const binding = typeof check.binds === "number";
  return {
    automated: false,
    href: null,
    linkText: null,
    method: "The people below vote by hand",
    statement: check.target,
    verb: binding
      ? { many: "name the winner", one: "names the winner" }
      : { many: "say yes", one: "says yes" },
  };
};

export const checkFact = (check: Check): CheckFact => {
  switch (check.kind) {
    case "http_contains":
      return pageFact(check);
    case "github_checks":
      return checksFact(check);
    case "github_pr_merged":
      return mergedFact(check);
    default:
      return manualFact(check);
  }
};

export const witnessLabel = (check: Check | undefined, position: number) =>
  check && check.kind !== "manual"
    ? `Node ${position + 1}`
    : `Witness ${position + 1}`;

export const actorName = (
  spec: DealSpec,
  labels: readonly string[],
  address: string
) => {
  const party = spec.parties.indexOf(address);
  if (party >= 0) {
    return `the ${labels[party] ?? "party"}`;
  }
  for (const check of spec.checks) {
    const position = check.witnesses.indexOf(address);
    if (position >= 0) {
      return `${witnessLabel(check, position)} (${shortAddress(address)})`;
    }
  }
  return shortAddress(address);
};
