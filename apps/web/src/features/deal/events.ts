import { PACT_IDL } from "@pact/sdk";
import {
  getAddressDecoder,
  getBase64Encoder,
  type ReadonlyUint8Array,
} from "@solana/kit";

export type DealEvent =
  | { amount: bigint; creator: string; kind: "created" }
  | { amount: bigint; funder: string; kind: "funded" }
  | { kind: "signaled"; party: number }
  | {
      check: number;
      kind: "attested";
      no: number;
      nominee: string | null;
      verdict: boolean;
      witness: string;
      yes: number;
    }
  | { amount: bigint; executor: string; kind: "executed"; rule: number }
  | { kind: "cancelled" }
  | { kind: "other"; name: string };

export interface LogEntry {
  blockTime: number | null;
  event: DealEvent | null;
  failed: boolean;
  signature: string;
  signer: string | null;
}

type IdlType = string | { option: IdlType };
type Fields = Record<string, unknown>;

interface Cursor {
  offset: number;
  view: DataView;
}

const EVENT_PREFIX = "Program data: ";
const CANCEL_LOG = "Program log: Instruction: Cancel";
const DISCRIMINATOR_SIZE = 8;
const PUBKEY_SIZE = 32;
const WORD = 8;

const addressDecoder = getAddressDecoder();

const readPrimitive = (type: string, cursor: Cursor): unknown => {
  const { view } = cursor;
  const at = cursor.offset;
  switch (type) {
    case "pubkey": {
      cursor.offset += PUBKEY_SIZE;
      return addressDecoder.decode(
        new Uint8Array(view.buffer, view.byteOffset + at, PUBKEY_SIZE)
      );
    }
    case "bool":
      cursor.offset += 1;
      return view.getUint8(at) === 1;
    case "u8":
      cursor.offset += 1;
      return view.getUint8(at);
    case "u16":
      cursor.offset += 2;
      return view.getUint16(at, true);
    case "u64":
      cursor.offset += WORD;
      return view.getBigUint64(at, true);
    case "i64":
      cursor.offset += WORD;
      return view.getBigInt64(at, true);
    default:
      throw new Error(`unsupported event field type ${type}`);
  }
};

const readValue = (type: IdlType, cursor: Cursor): unknown => {
  if (typeof type === "string") {
    return readPrimitive(type, cursor);
  }
  const present = cursor.view.getUint8(cursor.offset) === 1;
  cursor.offset += 1;
  return present ? readValue(type.option, cursor) : null;
};

const eventLayout = (name: string) => {
  const entry = PACT_IDL.types.find((type) => type.name === name);
  return (entry?.type.fields ?? []) as { name: string; type: IdlType }[];
};

const decodeFields = (name: string, data: ReadonlyUint8Array): Fields => {
  const cursor: Cursor = {
    offset: DISCRIMINATOR_SIZE,
    view: new DataView(data.buffer, data.byteOffset, data.byteLength),
  };
  const fields: Fields = {};
  for (const field of eventLayout(name)) {
    fields[field.name] = readValue(field.type, cursor);
  }
  return fields;
};

const toEvent = (name: string, fields: Fields): DealEvent => {
  switch (name) {
    case "DealCreated":
      return {
        amount: fields.amount as bigint,
        creator: fields.creator as string,
        kind: "created",
      };
    case "DealFunded":
      return {
        amount: fields.amount as bigint,
        funder: fields.funder as string,
        kind: "funded",
      };
    case "Signaled":
      return { kind: "signaled", party: fields.party as number };
    case "Attested":
      return {
        check: fields.check as number,
        kind: "attested",
        no: fields.no as number,
        nominee: (fields.nominee as string | null | undefined) ?? null,
        verdict: fields.verdict as boolean,
        witness: fields.witness as string,
        yes: fields.yes as number,
      };
    case "Executed":
      return {
        amount: fields.amount as bigint,
        executor: fields.executor as string,
        kind: "executed",
        rule: fields.rule as number,
      };
    default:
      return { kind: "other", name };
  }
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
    return name ? toEvent(name, decodeFields(name, data)) : null;
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
