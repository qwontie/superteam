import {
  type Check,
  type Cluster,
  type DealState,
  evaluateDeal,
  explorerTx,
  fetchAllDeals,
  fetchDeal,
  findPactError,
  getAttestInstruction,
  getExecuteInstruction,
  OPEN_SLOT,
  sendInstructions,
} from "@pact/sdk";
import {
  address,
  type KeyPairSigner,
  type Rpc,
  type RpcSubscriptions,
  type SignatureNotificationsApi,
  type SlotNotificationsApi,
  type SolanaRpcApi,
} from "@solana/kit";
import type { GithubGet } from "./github";
import type { FetchPolicy, PageFetcher } from "./guarded-fetch";
import { verifyGithubChecks } from "./kinds/github-checks";
import { verifyGithubPrMerged } from "./kinds/github-pr-merged";
import { verifyHttpContains } from "./kinds/http-contains";
import { reason, type Verdict, wait } from "./verdict";

export type Verifier = (check: Check) => Promise<Verdict>;

export interface VerifierDeps {
  fetchPage: PageFetcher;
  github: GithubGet;
  policy: FetchPolicy;
}

export const createVerifiers = (
  deps: VerifierDeps
): Record<string, Verifier> => ({
  github_checks: (check) =>
    verifyGithubChecks(check.target, check.expect, deps.github),
  github_pr_merged: (check) =>
    verifyGithubPrMerged(
      check.target,
      check.expect,
      check.binds !== null && check.binds !== undefined,
      deps.github
    ),
  http_contains: (check) =>
    verifyHttpContains(check.target, check.expect, deps.fetchPage, deps.policy),
});

export interface PendingCheck {
  check: Check;
  deal: DealState;
  index: number;
  position: number;
}

const isBinding = (check: Check) =>
  check.binds !== null && check.binds !== undefined;

export const pendingChecks = (
  deals: DealState[],
  me: string,
  kinds: ReadonlySet<string>
): PendingCheck[] =>
  deals
    .filter((deal) => deal.status === "funded")
    .flatMap((deal) =>
      deal.spec.checks.flatMap((check, index) => {
        const position = check.witnesses.indexOf(me);
        const votes = deal.votes[index];
        if (!(kinds.has(check.kind) && votes) || position < 0) {
          return [];
        }
        if (votes.byWitness[position] !== null) {
          return [];
        }
        if (isBinding(check)) {
          return deal.spec.parties[check.binds ?? 0] === null
            ? [{ check, deal, index, position }]
            : [];
        }
        return votes.yes >= check.threshold
          ? []
          : [{ check, deal, index, position }];
      })
    );

const nomineeProblem = (deal: DealState, nominee: string) => {
  if (nominee === OPEN_SLOT) {
    return "nominee is the empty key";
  }
  if (deal.spec.parties.includes(nominee)) {
    return `nominee ${nominee} is already a party of the deal`;
  }
  return null;
};

export const executableRule = (
  deal: DealState,
  me: string,
  kinds: ReadonlySet<string>,
  nowSeconds: number
) => {
  if (deal.status !== "funded") {
    return null;
  }
  const mine = new Set(
    deal.spec.checks.flatMap((check, index) =>
      kinds.has(check.kind) && check.witnesses.includes(me) ? [index] : []
    )
  );
  if (mine.size === 0) {
    return null;
  }
  const rule = evaluateDeal(deal, nowSeconds).executable.find((candidate) =>
    deal.spec.rules[candidate]?.when.some(
      (condition) => condition.type === "attested" && mine.has(condition.check)
    )
  );
  return rule ?? null;
};

export interface NodeContext {
  autoExecute: boolean;
  cluster: Cluster;
  githubIntervalMs: number;
  log: (line: string) => void;
  now?: () => number;
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<
    SignatureNotificationsApi & SlotNotificationsApi
  >;
  signer: KeyPairSigner;
  verifiers: Record<string, Verifier>;
}

export interface PassSummary {
  deals: number;
  executions: string[];
  pending: number;
  votes: string[];
}

const FINAL_ERRORS = new Set([
  "AlreadyVoted",
  "AlreadyBound",
  "NotFunded",
  "NotAWitness",
  "CheckOutOfRange",
]);

