import {
  type Cluster,
  type DealState,
  evaluateDeal,
  explorerTx,
  findPactError,
  GATE_MIN_SIGNATURES,
  getExecuteInstruction,
  getGateConfirmInstruction,
  pinQuoteInstruction,
  SWITCHBOARD_DEVNET_QUEUE,
  sendInstructions,
} from "@pact/sdk";
import { describeCheckFact } from "@pact/sdk/facts";
import { gateFeedFor, isGateCheck, storeGateFeed } from "@pact/sdk/gate-feed";
import {
  address,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type RpcSubscriptions,
  type SignatureNotificationsApi,
  type SlotNotificationsApi,
  type SolanaRpcApi,
} from "@solana/kit";
import { reason } from "./verdict";

export type FetchQuote = (feedHash: string) => Promise<Instruction>;
export type StoreFeed = (target: string, expect: string) => Promise<unknown>;

export interface GatePlan {
  confirm: number[];
  rule: number | null;
}

const FINAL_ERRORS = new Set([
  "AlreadyVoted",
  "NotFunded",
  "NotAWitness",
  "CheckOutOfRange",
]);

export const gateChecksOf = async (deal: DealState) => {
  const flags = await Promise.all(deal.spec.checks.map(isGateCheck));
  return deal.spec.checks.flatMap((_, index) => (flags[index] ? [index] : []));
};

export const gatePlan = (
  deal: DealState,
  gates: readonly number[],
  nowSeconds: number
): GatePlan => {
  if (deal.status !== "funded" || gates.length === 0) {
    return { confirm: [], rule: null };
  }
  const confirm = gates.filter((index) => (deal.votes[index]?.yes ?? 0) < 1);
  const rule = evaluateDeal(deal, nowSeconds).executable.find((candidate) =>
    deal.spec.rules[candidate]?.when.some(
      (condition) =>
        condition.type === "attested" && gates.includes(condition.check)
    )
  );
  return { confirm, rule: rule ?? null };
};

const loadSwitchboard = async (input: SwitchboardInput) => {
  const [{ CrossbarClient, CrossbarNetwork }, onDemand, web3] =
    await Promise.all([
      import("@switchboard-xyz/common"),
      import("@switchboard-xyz/on-demand"),
      import("@solana/web3.js"),
    ]);
  const crossbar = new CrossbarClient(input.crossbarUrl, false);
  crossbar.setNetwork(CrossbarNetwork.SolanaDevnet);
  const program = await onDemand.AnchorUtils.loadProgramFromConnection(
    new web3.Connection(input.rpcUrl, "confirmed")
  );
  const queue = new onDemand.Queue(
    program,
    new web3.PublicKey(SWITCHBOARD_DEVNET_QUEUE)
  );
  const payer = new web3.PublicKey(input.payer);
  return (feedHash: string) =>
    queue.fetchManagedUpdateIxs(crossbar, [feedHash], {
      numSignatures: GATE_MIN_SIGNATURES,
      payer,
    } as never);
};

export interface SwitchboardInput {
  crossbarUrl: string;
  payer: string;
  rpcUrl: string;
}

export const createSwitchboardQuotes = (
  input: SwitchboardInput
): FetchQuote => {
  let loading: ReturnType<typeof loadSwitchboard> | null = null;
  return async (feedHash) => {
    loading ??= loadSwitchboard(input).catch((error: unknown) => {
      loading = null;
      throw error;
    });
    const [ed25519] = await (await loading)(feedHash);
    if (!ed25519) {
      throw new Error("the oracles returned no quote");
    }
    return pinQuoteInstruction(
      {
        data: Uint8Array.from(ed25519.data),
        programAddress: address(ed25519.programId.toBase58()),
      },
      0
    );
  };
};

export interface GateCrankContext {
  cluster: Cluster;
  fetchQuote: FetchQuote;
  log: (line: string) => void;
  now?: () => number;
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<
    SignatureNotificationsApi & SlotNotificationsApi
  >;
  signer: KeyPairSigner;
  storeFeed?: StoreFeed;
}

export interface CrankSummary {
  confirmations: string[];
  executions: string[];
  gates: number;
}

