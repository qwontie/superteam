import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { web3 } from "@anchor-lang/core";
import { AccountRole, address } from "@solana/kit";
import {
  feedHashBytes,
  findGateAddress,
  getGateConfirmInstruction,
  PACT_GATE_PROGRAM_ID,
  PACT_PROGRAM_ID,
  pinQuoteInstruction,
  SWITCHBOARD_DEVNET_QUEUE,
} from "../src";

const FEED =
  "0x6fcff79ab1a0e77c9b6b51d7a692fef3aa15e9d95f24ad6188fce45cca9e0885";
const DEAL = address("3STVaArBcuQktihMPQyB3pSYD1iwZa98ApBuuqc7i7QR");
const ED25519 = address("Ed25519SigVerify111111111111111111111111111");

describe("gate", () => {
  test("derives the gate address from the feed hash", async () => {
    const [expected] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("gate"), Buffer.from(FEED.slice(2), "hex")],
      new web3.PublicKey(PACT_GATE_PROGRAM_ID)
    );
    expect(await findGateAddress(FEED)).toBe(address(expected.toBase58()));
    expect(await findGateAddress(FEED.slice(2).toUpperCase())).toBe(
      address(expected.toBase58())
    );
  });

  test("refuses a feed hash that is not 32 bytes of hex", () => {
    expect(() => feedHashBytes("0x1234")).toThrow();
    expect(() => feedHashBytes(`${FEED.slice(0, -1)}g`)).toThrow();
  });

  test("builds confirm with the pinned accounts", async () => {
    const instruction = await getGateConfirmInstruction({
      check: 2,
      deal: DEAL,
      feedHash: FEED,
    });
    const discriminator = createHash("sha256")
      .update("global:confirm")
      .digest()
      .subarray(0, 8);
    expect(instruction.programAddress).toBe(PACT_GATE_PROGRAM_ID);
    expect(Buffer.from(instruction.data ?? [])).toEqual(
      Buffer.concat([
        discriminator,
        Buffer.from(FEED.slice(2), "hex"),
        Buffer.from([2]),
      ])
    );
    expect(instruction.accounts?.map((meta) => meta.address)).toEqual([
      await findGateAddress(FEED),
      DEAL,
      SWITCHBOARD_DEVNET_QUEUE,
      address("SysvarS1otHashes111111111111111111111111111"),
      address("Sysvar1nstructions1111111111111111111111111"),
      PACT_PROGRAM_ID,
    ]);
    expect(instruction.accounts?.map((meta) => meta.role)).toEqual([
      AccountRole.READONLY,
      AccountRole.WRITABLE,
      AccountRole.READONLY,
      AccountRole.READONLY,
      AccountRole.READONLY,
      AccountRole.READONLY,
    ]);
  });

  test("pins every signature record of the quote to its index", () => {
    const records = 3;
    const data = new Uint8Array(2 + records * 14).fill(0xff);
    data[0] = records;
    const pinned = pinQuoteInstruction({ data, programAddress: ED25519 }, 4);
    const view = new DataView(Uint8Array.from(pinned.data ?? []).buffer);
    for (let record = 0; record < records; record += 1) {
      const offset = 2 + record * 14;
      expect(view.getUint16(offset + 2, true)).toBe(4);
      expect(view.getUint16(offset + 6, true)).toBe(4);
      expect(view.getUint16(offset + 12, true)).toBe(4);
      expect(view.getUint16(offset, true)).toBe(0xff_ff);
    }
    expect(data[4]).toBe(0xff);
    expect(() =>
      pinQuoteInstruction({ data, programAddress: PACT_PROGRAM_ID }, 0)
    ).toThrow();
  });
});