export const createNode = (ctx: NodeContext) => {
  const now = ctx.now ?? Date.now;
  const me = ctx.signer.address;
  const kinds = new Set(Object.keys(ctx.verifiers));
  const done = new Set<string>();
  const lastWait = new Map<string, string>();
  const cache = new Map<string, { at: number; verdict: Verdict }>();

  const verify = async (check: Check) => {
    const key = JSON.stringify([
      check.kind,
      check.target,
      check.expect,
      isBinding(check),
    ]);
    const cached = cache.get(key);
    const ttl = check.kind.startsWith("github") ? ctx.githubIntervalMs : 0;
    if (cached && now() - cached.at < ttl) {
      return cached.verdict;
    }
    const verifier = ctx.verifiers[check.kind];
    const verdict = verifier
      ? await verifier(check).catch((error: unknown) =>
          wait(`verifier crashed: ${reason(error)}`)
        )
      : wait(`no verifier for ${check.kind}`);
    cache.set(key, { at: now(), verdict });
    return verdict;
  };

  const line = (
    pending: PendingCheck,
    verdict: string,
    evidence: string,
    tail = ""
  ) =>
    `${new Date(now()).toISOString()} ${verdict.padEnd(4)} deal=${pending.deal.address} check=${pending.index} ${pending.check.kind} target=${JSON.stringify(pending.check.target)} evidence: ${evidence}${tail}`;

  const vote = async (pending: PendingCheck, verdict: Verdict) => {
    const key = `${pending.deal.address}:${pending.index}`;
    const fresh = await fetchDeal(ctx.rpc, address(pending.deal.address));
    if (
      !fresh ||
      pendingChecks([fresh], me, kinds).every(
        (entry) => entry.index !== pending.index
      )
    ) {
      done.add(key);
      ctx.log(
        line(pending, "skip", "deal changed since the scan, no vote needed")
      );
      return null;
    }
    const nominee = verdict.kind === "yes" ? (verdict.nominee ?? null) : null;
    try {
      const signature = await sendInstructions({
        feePayer: ctx.signer,
        instructions: [
          getAttestInstruction({
            check: pending.index,
            deal: address(pending.deal.address),
            nominee,
            verdict: verdict.kind === "yes",
            witness: ctx.signer,
          }),
        ],
        rpc: ctx.rpc,
        rpcSubscriptions: ctx.rpcSubscriptions,
      });
      done.add(key);
      const link = explorerTx(signature, ctx.cluster);
      ctx.log(line(pending, verdict.kind, verdict.evidence, ` vote: ${link}`));
      return link;
    } catch (error) {
      const pactError = findPactError(error);
      if (pactError && FINAL_ERRORS.has(pactError.name)) {
        done.add(key);
        ctx.log(
          line(pending, "skip", `program refused the vote: ${pactError.name}`)
        );
        return null;
      }
      ctx.log(
        line(
          pending,
          "fail",
          `${verdict.kind} vote not sent: ${pactError?.name ?? reason(error)}`
        )
      );
      return null;
    }
  };

  const decide = async (pending: PendingCheck) => {
    const key = `${pending.deal.address}:${pending.index}`;
    let verdict = await verify(pending.check);
    if (verdict.kind === "yes" && isBinding(pending.check)) {
      const problem = verdict.nominee
        ? nomineeProblem(pending.deal, verdict.nominee)
        : "binding check needs a nominee, this kind has no source for one";
      if (problem) {
        verdict = wait(problem);
      }
    }
    if (verdict.kind === "wait") {
      if (lastWait.get(key) !== verdict.evidence) {
        lastWait.set(key, verdict.evidence);
        ctx.log(line(pending, "wait", verdict.evidence));
      }
      return null;
    }
    lastWait.delete(key);
    return vote(pending, verdict);
  };

  const execute = async (deal: DealState, rule: number) => {
    const stamp = `${new Date(now()).toISOString()} exec deal=${deal.address} rule=${rule}`;
    try {
      const signature = await sendInstructions({
        feePayer: ctx.signer,
        instructions: [
          getExecuteInstruction({
            deal: address(deal.address),
            executor: ctx.signer,
            parties: deal.spec.parties,
            rule,
          }),
        ],
        rpc: ctx.rpc,
        rpcSubscriptions: ctx.rpcSubscriptions,
      });
      const link = explorerTx(signature, ctx.cluster);
      ctx.log(
        `${stamp} evidence: every condition of the rule holds, payout sent tx: ${link}`
      );
      return link;
    } catch (error) {
      const pactError = findPactError(error);
      ctx.log(`${stamp} not executed: ${pactError?.name ?? reason(error)}`);
      return null;
    }
  };

  const executeReady = async (deals: DealState[]) => {
    const links: string[] = [];
    for (const deal of deals) {
      const rule = executableRule(deal, me, kinds, Math.floor(now() / 1000));
      if (rule !== null) {
        // biome-ignore lint/performance/noAwaitInLoops: one transaction at a time keeps RPC load low
        const link = await execute(deal, rule);
        if (link) {
          links.push(link);
        }
      }
    }
    return links;
  };

  const runOnce = async (): Promise<PassSummary> => {
    const deals = await fetchAllDeals(ctx.rpc);
    const pending = pendingChecks(deals, me, kinds).filter(
      (entry) => !done.has(`${entry.deal.address}:${entry.index}`)
    );
    const votes: string[] = [];
    const touched = new Set<string>();
    for (const entry of pending) {
      // biome-ignore lint/performance/noAwaitInLoops: one vote at a time keeps RPC load low
      const link = await decide(entry);
      if (link) {
        votes.push(link);
        touched.add(entry.deal.address);
      }
    }
    if (!ctx.autoExecute) {
      return {
        deals: deals.length,
        executions: [],
        pending: pending.length,
        votes,
      };
    }
    const fresh = await Promise.all(
      deals.map((deal) =>
        touched.has(deal.address)
          ? fetchDeal(ctx.rpc, address(deal.address))
          : Promise.resolve(deal)
      )
    );
    const executions = await executeReady(
      fresh.filter((deal): deal is DealState => deal !== null)
    );
    return { deals: deals.length, executions, pending: pending.length, votes };
  };

  return { runOnce };
};