export const createGateCrank = (ctx: GateCrankContext) => {
  const now = ctx.now ?? Date.now;
  const storeFeed = ctx.storeFeed ?? storeGateFeed;
  const done = new Set<string>();
  const stored = new Set<string>();
  const lastWait = new Map<string, string>();
  const stamp = () => new Date(now()).toISOString();

  const send = (instructions: Instruction[]) =>
    sendInstructions({
      feePayer: ctx.signer,
      instructions,
      rpc: ctx.rpc,
      rpcSubscriptions: ctx.rpcSubscriptions,
    });

  const waitQuietly = (key: string, text: string) => {
    if (lastWait.get(key) !== text) {
      lastWait.set(key, text);
      ctx.log(`${stamp()} wait ${key} gate: ${text}`);
    }
  };

  const confirm = async (deal: DealState, index: number) => {
    const key = `deal=${deal.address} check=${index}`;
    const check = deal.spec.checks[index];
    if (!check || done.has(key)) {
      return null;
    }
    const { feedHash } = await gateFeedFor(check.target, check.expect);
    try {
      if (!stored.has(feedHash)) {
        await storeFeed(check.target, check.expect);
        stored.add(feedHash);
      }
    } catch (error) {
      waitQuietly(key, `job not stored: ${reason(error)}`);
      return null;
    }
    let quote: Instruction;
    try {
      quote = await ctx.fetchQuote(feedHash);
    } catch (error) {
      waitQuietly(key, `oracles do not see it yet (${reason(error)})`);
      return null;
    }
    try {
      const signature = await send([
        quote,
        await getGateConfirmInstruction({
          check: index,
          deal: address(deal.address),
          feedHash,
        }),
      ]);
      done.add(key);
      lastWait.delete(key);
      const link = explorerTx(signature, ctx.cluster);
      ctx.log(
        `${stamp()} yes  ${key} gate: ${GATE_MIN_SIGNATURES} oracles signed "${describeCheckFact(check.target, check.expect)}" confirm: ${link}`
      );
      return link;
    } catch (error) {
      const pactError = findPactError(error);
      if (pactError && FINAL_ERRORS.has(pactError.name)) {
        done.add(key);
        ctx.log(`${stamp()} skip ${key} gate: ${pactError.name}`);
        return null;
      }
      waitQuietly(key, `confirm not sent: ${pactError?.name ?? reason(error)}`);
      return null;
    }
  };

  const execute = async (deal: DealState, rule: number) => {
    const line = `${stamp()} exec deal=${deal.address} rule=${rule}`;
    try {
      const signature = await send([
        getExecuteInstruction({
          deal: address(deal.address),
          executor: ctx.signer,
          parties: deal.spec.parties,
          rule,
        }),
      ]);
      const link = explorerTx(signature, ctx.cluster);
      ctx.log(
        `${line} evidence: the oracle gate unlocked the rule tx: ${link}`
      );
      return link;
    } catch (error) {
      ctx.log(
        `${line} not executed: ${findPactError(error)?.name ?? reason(error)}`
      );
      return null;
    }
  };

  const crankDeal = async (
    deal: DealState,
    refresh: (deal: DealState) => Promise<DealState | null>
  ) => {
    const gates = await gateChecksOf(deal);
    const confirmations: string[] = [];
    for (const index of gatePlan(deal, gates, now() / 1000).confirm) {
      // biome-ignore lint/performance/noAwaitInLoops: one transaction at a time keeps RPC load low
      const link = await confirm(deal, index);
      if (link) {
        confirmations.push(link);
      }
    }
    const current = confirmations.length > 0 ? await refresh(deal) : deal;
    const rule = current
      ? gatePlan(current, gates, Math.floor(now() / 1000)).rule
      : null;
    const execution =
      current && rule !== null ? await execute(current, rule) : null;
    return { confirmations, execution, gates: gates.length };
  };

  const runOnce = async (
    deals: DealState[],
    refresh: (deal: DealState) => Promise<DealState | null>
  ): Promise<CrankSummary> => {
    const summary: CrankSummary = {
      confirmations: [],
      executions: [],
      gates: 0,
    };
    for (const deal of deals.filter((entry) => entry.status === "funded")) {
      // biome-ignore lint/performance/noAwaitInLoops: one deal at a time keeps RPC load low
      const result = await crankDeal(deal, refresh);
      summary.gates += result.gates;
      summary.confirmations.push(...result.confirmations);
      if (result.execution) {
        summary.executions.push(result.execution);
      }
    }
    return summary;
  };

  return { runOnce };
};
