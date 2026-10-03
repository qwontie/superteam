import { isAddress } from "@solana/kit";
import { z } from "zod";

export const LIMITS = {
  expectBytes: 64,
  maxChecks: 2,
  maxConditions: 4,
  maxParties: 4,
  maxPayouts: 4,
  maxRules: 6,
  maxWitnesses: 5,
  minConditions: 1,
  minParties: 2,
  minPayouts: 1,
  minRules: 1,
  minWitnesses: 1,
  targetBytes: 128,
  titleBytes: 48,
  totalBps: 10_000,
} as const;

export const CHECK_KINDS = [
  "manual",
  "http_contains",
  "github_checks",
] as const;

const U64_MAX = 18_446_744_073_709_551_615n;

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

const maxBytes = (limit: number) =>
  z
    .string()
    .refine(
      (value) => utf8Bytes(value) <= limit,
      `must be at most ${limit} bytes in UTF-8`
    );

const pubkey = z
  .string()
  .refine(
    (value): boolean => isAddress(value),
    "must be a base58 Solana address"
  );

const index = z.number().int().min(0).max(255);

const lamports = z
  .string()
  .regex(
    /^[1-9][0-9]*$/,
    "must be a positive whole number of lamports as a decimal string"
  )
  .refine((value) => BigInt(value) <= U64_MAX, "must fit in u64");

export const ConditionSchema = z.discriminatedUnion("type", [
  z.object({
    ts: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    type: z.literal("after"),
  }),
  z.object({ party: index, type: z.literal("signed") }),
  z.object({ party: index, type: z.literal("unsigned") }),
  z.object({ check: index, type: z.literal("attested") }),
]);

export const PayoutSchema = z.object({
  bps: z.number().int().min(0).max(LIMITS.totalBps),
  party: index,
});

export const CheckSchema = z.object({
  expect: maxBytes(LIMITS.expectBytes),
  kind: z.enum(CHECK_KINDS),
  target: maxBytes(LIMITS.targetBytes).min(1, "must not be empty"),
  threshold: index,
  witnesses: z.array(pubkey).min(LIMITS.minWitnesses).max(LIMITS.maxWitnesses),
});

export const RuleSchema = z.object({
  pay: z.array(PayoutSchema).min(LIMITS.minPayouts).max(LIMITS.maxPayouts),
  when: z
    .array(ConditionSchema)
    .min(LIMITS.minConditions)
    .max(LIMITS.maxConditions),
});

export const DealSpecSchema = z.object({
  amount: lamports,
  checks: z.array(CheckSchema).max(LIMITS.maxChecks),
  funder: index,
  parties: z.array(pubkey).min(LIMITS.minParties).max(LIMITS.maxParties),
  rules: z.array(RuleSchema).min(LIMITS.minRules).max(LIMITS.maxRules),
  title: maxBytes(LIMITS.titleBytes).min(1, "must not be empty"),
});

export type Condition = z.infer<typeof ConditionSchema>;
export type Payout = z.infer<typeof PayoutSchema>;
export type Check = z.infer<typeof CheckSchema>;
export type CheckKind = Check["kind"];
export type Rule = z.infer<typeof RuleSchema>;
export type DealSpec = z.infer<typeof DealSpecSchema>;

export const dealSpecJsonSchema = () =>
  z.toJSONSchema(DealSpecSchema, { io: "input" });
