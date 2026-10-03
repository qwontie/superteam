import { PACT_IDL } from "@pact/sdk";
import {
  getAddressCodec,
  getBase64Encoder,
  getBooleanCodec,
  getI64Codec,
  getStructCodec,
  getU8Codec,
  getU64Codec,
  type ReadonlyUint8Array,
} from "@solana/kit";

export type DealEvent =
  | { amount: bigint; creator: string; kind: "created" }
  | { amount: bigint; funder: string; kind: "funded" }
  | { kind: "signaled"; party: number; ts: number }
  | {
      check: number;
      kind: "attested";
      no: number;
      verdict: boolean;
      witness: string;
      yes: number;
    }
  | { amount: bigint; executor: string; kind: "executed"; rule: number }
  | { kind: "cancelled" };

export interface LogEntry {
  blockTime: number | null;
  event: DealEvent | null;
  failed: boolean;
  signature: string;
  signer: string | null;
}

const EVENT_PREFIX = "Program data: ";
const CANCEL_LOG = "Program log: Instruction: Cancel";
const DISCRIMINATOR_SIZE = 8;

const address = getAddressCodec();
const u8 = getU8Codec();
const u64 = getU64Codec();

const createdCodec = getStructCodec([
  ["deal", address],
  ["creator", address],
  ["dealId", u64],
  ["amount", u64],
]);
const fundedCodec = getStructCodec([
  ["deal", address],
  ["funder", address],
  ["amount", u64],
]);
const signaledCodec = getStructCodec([
  ["deal", address],
  ["party", u8],
  ["ts", getI64Codec()],
]);
const attestedCodec = getStructCodec([
  ["deal", address],
  ["check", u8],
  ["witness", address],
  ["verdict", getBooleanCodec()],
  ["yes", u8],
  ["no", u8],
]);
const executedCodec = getStructCodec([
  ["deal", address],
  ["rule", u8],
  ["executor", address],
  ["amount", u64],
]);

const DECODERS: Record<string, (data: ReadonlyUint8Array) => DealEvent> = {
  Attested: (data) => {
    const event = attestedCodec.decode(data, DISCRIMINATOR_SIZE);
    return {
      check: event.check,
      kind: "attested",
      no: event.no,
      verdict: event.verdict,
      witness: event.witness,
      yes: event.yes,
    };
  },
  DealCreated: (data) => {
    const event = createdCodec.decode(data, DISCRIMINATOR_SIZE);
    return { amount: event.amount, creator: event.creator, kind: "created" };
  },
  DealFunded: (data) => {
    const event = fundedCodec.decode(data, DISCRIMINATOR_SIZE);
    return { amount: event.amount, funder: event.funder, kind: "funded" };
  },
  Executed: (data) => {
    const event = executedCodec.decode(data, DISCRIMINATOR_SIZE);
    return {
      amount: event.amount,
      executor: event.executor,
      kind: "executed",
      rule: event.rule,
    };
  },
  Signaled: (data) => {
    const event = signaledCodec.decode(data, DISCRIMINATOR_SIZE);
    return { kind: "signaled", party: event.party, ts: Number(event.ts) };
  },
};

const eventName = (data: ReadonlyUint8Array) =>
  PACT_IDL.events.find((entry) =>
    entry.discriminator.every((byte, position) => data[position] === byte)
  )?.name ?? null;

const decodeLine = (line: string): DealEvent | null => {
  if (!line.startsWith(EVENT_PREFIX)) {
    return null;
  }
  try {
    const data = getBase64Encoder().encode(line.slice(EVENT_PREFIX.length));
    const name = eventName(data);
    const decode = name ? DECODERS[name] : undefined;
    return decode ? decode(data) : null;
  } catch {
    return null;
  }
};

export const eventFromLogs = (logs: readonly string[]): DealEvent | null => {
  for (const line of logs) {
    const event = decodeLine(line);
    if (event) {
      return event;
    }
  }
  return logs.includes(CANCEL_LOG) ? { kind: "cancelled" } : null;
};
