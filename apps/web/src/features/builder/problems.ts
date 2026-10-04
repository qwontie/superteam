import {
  type DealSpec,
  dealSpecProblems,
  LIMITS,
  validateDealSpec,
} from "@pact/sdk";
import { factError } from "@pact/sdk/facts";
import { isAddress } from "@solana/kit";
import { partyName } from "@/features/builder/describe";
import { factGap, factShape } from "@/features/builder/facts";
import { type Draft, draftToSpec } from "@/features/builder/model";

export interface Problem {
  anchor: string;
  key: string;
  text: string;
  todo: boolean;
}

export interface Validation {
  problems: Problem[];
  spec: DealSpec | null;
}

type Path = (string | number)[];

const TOKEN = /([a-z_]+)|\[(\d+)\]/gi;
const DUPLICATE = /^(\S*) appears more than once$/;
const SEPARATOR = ": ";

export const anchors = {
  amount: "amount",
  check: (id: string) => `check:${id}`,
  deal: "deal",
  party: (id: string) => `party:${id}`,
  rule: (id: string) => `rule:${id}`,
  title: "title",
};

const parsePath = (text: string): Path => {
  const path: Path = [];
  for (const match of text.matchAll(TOKEN)) {
    if (match[1]) {
      path.push(match[1]);
    } else if (match[2]) {
      path.push(Number(match[2]));
    }
  }
  return path;
};

const split = (problem: string) => {
  const cut = problem.indexOf(SEPARATOR);
  if (cut < 0) {
    return { message: problem, path: [] as Path };
  }
  return {
    message: problem.slice(cut + SEPARATOR.length),
    path: parsePath(problem.slice(0, cut)),
  };
};

interface Context {
  draft: Draft;
  spec: DealSpec;
  wallet: string | null;
}

type Found = { anchor: string; text: string; todo?: boolean } | null;

const addressProblem = (anchor: string, name: string, value: string): Found =>
  value === ""
    ? { anchor, text: `Add the wallet address of ${name}.`, todo: true }
    : {
        anchor,
        text: `The address of ${name} is not a Solana address. Paste it again.`,
      };

const partyProblem = (path: Path, message: string, ctx: Context): Found => {
  const [, index] = path;
  if (typeof index === "number") {
    const party = ctx.draft.parties[index];
    if (!party) {
      return null;
    }
    const name = partyName(ctx.draft, party.id);
    if (party.me) {
      return {
        anchor: anchors.party(party.id),
        text: `Connect your wallet: ${name} is you.`,
        todo: true,
      };
    }
    return addressProblem(anchors.party(party.id), name, party.address.trim());
  }
  const duplicate = DUPLICATE.exec(message)?.[1];
  if (duplicate === undefined || !isAddress(duplicate)) {
    return null;
  }
  const twins = ctx.draft.parties.filter(
    (_, position) => ctx.spec.parties[position] === duplicate
  );
  const last = twins.at(-1);
  if (!last) {
    return null;
  }
  return {
    anchor: anchors.party(last.id),
    text: `${twins.map((party) => partyName(ctx.draft, party.id)).join(" and ")} use the same wallet. Each party needs its own.`,
  };
};

const reviewerProblem = (
  path: Path,
  message: string,
  ctx: Context,
  anchor: string
): Found => {
  const [, checkAt, , position] = path;
  const check = ctx.draft.checks[checkAt as number];
  if (typeof position === "number") {
    const reviewer = check?.reviewers[position];
    if (!reviewer) {
      return null;
    }
    const name = reviewer.label.trim() || `Reviewer ${position + 1}`;
    return addressProblem(anchor, name, reviewer.address.trim());
  }
  const duplicate = DUPLICATE.exec(message)?.[1];
  if (duplicate !== undefined) {
    return isAddress(duplicate)
      ? { anchor, text: "The same wallet is listed twice among the reviewers." }
      : null;
  }
  return { anchor, text: "Add at least one reviewer.", todo: true };
};

const checkProblem = (path: Path, message: string, ctx: Context): Found => {
  const [, checkAt] = path;
  const check = ctx.draft.checks[checkAt as number];
  if (!check) {
    return null;
  }
  const anchor = anchors.check(check.id);
  switch (path[2]) {
    case "target":
      return check.target.trim() === ""
        ? {
            anchor,
            text:
              check.kind === "manual"
                ? `Say what the reviewers of check ${(checkAt as number) + 1} confirm.`
                : `Say what the nodes of check ${(checkAt as number) + 1} look at.`,
            todo: true,
          }
        : {
            anchor,
            text: `The statement is too long for the chain. Keep it under ${LIMITS.targetBytes} characters.`,
          };
    case "witnesses":
      return reviewerProblem(path, message, ctx, anchor);
    case "threshold":
      return { anchor, text: "Choose how many reviewers must agree." };
    case "binds":
      return {
        anchor,
        text: "This check names a winner, but that party is no longer an open slot.",
      };
    default:
      return { anchor, text: message };
  }
};

