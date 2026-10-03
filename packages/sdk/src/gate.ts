import {
  type AccountMeta,
  AccountRole,
  type Address,
  address,
  getProgramDerivedAddress,
  getU8Encoder,
  type Instruction,
} from "@solana/kit";
import { concat, PACT_PROGRAM_ID } from "./client";

export const PACT_GATE_PROGRAM_ID = address(
  "CYb16ChX7J5LPB6nv8HtPVmLE72cjhgHpKCxoujrgUmn"
);
export const SWITCHBOARD_DEVNET_QUEUE = address(
  "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7"
);
export const GATE_MIN_SIGNATURES = 3;
export const GATE_MAX_AGE_SLOTS = 150;

const GATE_SEED = "gate";
const CONFIRM_DISCRIMINATOR = Uint8Array.from([
  174, 1, 15, 213, 3, 190, 131, 0,
]);
const SLOT_HASHES = address("SysvarS1otHashes111111111111111111111111111");
const INSTRUCTIONS = address("Sysvar1nstructions1111111111111111111111111");
const ED25519_PROGRAM_ID = address(
  "Ed25519SigVerify111111111111111111111111111"
);
const FEED_HASH = /^(0x)?[0-9a-f]{64}$/i;
const HEX_PREFIX = /^0x/i;
const SIGNATURE_RECORD_BYTES = 14;

export const feedHashBytes = (feedHash: string) => {
  if (!FEED_HASH.test(feedHash)) {
    throw new Error(`feed hash must be 32 bytes of hex, got ${feedHash}`);
  }
  const hex = feedHash.replace(HEX_PREFIX, "");
  return Uint8Array.from({ length: 32 }, (_, byte) =>
    Number.parseInt(hex.slice(byte * 2, byte * 2 + 2), 16)
  );
};

export const findGateAddress = async (feedHash: string) => {
  const [gate] = await getProgramDerivedAddress({
    programAddress: PACT_GATE_PROGRAM_ID,
    seeds: [GATE_SEED, feedHashBytes(feedHash)],
  });
  return gate;
};

const readonly = (account: Address): AccountMeta => ({
  address: account,
  role: AccountRole.READONLY,
});

export const getGateConfirmInstruction = async (input: {
  feedHash: string;
  deal: Address;
  check: number;
}): Promise<Instruction> => ({
  accounts: [
    readonly(await findGateAddress(input.feedHash)),
    { address: input.deal, role: AccountRole.WRITABLE },
    readonly(SWITCHBOARD_DEVNET_QUEUE),
    readonly(SLOT_HASHES),
    readonly(INSTRUCTIONS),
    readonly(PACT_PROGRAM_ID),
  ],
  data: concat(
    CONFIRM_DISCRIMINATOR,
    feedHashBytes(input.feedHash),
    getU8Encoder().encode(input.check)
  ),
  programAddress: PACT_GATE_PROGRAM_ID,
});

export const pinQuoteInstruction = (
  quote: Instruction,
  index: number
): Instruction => {
  if (quote.programAddress !== ED25519_PROGRAM_ID || !quote.data) {
    throw new Error("the quote must be an Ed25519 instruction");
  }
  const data = Uint8Array.from(quote.data);
  const view = new DataView(data.buffer);
  const count = data[0] ?? 0;
  for (let record = 0; record < count; record += 1) {
    const offset = 2 + record * SIGNATURE_RECORD_BYTES;
    view.setUint16(offset + 2, index, true);
    view.setUint16(offset + 6, index, true);
    view.setUint16(offset + 12, index, true);
  }
  return { ...quote, data };
};
