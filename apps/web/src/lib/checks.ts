import type { Check, DealSpec } from "@pact/sdk";
import {
  describeFact,
  type Fact,
  PRICE_PAIRS,
  parseFact,
} from "@pact/sdk/facts";
import { shortAddress } from "@/lib/format";

export type ConditionMark = "github" | "price" | "fact" | "vote";

export interface FactLink {
  href: string;
  text: string;
}

export interface CheckFact {
  automated: boolean;
  fact: Fact | null;
  href: string | null;
  links: FactLink[];
  linkText: string | null;
  mark: ConditionMark | null;
  method: string;
  statement: string;
  verb: { many: string; one: string };
}

const REPO_REF = /^([\w.-]+)\/([\w.-]+)@([\w./-]+)$/;
const REPO_PR = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const SHORT_SHA = 7;
const NODES = "Witness nodes check this on their own and vote";

const HOST_PREFIX = /^(www|api)\./;
const FACT_VERB = { many: "confirm it", one: "confirms it" };

export const ORACLE_LABEL = "Switchboard, 3 oracles";
export const ORACLE_METHOD =
  "Three Switchboard oracles fetch the page. Anyone can submit their signed answer";
export const ORACLE_FACT_METHOD =
  "Three Switchboard oracles read the source. Anyone can submit their signed answer";

const httpsOnly = (value: string) => {
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(HOST_PREFIX, "");
  } catch {
    return url;
  }
};

const sourceOf = (check: Check): Fact | null => {
  try {
    const fact = parseFact(check.target, check.expect);
    return fact.source.type === "page" ? null : fact;
  } catch {
    return null;
  }
};

const factLinks = (fact: Fact): FactLink[] => {
  const { source } = fact;
  if (source.type === "price") {
    return PRICE_PAIRS[source.pair].map((venue) => ({
      href: venue.url,
      text: hostOf(venue.url),
    }));
  }
  if (source.type === "wikidata") {
    return [
      {
        href: `https://www.wikidata.org/wiki/${source.entity}#${source.property}`,
        text: `wikidata.org/wiki/${source.entity}`,
      },
    ];
  }
  if (source.type === "json") {
    return [{ href: source.url, text: source.url }];
  }
  return [];
};

const sourceFact = (fact: Fact, label?: string): CheckFact => {
  const links = factLinks(fact);
  return {
    automated: true,
    fact,
    href: links[0]?.href ?? null,
    links,
    linkText: links[0]?.text ?? null,
    mark: fact.source.type === "price" ? "price" : "fact",
    method: NODES,
    statement: describeFact(fact, { label }),
    verb: FACT_VERB,
  };
};

const pageFact = (check: Check): CheckFact => ({
  automated: true,
  fact: null,
  href: httpsOnly(check.target),
  links: [],
  linkText: check.target,
  mark: null,
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
    fact: null,
    href: match ? `https://github.com/${owner}/${repo}/commits/${ref}` : null,
    links: [],
    linkText: match ? `${owner}/${repo}@${shown}` : check.target,
    mark: "github",
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
    fact: null,
    href: match ? `https://github.com/${owner}/${repo}/pull/${pull}` : null,
    links: [],
    linkText: check.target,
    mark: "github",
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
    fact: null,
    href: null,
    links: [],
    linkText: null,
    mark: "vote",
    method: "The people below vote by hand",
    statement: check.target,
    verb: binding
      ? { many: "name the winner", one: "names the winner" }
      : { many: "say yes", one: "says yes" },
  };
};

export const checkFact = (check: Check, label?: string): CheckFact => {
  switch (check.kind) {
    case "http_contains": {
      const fact = sourceOf(check);
      return fact ? sourceFact(fact, label) : pageFact(check);
    }
    case "github_checks":
      return checksFact(check);
    case "github_pr_merged":
      return mergedFact(check);
    default:
      return manualFact(check);
  }
};

export const witnessLabel = (
  check: Check | undefined,
  position: number,
  oracle = false
) => {
  if (oracle) {
    return ORACLE_LABEL;
  }
  return check && check.kind !== "manual"
    ? `Node ${position + 1}`
    : `Witness ${position + 1}`;
};

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
