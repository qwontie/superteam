import assert from "node:assert/strict";
import { type AnchorProvider, BN, type Program, web3 } from "@anchor-lang/core";
import type { DealSpec } from "../packages/sdk/src/spec.ts";
import type { Pact } from "../target/types/pact";

const { Keypair, LAMPORTS_PER_SOL, PublicKey, SYSVAR_CLOCK_PUBKEY } = web3;
type Keypair = web3.Keypair;
type PublicKey = web3.PublicKey;

const CLOCK_UNIX_TIMESTAMP_OFFSET = 32;
let nextDealId = 1;

export const dealPda = (programId: PublicKey, creator: PublicKey, dealId: BN) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("deal"),
      creator.toBuffer(),
      dealId.toArrayLike(Buffer, "le", 8),
    ],
    programId
  )[0];

export const fundedKeypair = async (provider: AnchorProvider, sol = 2) => {
  const keypair = Keypair.generate();
  const signature = await provider.connection.requestAirdrop(
    keypair.publicKey,
    sol * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(signature, "confirmed");
  return keypair;
};

export const chainNow = async (provider: AnchorProvider) => {
  const clock = await provider.connection.getAccountInfo(
    SYSVAR_CLOCK_PUBKEY,
    "confirmed"
  );
  assert.ok(clock);
  return Number(clock.data.readBigInt64LE(CLOCK_UNIX_TIMESTAMP_OFFSET));
};

export const timeTravel = async (
  provider: AnchorProvider,
  unixSeconds: number
) => {
  const response = await fetch(provider.connection.rpcEndpoint, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "surfnet_timeTravel",
      params: [{ absoluteTimestamp: unixSeconds * 1000 }],
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as { error?: unknown };
  assert.equal(body.error, undefined, JSON.stringify(body.error));
  assert.ok((await chainNow(provider)) >= unixSeconds);
};

const conditionArg = (condition: DealSpec["rules"][number]["when"][number]) => {
  switch (condition.type) {
    case "after":
      return { after: { ts: new BN(condition.ts) } };
    case "signed":
      return { signed: { party: condition.party } };
    case "unsigned":
      return { unsigned: { party: condition.party } };
    case "attested":
      return { attested: { check: condition.check } };
    default:
      return condition satisfies never;
  }
};

const KIND_CODES = {
  github_checks: 2,
  github_pr_merged: 3,
  http_contains: 1,
  manual: 0,
} as const;

export const createArgs = (spec: DealSpec) => ({
  amount: new BN(spec.amount),
  checks: spec.checks.map((check) => ({
    binds: check.binds ?? null,
    expect: check.expect,
    kind: KIND_CODES[check.kind],
    target: check.target,
    threshold: check.threshold,
    witnesses: check.witnesses.map((witness) => new PublicKey(witness)),
  })),
  funder: spec.funder,
  parties: spec.parties.map((party) =>
    party ? new PublicKey(party) : PublicKey.default
  ),
  rules: spec.rules.map((rule) => ({
    pay: rule.pay,
    when: rule.when.map(conditionArg),
  })),
  title: spec.title,
});

export const createDeal = async (
  program: Program<Pact>,
  creator: Keypair,
  spec: DealSpec,
  adjust: (args: ReturnType<typeof createArgs>) => void = () => undefined
) => {
  const dealId = new BN(nextDealId);
  nextDealId += 1;
  const args = createArgs(spec);
  adjust(args);
  const deal = dealPda(program.programId, creator.publicKey, dealId);
  await program.methods
    .createDeal(
      dealId,
      args.title,
      args.parties,
      args.funder,
      args.amount,
      args.checks,
      args.rules
    )
    .accountsPartial({ creator: creator.publicKey, deal })
    .signers([creator])
    .rpc({ commitment: "confirmed" });
  return deal;
};

export const payoutAccounts = (parties: PublicKey[]) =>
  parties.map((pubkey) => ({
    isSigner: false,
    isWritable: !pubkey.equals(PublicKey.default),
    pubkey,
  }));

export const rejectsWith = async (action: Promise<unknown>, code: string) => {
  await assert.rejects(action, (error: unknown) => {
    const text = String(
      (error as { error?: { errorCode?: { code?: string } } }).error?.errorCode
        ?.code ?? error
    );
    assert.ok(text.includes(code), `expected ${code}, got ${String(error)}`);
    return true;
  });
};
