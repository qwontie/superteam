// biome-ignore-all lint/performance/noBarrelFile: package entry point
import { type Address, address } from "@solana/kit";
import idl from "./idl/pact.json" with { type: "json" };

export {
  type ConditionResult,
  type DealEvaluation,
  evaluateCondition,
  evaluateDeal,
  evaluateRule,
  type RuleEvaluation,
} from "./evaluate";
export type { Pact } from "./idl/pact";
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
  type Payout,
  PayoutSchema,
  type Rule,
  RuleSchema,
} from "./spec";
export {
  type CheckVotes,
  type DealState,
  type DealStatus,
  type Vote,
  votesFromBitmaps,
} from "./state";
export {
  type FreelanceWithCheckInput,
  freelanceWithCheck,
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
export const PACT_PROGRAM_ID: Address = address(idl.address);
