import assert from "node:assert/strict";
import {
  AnchorProvider,
  getProvider,
  type Program,
  setProvider,
  workspace,
} from "@anchor-lang/core";
import { describe, it } from "mocha";
import type { Pact } from "../target/types/pact";

describe("pact", () => {
  setProvider(AnchorProvider.env());
  const provider = getProvider() as AnchorProvider;
  const program = workspace.pact as Program<Pact>;

  it("answers ping", async () => {
    const signature = await program.methods
      .ping()
      .accounts({ caller: provider.wallet.publicKey })
      .rpc({ commitment: "confirmed" });
    const tx = await provider.connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    assert.equal(tx?.meta?.err, null);
  });
});
