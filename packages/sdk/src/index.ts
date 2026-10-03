// biome-ignore-all lint/performance/noBarrelFile: package entry point
import idl from "./idl/pact.json" with { type: "json" };

export {
  decodeDeal,
  fetchAllDeals,
  fetchDeal,
  findDealAddress,
  getAttestInstruction,
  getCancelInstruction,
  getCreateDealInstruction,
  getExecuteInstruction,
  getFundInstruction,
  getSignalInstruction,
  newDealId,
  PACT_PROGRAM_ID,
} from "./client";
export { type CreateDealArgs, type DealAccount, dealCodec } from "./codecs";
export { accountToSpec, accountToState, specToCreateArgs } from "./convert";
export {
  findPactError,
  PACT_ERRORS,
  type PactErrorInfo,
  pactErrorByCode,
} from "./errors";
export {
  type ConditionResult,
  type DealEvaluation,
  evaluateCondition,
  evaluateDeal,
  evaluateRule,
  type RuleEvaluation,
} from "./evaluate";
export { type Cluster, explorerAddress, explorerTx } from "./explorer";
export type { Pact } from "./idl/pact";
export { DEAL_ACCOUNT_SIZE } from "./layout";
export { type SendInput, sendInstructions } from "./send";
export {
  CHECK_KINDS,
  type Check,
  type CheckKind,
  CheckSchema,
  type Condition,
  ConditionSchema,
  type DealSpec,
  DealSpecSchema,
  dealSpecJsonSchema,
  LIMITS,
  OPEN_SLOT,
  type Payout,
  PayoutSchema,
  type Rule,
  RuleSchema,
} from "./spec";
export {
  type CheckVotes,
  type DealState,
  type DealStatus,
  leadingNominee,
  type Vote,
  votesFromBitmaps,
} from "./state";
export {
  type BountyInput,
  bounty,
  type CheckInput,
  freelanceWithCheck,
  type GigInput,
  gig,
  majority,
  type SilenceIsConsentInput,
  silenceIsConsent,
} from "./templates";
export { lamportsToSol, solToLamports } from "./units";
export {
  dealSpecProblems,
  exitTime,
  nowSeconds,
  type ValidationResult,
  validateDealSpec,
} from "./validate";

export const PACT_IDL = idl;
