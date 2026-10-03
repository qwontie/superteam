import {
  isSolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
} from "@solana/kit";
import idl from "./idl/pact.json" with { type: "json" };

export interface PactErrorInfo {
  code: number;
  message: string;
  name: string;
}

export const PACT_ERRORS: PactErrorInfo[] = idl.errors.map((entry) => ({
  code: entry.code,
  message: entry.msg,
  name: entry.name,
}));

export const pactErrorByCode = (code: number) =>
  PACT_ERRORS.find((entry) => entry.code === code) ?? null;

export const findPactError = (error: unknown): PactErrorInfo | null => {
  let current: unknown = error;
  while (current) {
    if (isSolanaError(current, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) {
      return pactErrorByCode(current.context.code);
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
};
