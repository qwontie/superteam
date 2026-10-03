import { readFileSync } from "node:fs";
import { AnchorProvider, Program, Wallet, web3 } from "@anchor-lang/core";
import type { Pact } from "../packages/sdk/src/idl/pact";
import idl from "../packages/sdk/src/idl/pact.json" with { type: "json" };

const keysDir = process.env.KEYS_DIR;
if (!keysDir) {
  throw new Error("KEYS_DIR is not set, run through make ping-devnet");
}
const url = process.env.CLUSTER_URL ?? "https://api.devnet.solana.com";
const secret = JSON.parse(readFileSync(`${keysDir}/treasury.json`, "utf8"));
const wallet = new Wallet(web3.Keypair.fromSecretKey(Uint8Array.from(secret)));
const provider = new AnchorProvider(new web3.Connection(url), wallet, {
  commitment: "confirmed",
});
const program = new Program(idl as Pact, provider);

const signature = await program.methods
  .ping()
  .accounts({ caller: wallet.publicKey })
  .rpc();
console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