const payProblem = (
  path: Path,
  message: string,
  ctx: Context,
  ruleIndex: number
): Found => {
  const number = ruleIndex + 1;
  const rule = ctx.draft.rules[ruleIndex];
  if (!rule) {
    return null;
  }
  const anchor = anchors.rule(rule.id);
  const [, , , position] = path;
  if (typeof position !== "number") {
    return rule.pay.length === 0
      ? { anchor, text: `Choose who gets paid in rule ${number}.`, todo: true }
      : { anchor, text: `The shares in rule ${number} must add up to 100%.` };
  }
  const payout = rule.pay[position];
  if (payout && message.includes("open slot")) {
    return {
      anchor,
      text: `${partyName(ctx.draft, payout.party)} is not known yet. Rule ${number} can pay them only once the reviewers have named the winner: add that condition.`,
    };
  }
  return {
    anchor,
    text: `Rule ${number} pays a party that was removed. Choose who gets paid.`,
  };
};

const ruleProblem = (path: Path, message: string, ctx: Context): Found => {
  const [, index] = path;
  if (typeof index !== "number") {
    const exit = ctx.draft.rules.find((entry) => entry.exit);
    const anchor = exit ? anchors.rule(exit.id) : anchors.deal;
    return message.includes("not in the future")
      ? {
          anchor,
          text: "The exit time has already passed. Move it into the future.",
        }
      : {
          anchor,
          text: "The deal needs an exit: one rule made only of time, so the money can never get stuck.",
        };
  }
  const rule = ctx.draft.rules[index];
  if (!rule) {
    return null;
  }
  const anchor = anchors.rule(rule.id);
  if (path[2] === "pay") {
    return payProblem(path, message, ctx, index);
  }
  if (typeof path[3] === "number") {
    return {
      anchor,
      text: `A condition in rule ${index + 1} points to a party or check that was removed. Pick another or delete it.`,
    };
  }
  return {
    anchor,
    text: `Rule ${index + 1} has no condition. Drop a piece into it or remove the rule.`,
    todo: true,
  };
};

const explain = (problem: string, ctx: Context): Found => {
  const { message, path } = split(problem);
  switch (path[0]) {
    case "title":
      return ctx.draft.title.trim() === ""
        ? { anchor: anchors.title, text: "Give the deal a name.", todo: true }
        : {
            anchor: anchors.title,
            text: `The name is too long for the chain. Keep it under ${LIMITS.titleBytes} characters.`,
          };
    case "amount":
      return {
        anchor: anchors.amount,
        text: "Say how much SOL goes into the vault.",
        todo: true,
      };
    case "funder":
      return {
        anchor: anchors.party(ctx.draft.funder),
        text: "The party that funds the vault must be a named wallet, not an open slot.",
      };
    case "parties":
      return partyProblem(path, message, ctx);
    case "checks":
      return checkProblem(path, message, ctx);
    case "rules":
      return ruleProblem(path, message, ctx);
    default:
      return { anchor: anchors.deal, text: problem };
  }
};

const REPO_REF = /^[\w.-]+\/[\w.-]+@[\w./-]+$/;
const REPO_PR = /^[\w.-]+\/[\w.-]+#\d+$/;

const formatProblems = (draft: Draft): Found[] =>
  draft.checks.map((check, index) => {
    const anchor = anchors.check(check.id);
    const target = check.target.trim();
    const number = index + 1;
    if (check.kind === "manual") {
      return null;
    }
    if (target === "" && check.kind !== "http_contains") {
      return null;
    }
    if (check.kind === "http_contains") {
      if (factGap(factShape(check.target, check.expect))) {
        return {
          anchor,
          text: `Fill the empty slots of check ${number}.`,
          todo: true,
        };
      }
      const error = factError(target, check.expect.trim());
      return error ? { anchor, text: `Check ${number}: ${error}.` } : null;
    }
    if (check.kind === "github_checks") {
      return REPO_REF.test(target)
        ? null
        : {
            anchor,
            text: `Check ${number}: write the repository and commit as owner/repo@ref.`,
          };
    }
    return REPO_PR.test(target)
      ? null
      : {
          anchor,
          text: `Check ${number}: write the pull request as owner/repo#number.`,
        };
  });

export const validateDraft = (
  draft: Draft,
  wallet: string | null,
  now: number
): Validation => {
  const spec = draftToSpec(draft, wallet);
  const result = validateDealSpec(spec, now);
  const formats = formatProblems(draft);
  if (result.ok && formats.every((entry) => entry === null)) {
    return { problems: [], spec: result.spec };
  }
  const raw = result.ok
    ? []
    : [...result.problems, ...dealSpecProblems(spec, now)];
  const ctx = { draft, spec, wallet };
  const seen = new Set<string>();
  const problems: Problem[] = [];
  const all = [...raw.map((entry) => explain(entry, ctx)), ...formats];
  for (const found of all) {
    const key = found ? `${found.anchor}|${found.text}` : null;
    if (found && key && !seen.has(key)) {
      seen.add(key);
      problems.push({ ...found, key, todo: found.todo === true });
    }
  }
  return { problems, spec: null };
};

export const errorsAt = (problems: readonly Problem[], anchor: string) =>
  problems.filter((problem) => problem.anchor === anchor && !problem.todo);
