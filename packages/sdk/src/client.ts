import {
  type AccountMeta,
  AccountRole,
  type Address,
  address,
  type Base64EncodedBytes,
  fetchEncodedAccount,
  type GetAccountInfoApi,
  type GetProgramAccountsApi,
  getAddressEncoder,
  getBase64Encoder,
  getProgramDerivedAddress,
  getU64Encoder,
  type Instruction,
  type ReadonlyUint8Array,
  type Rpc,
  type TransactionSigner,
} from "@solana/kit";
import {
  attestArgsCodec,
  createDealArgsCodec,
  dealCodec,
  executeArgsCodec,
} from "./codecs";
import { accountToState, specToCreateArgs } from "./convert";
import idl from "./idl/pact.json" with { type: "json" };
import { DEAL_ACCOUNT_SIZE } from "./layout";
import { type DealSpec, OPEN_SLOT } from "./spec";
import type { DealState } from "./state";

export const PACT_PROGRAM_ID: Address = address(idl.address);
const SYSTEM_PROGRAM_ID = address("11111111111111111111111111111111");
const DEAL_SEED = "deal";

type InstructionName =
  | "create_deal"
  | "fund"
  | "signal"
  | "attest"
  | "execute"
  | "cancel";

const instructionDiscriminator = (name: InstructionName) => {
  const instruction = idl.instructions.find((entry) => entry.name === name);
  if (!instruction) {
    throw new Error(`instruction ${name} is missing from the IDL`);
  }
  return Uint8Array.from(instruction.discriminator);
};

const DEAL_DISCRIMINATOR = Uint8Array.from(
  idl.accounts.find((entry) => entry.name === "Deal")?.discriminator ?? []
);

const concat = (...parts: ReadonlyUint8Array[]) => {
  const bytes = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
};

const signerMeta = (signer: TransactionSigner, isWritable: boolean) => ({
  address: signer.address,
  role: isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER,
  signer,
});

const writable = (account: Address): AccountMeta => ({
  address: account,
  role: AccountRole.WRITABLE,
});

const OPEN_SLOT_META: AccountMeta = {
  address: address(OPEN_SLOT),
  role: AccountRole.READONLY,
};

const SYSTEM_PROGRAM_META: AccountMeta = {
  address: SYSTEM_PROGRAM_ID,
  role: AccountRole.READONLY,
};

export const findDealAddress = async (creator: Address, dealId: bigint) => {
  const [dealAddress] = await getProgramDerivedAddress({
    programAddress: PACT_PROGRAM_ID,
    seeds: [
      DEAL_SEED,
      getAddressEncoder().encode(creator),
      getU64Encoder().encode(dealId),
    ],
  });
  return dealAddress;
};

export const newDealId = () => BigInt(Date.now());

export const getCreateDealInstruction = async (input: {
  creator: TransactionSigner;
  dealId: bigint;
  spec: DealSpec;
}): Promise<Instruction & { deal: Address }> => {
  const deal = await findDealAddress(input.creator.address, input.dealId);
  return {
    accounts: [
      signerMeta(input.creator, true),
      writable(deal),
      SYSTEM_PROGRAM_META,
    ],
    data: concat(
      instructionDiscriminator("create_deal"),
      createDealArgsCodec.encode(specToCreateArgs(input.spec, input.dealId))
    ),
    deal,
    programAddress: PACT_PROGRAM_ID,
  };
};

export const getFundInstruction = (input: {
  funder: TransactionSigner;
  deal: Address;
}): Instruction => ({
  accounts: [
    signerMeta(input.funder, true),
    writable(input.deal),
    SYSTEM_PROGRAM_META,
  ],
  data: instructionDiscriminator("fund"),
  programAddress: PACT_PROGRAM_ID,
});

export const getSignalInstruction = (input: {
  party: TransactionSigner;
  deal: Address;
}): Instruction => ({
  accounts: [signerMeta(input.party, false), writable(input.deal)],
  data: instructionDiscriminator("signal"),
  programAddress: PACT_PROGRAM_ID,
});

export const getAttestInstruction = (input: {
  witness: TransactionSigner;
  deal: Address;
  check: number;
  verdict: boolean;
  nominee?: string | null;
}): Instruction => ({
  accounts: [signerMeta(input.witness, false), writable(input.deal)],
  data: concat(
    instructionDiscriminator("attest"),
    attestArgsCodec.encode({
      check: input.check,
      nominee: input.nominee ? address(input.nominee) : null,
      verdict: input.verdict,
    })
  ),
  programAddress: PACT_PROGRAM_ID,
});

export const getExecuteInstruction = (input: {
  executor: TransactionSigner;
  deal: Address;
  rule: number;
  parties: readonly (string | null)[];
}): Instruction => ({
  accounts: [
    signerMeta(input.executor, false),
    writable(input.deal),
    ...input.parties.map((party) =>
      party ? writable(address(party)) : OPEN_SLOT_META
    ),
  ],
  data: concat(
    instructionDiscriminator("execute"),
    executeArgsCodec.encode({ rule: input.rule })
  ),
  programAddress: PACT_PROGRAM_ID,
});

export const getCancelInstruction = (input: {
  creator: TransactionSigner;
  deal: Address;
}): Instruction => ({
  accounts: [signerMeta(input.creator, true), writable(input.deal)],
  data: instructionDiscriminator("cancel"),
  programAddress: PACT_PROGRAM_ID,
});

const isDealAccount = (data: ReadonlyUint8Array) =>
  data.length >= DEAL_DISCRIMINATOR.length &&
  DEAL_DISCRIMINATOR.every((byte, position) => data[position] === byte);

export const decodeDeal = (
  dealAddress: Address,
  data: ReadonlyUint8Array,
  lamports: bigint
): DealState => {
  if (!isDealAccount(data)) {
    throw new Error(`${dealAddress} is not a pact deal account`);
  }
  const account = dealCodec.decode(data, DEAL_DISCRIMINATOR.length);
  return accountToState(dealAddress, account, lamports);
};

export const fetchDeal = async (
  rpc: Rpc<GetAccountInfoApi>,
  dealAddress: Address
): Promise<DealState | null> => {
  const account = await fetchEncodedAccount(rpc, dealAddress, {
    commitment: "confirmed",
  });
  if (!account.exists) {
    return null;
  }
  return decodeDeal(dealAddress, account.data, account.lamports);
};

export const fetchAllDeals = async (
  rpc: Rpc<GetProgramAccountsApi>
): Promise<DealState[]> => {
  const accounts = await rpc
    .getProgramAccounts(PACT_PROGRAM_ID, {
      commitment: "confirmed",
      encoding: "base64",
    })
    .send();
  const base64 = getBase64Encoder();
  const deals: DealState[] = [];
  for (const { pubkey, account } of accounts) {
    const data = base64.encode(account.data[0] as Base64EncodedBytes);
    if (data.length === DEAL_ACCOUNT_SIZE && isDealAccount(data)) {
      deals.push(decodeDeal(pubkey, data, account.lamports));
    }
  }
  return deals;
};
