import { describe, expect, test } from "bun:test";
import { BN, BorshCoder, type Idl, web3 } from "@anchor-lang/core";
import { address, createNoopSigner } from "@solana/kit";
import {
  decodeSubscription,
  findSubscriptionAddress,
  getSubscribeInstruction,
  isSubscriptionActive,
  PACT_IDL,
  PACT_PROGRAM_ID,
  REVENUE_ADDRESS,
} from "../src";
import { CLIENT, NOW } from "./fixtures";

const coder = new BorshCoder(PACT_IDL as Idl);

describe("subscription", () => {
  test("derives the subscription address like the program", async () => {
    const [expected] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("sub"), new web3.PublicKey(CLIENT).toBuffer()],
      new web3.PublicKey(PACT_PROGRAM_ID)
    );
    expect(await findSubscriptionAddress(address(CLIENT))).toBe(
      address(expected.toBase58())
    );
  });

  test("encodes subscribe exactly like Anchor", async () => {
    const user = createNoopSigner(address(CLIENT));
    const instruction = await getSubscribeInstruction({ periods: 3, user });
    expect(
      coder.instruction.decode(Buffer.from(instruction.data as Uint8Array))
    ).toEqual({ data: { periods: 3 }, name: "subscribe" });
    expect(instruction.accounts?.map((account) => account.address)).toEqual([
      address(CLIENT),
      await findSubscriptionAddress(address(CLIENT)),
      REVENUE_ADDRESS,
      address("11111111111111111111111111111111"),
    ]);
  });

  test("decodes a subscription written by Anchor and tells if it is active", async () => {
    const bytes = await coder.accounts.encode("Subscription", {
      bump: 255,
      expires_at: new BN(NOW + 100),
      user: new web3.PublicKey(CLIENT),
    });
    const subscriptionAddress = await findSubscriptionAddress(address(CLIENT));
    const subscription = decodeSubscription(subscriptionAddress, bytes);
    expect(subscription).toEqual({
      address: subscriptionAddress,
      expiresAt: NOW + 100,
      user: address(CLIENT),
    });
    expect(isSubscriptionActive(subscription, NOW)).toBe(true);
    expect(isSubscriptionActive(subscription, NOW + 100)).toBe(false);
    expect(isSubscriptionActive(null, NOW)).toBe(false);
  });
});
