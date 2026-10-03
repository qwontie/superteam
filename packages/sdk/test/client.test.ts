import { describe, expect, test } from "bun:test";
import { BN, BorshCoder, type Idl, web3 } from "@anchor-lang/core";
import {
  AccountRole,
  address,
  createNoopSigner,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
  SolanaError,
} from "@solana/kit";
import {
  decodeDeal,
  explorerTx,
  findDealAddress,
  findPactError,
  getAttestInstruction,
  getCreateDealInstruction,
  getExecuteInstruction,
  OPEN_SLOT,
  PACT_IDL,
  PACT_PROGRAM_ID,
} from "../src";
import {
  bountySpec,
  CLIENT,
  DEADLINE,
  demoSpec,
  FREELANCER,
  WITNESSES,
} from "./fixtures";

const coder = new BorshCoder(PACT_IDL as Idl);
const key = (value: string) => new web3.PublicKey(value);
const creator = createNoopSigner(address(CLIENT));

describe("chain client", () => {
  test("derives the deal address like the program", async () => {
    const dealId = 42n;
    const [expected] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("deal"),
        key(CLIENT).toBuffer(),
        new BN(42).toArrayLike(Buffer, "le", 8),
      ],
      key(PACT_PROGRAM_ID)
    );
    expect(await findDealAddress(address(CLIENT), dealId)).toBe(
      address(expected.toBase58())
    );
  });

  test("encodes create_deal exactly like Anchor", async () => {
    const instruction = await getCreateDealInstruction({
      creator,
      dealId: 7n,
      spec: demoSpec(),
    });
    const decoded = coder.instruction.decode(
      Buffer.from(instruction.data as Uint8Array)
    );
    expect(decoded?.name).toBe("create_deal");
    const data = decoded?.data as Record<string, unknown> & {
      deal_id: BN;
      amount: BN;
      parties: web3.PublicKey[];
      checks: {
        kind: number;
        witnesses: web3.PublicKey[];
        threshold: number;
      }[];
      rules: {
        when: Record<string, { ts?: BN; party?: number; check?: number }>[];
      }[];
    };
    expect(data.deal_id.toString()).toBe("7");
    expect(data.title).toBe("Landing page");
    expect(data.parties.map((party) => party.toBase58())).toEqual([
      CLIENT,
      FREELANCER,
    ]);
    expect(data.amount.toString()).toBe("10000000");
    expect(
      data.checks[0]?.witnesses.map((witness) => witness.toBase58())
    ).toEqual(WITNESSES);
    expect(data.checks[0]?.threshold).toBe(2);
    expect(data.rules[2]?.when[0]?.After?.ts?.toNumber()).toBe(DEADLINE);
    expect(data.rules[0]?.when[0]?.Attested?.check).toBe(0);
    expect(instruction.accounts?.map((account) => account.address)).toEqual([
      address(CLIENT),
      instruction.deal,
      address("11111111111111111111111111111111"),
    ]);
  });

  test("encodes attest and execute exactly like Anchor", () => {
    const deal = address(WITNESSES[2] as string);
    const attest = getAttestInstruction({
      check: 1,
      deal,
      verdict: true,
      witness: creator,
    });
    expect(
      coder.instruction.decode(Buffer.from(attest.data as Uint8Array))
    ).toEqual({
      data: { check: 1, nominee: null, verdict: true },
      name: "attest",
    });
    const execute = getExecuteInstruction({
      deal,
      executor: creator,
      parties: [CLIENT, FREELANCER],
      rule: 2,
    });
    expect(
      coder.instruction.decode(Buffer.from(execute.data as Uint8Array))
    ).toEqual({
      data: { rule: 2 },
      name: "execute",
    });
    expect(
      execute.accounts?.slice(2).map((account) => account.address)
    ).toEqual([address(CLIENT), address(FREELANCER)]);
  });

  test("decodes a deal account written by Anchor", async () => {
    const bytes = await coder.accounts.encode("Deal", {
      amount: new BN(10_000_000),
      bump: 254,
      checks: [
        {
          binds: null,
          expect: "",
          kind: 0,
          no: 0b010,
          nominees: WITNESSES.map(() =>
            key("11111111111111111111111111111111")
          ),
          target: "Landing page delivered as agreed",
          threshold: 2,
          witnesses: WITNESSES.map(key),
          yes: 0b101,
        },
      ],
      creator: key(CLIENT),
      deal_id: new BN(9),
      funder: 0,
      parties: [key(CLIENT), key(FREELANCER)],
      rules: demoSpec().rules.map((rule) => ({
        pay: rule.pay,
        when: rule.when.map((condition) => {
          if (condition.type === "after") {
            return { After: { ts: new BN(condition.ts) } };
          }
          if (condition.type === "attested") {
            return { Attested: { check: condition.check } };
          }
          return { Signed: { party: condition.party } };
        }),
      })),
      settled_rule: 0,
      signals: [new BN(1_790_000_100), null],
      status: { Settled: {} },
      title: "Landing page",
    });
    const deal = decodeDeal(address(WITNESSES[0] as string), bytes, 123n);
    expect(deal.status).toBe("settled");
    expect(deal.settledRule).toBe(0);
    expect(deal.dealId).toBe(9n);
    expect(deal.signals).toEqual([1_790_000_100, null]);
    expect(deal.votes[0]).toEqual({
      byWitness: ["yes", "no", "yes"],
      no: 1,
      nominees: [null, null, null],
      yes: 2,
    });
    expect(deal.spec).toEqual(demoSpec());
    expect(deal.lamports).toBe(123n);
  });

  test("names program errors and builds explorer links", () => {
    const custom = new SolanaError(SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM, {
      code: 6019,
      index: 0,
    });
    expect(
      findPactError(new Error("simulation failed", { cause: custom }))?.name
    ).toBe("NoExitRule");
    expect(findPactError(new Error("network"))).toBeNull();
    expect(explorerTx("abc")).toBe(
      "https://explorer.solana.com/tx/abc?cluster=devnet"
    );
  });

  test("encodes a bounty with an open slot and a nominee", async () => {
    const instruction = await getCreateDealInstruction({
      creator,
      dealId: 8n,
      spec: bountySpec(),
    });
    const decoded = coder.instruction.decode(
      Buffer.from(instruction.data as Uint8Array)
    );
    const data = decoded?.data as {
      parties: web3.PublicKey[];
      checks: { binds: number | null }[];
    };
    expect(data.parties.map((party) => party.toBase58())).toEqual([
      CLIENT,
      OPEN_SLOT,
    ]);
    expect(data.checks[0]?.binds).toBe(1);

    const deal = address(WITNESSES[2] as string);
    const attest = getAttestInstruction({
      check: 0,
      deal,
      nominee: FREELANCER,
      verdict: true,
      witness: creator,
    });
    const vote = coder.instruction.decode(
      Buffer.from(attest.data as Uint8Array)
    )?.data as {
      nominee: web3.PublicKey | null;
    };
    expect(vote.nominee?.toBase58()).toBe(FREELANCER);

    const execute = getExecuteInstruction({
      deal,
      executor: creator,
      parties: [CLIENT, null],
      rule: 1,
    });
    expect(execute.accounts?.slice(2)).toEqual([
      { address: address(CLIENT), role: AccountRole.WRITABLE },
      { address: address(OPEN_SLOT), role: AccountRole.READONLY },
    ]);
  });
});
