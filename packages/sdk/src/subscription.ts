import {
  type Address,
  address,
  fetchEncodedAccount,
  type GetAccountInfoApi,
  getAddressCodec,
  getAddressEncoder,
  getI64Codec,
  getProgramDerivedAddress,
  getStructCodec,
  getU8Codec,
  type Instruction,
  type Rpc,
  type TransactionSigner,
} from "@solana/kit";
import {
  concat,
  instructionDiscriminator,
  PACT_PROGRAM_ID,
  SYSTEM_PROGRAM_META,
  signerMeta,
  writable,
} from "./client";
import idl from "./idl/pact.json" with { type: "json" };

export const SUBSCRIPTION_PRICE_LAMPORTS = 50_000_000n;
export const SUBSCRIPTION_PERIOD_SECONDS = 30 * 24 * 60 * 60;
export const SUBSCRIPTION_MAX_PERIODS = 12;
export const REVENUE_ADDRESS = address(
  "3p4TEJLZo7mA1pqcK8bRiLtNd1kVEPAHRLSwzwcRoHrQ"
);

const SUBSCRIPTION_SEED = "sub";
const SUBSCRIPTION_DISCRIMINATOR_LENGTH = 8;

const subscriptionCodec = getStructCodec([
  ["user", getAddressCodec()],
  ["expiresAt", getI64Codec()],
  ["bump", getU8Codec()],
]);

const SUBSCRIPTION_DISCRIMINATOR = Uint8Array.from(
  idl.accounts.find((entry) => entry.name === "Subscription")?.discriminator ??
    []
);

export interface SubscriptionState {
  address: Address;
  expiresAt: number;
  user: Address;
}

export const findSubscriptionAddress = async (user: Address) => {
  const [subscriptionAddress] = await getProgramDerivedAddress({
    programAddress: PACT_PROGRAM_ID,
    seeds: [SUBSCRIPTION_SEED, getAddressEncoder().encode(user)],
  });
  return subscriptionAddress;
};

export const getSubscribeInstruction = async (input: {
  user: TransactionSigner;
  periods: number;
}): Promise<Instruction> => ({
  accounts: [
    signerMeta(input.user, true),
    writable(await findSubscriptionAddress(input.user.address)),
    writable(REVENUE_ADDRESS),
    SYSTEM_PROGRAM_META,
  ],
  data: concat(
    instructionDiscriminator("subscribe"),
    getU8Codec().encode(input.periods)
  ),
  programAddress: PACT_PROGRAM_ID,
});

export const decodeSubscription = (
  subscriptionAddress: Address,
  data: Uint8Array | readonly number[]
): SubscriptionState => {
  const bytes = Uint8Array.from(data);
  const matches = SUBSCRIPTION_DISCRIMINATOR.every(
    (byte, position) => bytes[position] === byte
  );
  if (!matches) {
    throw new Error(`${subscriptionAddress} is not a pact subscription`);
  }
  const decoded = subscriptionCodec.decode(
    bytes,
    SUBSCRIPTION_DISCRIMINATOR_LENGTH
  );
  return {
    address: subscriptionAddress,
    expiresAt: Number(decoded.expiresAt),
    user: decoded.user,
  };
};

export const fetchSubscription = async (
  rpc: Rpc<GetAccountInfoApi>,
  user: Address
): Promise<SubscriptionState | null> => {
  const subscriptionAddress = await findSubscriptionAddress(user);
  const account = await fetchEncodedAccount(rpc, subscriptionAddress, {
    commitment: "confirmed",
  });
  if (!account.exists) {
    return null;
  }
  return decodeSubscription(subscriptionAddress, account.data);
};

export const isSubscriptionActive = (
  subscription: SubscriptionState | null,
  now: number
) => subscription !== null && subscription.expiresAt > now;
