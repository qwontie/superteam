import assert from "node:assert/strict";
import {
  AnchorProvider,
  getProvider,
  type Program,
  setProvider,
  web3,
  workspace,
} from "@anchor-lang/core";
import { before, describe, it } from "mocha";
import { DEAL_ACCOUNT_SIZE } from "../packages/sdk/src/layout.ts";
import type { DealSpec } from "../packages/sdk/src/spec.ts";
import {
  bounty,
  gig,
  silenceIsConsent,
} from "../packages/sdk/src/templates.ts";
import type { Pact } from "../target/types/pact";
import {
  chainNow,
  createDeal,
  fundedKeypair,
  payoutAccounts,
  rejectsWith,
  timeTravel,
} from "./helpers.ts";

type Keypair = web3.Keypair;
type PublicKey = web3.PublicKey;

const AMOUNT = 100_000_000n;
const HOUR = 3600;

describe("pact", () => {
  setProvider(AnchorProvider.env());
  const provider = getProvider() as AnchorProvider;
  const program = workspace.pact as Program<Pact>;
  const { connection } = provider;

  let client: Keypair;
  let freelancer: Keypair;
  let witnesses: Keypair[];
  let stranger: Keypair;

  before(async () => {
    [client, freelancer, stranger, ...witnesses] = await Promise.all(
      Array.from({ length: 6 }, () => fundedKeypair(provider))
    );
  });

  const freelanceSpec = async (deadlineIn = 2 * HOUR) =>
    gig({
      amount: AMOUNT,
      check: {
        target: "Landing page delivered as agreed",
        witnesses: witnesses.map((witness) => witness.publicKey.toBase58()),
      },
      client: client.publicKey.toBase58(),
      deadline: (await chainNow(provider)) + deadlineIn,
      freelancer: freelancer.publicKey.toBase58(),
      title: "Landing page",
    });

  const fund = (deal: PublicKey, funder: Keypair = client) =>
    program.methods
      .fund()
      .accountsPartial({ deal, funder: funder.publicKey })
      .signers([funder])
      .rpc({ commitment: "confirmed" });

  const signal = (deal: PublicKey, party: Keypair) =>
    program.methods
      .signal()
      .accountsPartial({ deal, party: party.publicKey })
      .signers([party])
      .rpc({ commitment: "confirmed" });

  const attest = (
    deal: PublicKey,
    witness: Keypair,
    verdict: boolean,
    check = 0,
    nominee: PublicKey | null = null
  ) =>
    program.methods
      .attest(check, verdict, nominee)
      .accountsPartial({ deal, witness: witness.publicKey })
      .signers([witness])
      .rpc({ commitment: "confirmed" });

  const execute = (
    deal: PublicKey,
    rule: number,
    recipients = payoutAccounts([client.publicKey, freelancer.publicKey])
  ) =>
    program.methods
      .execute(rule)
      .accountsPartial({ deal, executor: stranger.publicKey })
      .remainingAccounts(recipients)
      .signers([stranger])
      .rpc({ commitment: "confirmed" });

  const cancel = (deal: PublicKey, creator: Keypair = client) =>
    program.methods
      .cancel()
      .accountsPartial({ creator: creator.publicKey, deal })
      .signers([creator])
      .rpc({ commitment: "confirmed" });

  const close = (deal: PublicKey, creator: Keypair = client) =>
    program.methods
      .close()
      .accountsPartial({ creator: creator.publicKey, deal })
      .signers([creator])
      .rpc({ commitment: "confirmed" });

  const balance = (key: PublicKey) => connection.getBalance(key, "confirmed");

  const fundedFreelanceDeal = async () => {
    const deal = await createDeal(program, client, await freelanceSpec());
    await fund(deal);
    return deal;
  };

  const assertSettled = async (deal: PublicKey, rule: number) => {
    const account = await program.account.deal.fetch(deal, "confirmed");
    assert.deepEqual(account.status, { settled: {} });
    assert.equal(account.settledRule, rule);
    const info = await connection.getAccountInfo(deal, "confirmed");
    assert.ok(info);
    assert.equal(info.data.length, DEAL_ACCOUNT_SIZE);
    const rent = await connection.getMinimumBalanceForRentExemption(
      info.data.length
    );
    assert.equal(info.lamports, rent);
  };

  describe("template: gig", () => {
    it("pays the freelancer once 2 of 3 witnesses say yes", async () => {
      const deal = await createDeal(program, client, await freelanceSpec());
      const draft = await program.account.deal.fetch(deal, "confirmed");
      assert.deepEqual(draft.status, { draft: {} });
      assert.equal(draft.rules.length, 3);

      const dealBefore = await balance(deal);
      await fund(deal);
      assert.equal(await balance(deal), dealBefore + Number(AMOUNT));

      const [first, second, third] = witnesses as [Keypair, Keypair, Keypair];
      await attest(deal, first, true);
      await attest(deal, second, false);
      await rejectsWith(execute(deal, 0), "ConditionNotMet");
      await attest(deal, third, true);

      const freelancerBefore = await balance(freelancer.publicKey);
      const signature = await execute(deal, 0);
      assert.equal(
        await balance(freelancer.publicKey),
        freelancerBefore + Number(AMOUNT)
      );
      await assertSettled(deal, 0);

      const tx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      console.log(
        `      execute used ${tx?.meta?.computeUnitsConsumed} compute units`
      );
    });

    it("pays the freelancer when the client approves early", async () => {
      const deal = await fundedFreelanceDeal();
      await signal(deal, client);
      const freelancerBefore = await balance(freelancer.publicKey);
      await execute(deal, 1);
      assert.equal(
        await balance(freelancer.publicKey),
        freelancerBefore + Number(AMOUNT)
      );
      await assertSettled(deal, 1);
    });
  });

  describe("template: silence is consent", () => {
    const silenceSpec = async (): Promise<[DealSpec, number]> => {
      const now = await chainNow(provider);
      const spec = silenceIsConsent({
        amount: AMOUNT,
        client: client.publicKey.toBase58(),
        deliveryDeadline: now + HOUR,
        finalExit: now + 3 * HOUR,
        freelancer: freelancer.publicKey.toBase58(),
        reviewEnd: now + 2 * HOUR,
        title: "Logo",
      });
      return [spec, now];
    };

    it("pays the freelancer when the client stays silent after delivery", async () => {
      const [spec, start] = await silenceSpec();
      const deal = await createDeal(program, client, spec);
      await fund(deal);
      await signal(deal, freelancer);
      await rejectsWith(signal(deal, freelancer), "AlreadySignaled");
      await rejectsWith(execute(deal, 1), "ConditionNotMet");

      await timeTravel(provider, start + 2 * HOUR + 1);
      await rejectsWith(execute(deal, 2), "ConditionNotMet");
      const freelancerBefore = await balance(freelancer.publicKey);
      await execute(deal, 1);
      assert.equal(
        await balance(freelancer.publicKey),
        freelancerBefore + Number(AMOUNT)
      );
      await assertSettled(deal, 1);
    });

    it("refunds the client when nothing is delivered", async () => {
      const [spec, start] = await silenceSpec();
      const deal = await createDeal(program, client, spec);
      await fund(deal);
      await rejectsWith(execute(deal, 2), "ConditionNotMet");

      await timeTravel(provider, start + HOUR + 1);
      const clientBefore = await balance(client.publicKey);
      await execute(deal, 2);
      assert.equal(
        await balance(client.publicKey),
        clientBefore + Number(AMOUNT)
      );
      await assertSettled(deal, 2);
    });
  });

  describe("exit rule", () => {
    it("refunds the client after the deadline, executed by anyone", async () => {
      const deal = await fundedFreelanceDeal();
      await rejectsWith(execute(deal, 2), "ConditionNotMet");
      const account = await program.account.deal.fetch(deal, "confirmed");
      const exit = account.rules[2]?.when[0]?.after?.ts.toNumber();
      assert.ok(exit);

      await timeTravel(provider, exit);
      const clientBefore = await balance(client.publicKey);
      await execute(deal, 2);
      assert.equal(
        await balance(client.publicKey),
        clientBefore + Number(AMOUNT)
      );
      await assertSettled(deal, 2);
    });
  });

  describe("bounty: the winner is chosen by the reviewers", () => {
    const OPEN = web3.PublicKey.default;

    const bountySpec = async (deadlineIn = 2 * HOUR) =>
      bounty({
        amount: AMOUNT,
        check: {
          target: "Best landing page wins",
          witnesses: witnesses.map((witness) => witness.publicKey.toBase58()),
        },
        deadline: (await chainNow(provider)) + deadlineIn,
        sponsor: client.publicKey.toBase58(),
        title: "Landing page bounty",
      });

    const fundedBounty = async () => {
      const deal = await createDeal(program, client, await bountySpec());
      await fund(deal);
      return deal;
    };

    it("fills the open slot when 2 of 3 reviewers name the same winner", async () => {
      const deal = await fundedBounty();
      const [first, second, third] = witnesses as [Keypair, Keypair, Keypair];
      await attest(deal, first, true, 0, freelancer.publicKey);
      await attest(deal, second, true, 0, stranger.publicKey);
      await rejectsWith(
        execute(deal, 0, payoutAccounts([client.publicKey, OPEN])),
        "ConditionNotMet"
      );

      await attest(deal, third, true, 0, freelancer.publicKey);
      const bound = await program.account.deal.fetch(deal, "confirmed");
      assert.ok(bound.parties[1]?.equals(freelancer.publicKey));

      const freelancerBefore = await balance(freelancer.publicKey);
      await execute(deal, 0);
      assert.equal(
        await balance(freelancer.publicKey),
        freelancerBefore + Number(AMOUNT)
      );
      await assertSettled(deal, 0);
    });

    it("refunds the sponsor when the reviewers stay silent", async () => {
      const deal = await fundedBounty();
      const account = await program.account.deal.fetch(deal, "confirmed");
      const exit = account.rules[1]?.when[0]?.after?.ts.toNumber();
      assert.ok(exit);
      await timeTravel(provider, exit);
      const clientBefore = await balance(client.publicKey);
      await execute(deal, 1, payoutAccounts([client.publicKey, OPEN]));
      assert.equal(
        await balance(client.publicKey),
        clientBefore + Number(AMOUNT)
      );
      await assertSettled(deal, 1);
    });

    it("refuses votes without a nominee, with a bad nominee, and after the slot is filled", async () => {
      const deal = await fundedBounty();
      const [first, second, third] = witnesses as [Keypair, Keypair, Keypair];
      await rejectsWith(attest(deal, first, true), "NomineeRequired");
      await rejectsWith(
        attest(deal, first, false, 0, freelancer.publicKey),
        "NomineeNotExpected"
      );
      await rejectsWith(
        attest(deal, first, true, 0, client.publicKey),
        "BadNominee"
      );
      await rejectsWith(attest(deal, first, true, 0, OPEN), "BadNominee");
      await attest(deal, first, true, 0, freelancer.publicKey);
      await attest(deal, second, true, 0, freelancer.publicKey);
      await rejectsWith(attest(deal, third, false), "AlreadyBound");
    });

    it("refuses a nominee on a check that fills no slot", async () => {
      const deal = await fundedFreelanceDeal();
      await rejectsWith(
        attest(deal, witnesses[0] as Keypair, true, 0, freelancer.publicKey),
        "NomineeNotExpected"
      );
    });

    it("refuses bad open slot layouts at creation", async () => {
      const refused = async (
        change: (spec: DealSpec) => void,
        code: string
      ) => {
        const spec = await bountySpec();
        change(spec);
        await rejectsWith(createDeal(program, client, spec), code);
      };
      await refused((spec) => {
        spec.parties = [null, client.publicKey.toBase58()];
        spec.funder = 0;
      }, "FunderIsOpen");
      await refused((spec) => {
        (spec.checks[0] as DealSpec["checks"][number]).binds = 0;
      }, "BindsNotOpenSlot");
      await refused((spec) => {
        spec.checks.push({ ...(spec.checks[0] as DealSpec["checks"][number]) });
      }, "DuplicateBinding");
      await refused((spec) => {
        spec.rules[0] = {
          pay: [{ bps: 10_000, party: 1 }],
          when: [{ party: 0, type: "signed" }],
        };
      }, "UnboundPayout");
    });
  });

  describe("refusals", () => {
    const createRefused = async (
      change: (spec: DealSpec) => void,
      code: string
    ) => {
      const spec = await freelanceSpec();
      change(spec);
      await rejectsWith(createDeal(program, client, spec), code);
    };

    it("refuses a deal without an exit rule", async () => {
      await createRefused((spec) => {
        spec.rules = spec.rules.slice(0, 2);
      }, "NoExitRule");
    });

    it("refuses an exit rule that is not in the future", async () => {
      const now = await chainNow(provider);
      await createRefused((spec) => {
        spec.rules[2] = {
          pay: [{ bps: 10_000, party: 0 }],
          when: [{ ts: now - 10, type: "after" }],
        };
      }, "ExitNotInFuture");
    });

    it("refuses shares that do not add up to 10000", async () => {
      await createRefused((spec) => {
        spec.rules[0] = {
          pay: [{ bps: 9000, party: 1 }],
          when: [{ check: 0, type: "attested" }],
        };
      }, "SharesNotWhole");
    });

    it("refuses indexes out of range", async () => {
      await createRefused((spec) => {
        spec.rules[1] = {
          pay: [{ bps: 10_000, party: 1 }],
          when: [{ party: 2, type: "signed" }],
        };
      }, "PartyOutOfRange");
      await createRefused((spec) => {
        spec.rules[0] = {
          pay: [{ bps: 10_000, party: 1 }],
          when: [{ check: 1, type: "attested" }],
        };
      }, "CheckOutOfRange");
      await createRefused((spec) => {
        spec.funder = 2;
      }, "FunderOutOfRange");
    });

    it("accepts the four check kinds and refuses an unknown one", async () => {
      const spec = await freelanceSpec();
      const check = spec.checks[0] as DealSpec["checks"][number];
      check.kind = "github_pr_merged";
      check.target = "qwontie/superteam#12";
      const deal = await createDeal(program, client, spec);
      const account = await program.account.deal.fetch(deal, "confirmed");
      assert.equal(account.checks[0]?.kind, 3);
      await rejectsWith(
        createDeal(program, client, await freelanceSpec(), (args) => {
          (args.checks[0] as { kind: number }).kind = 4;
        }),
        "UnknownCheckKind"
      );
    });

    it("refuses a bad threshold and duplicate witnesses", async () => {
      await createRefused((spec) => {
        (spec.checks[0] as DealSpec["checks"][number]).threshold = 0;
      }, "BadThreshold");
      await createRefused((spec) => {
        (spec.checks[0] as DealSpec["checks"][number]).threshold = 4;
      }, "BadThreshold");
      await createRefused((spec) => {
        const check = spec.checks[0] as DealSpec["checks"][number];
        check.witnesses = [
          check.witnesses[0] as string,
          check.witnesses[0] as string,
        ];
      }, "DuplicateWitness");
    });

    it("refuses a deposit from anyone but the funder", async () => {
      const deal = await createDeal(program, client, await freelanceSpec());
      await rejectsWith(fund(deal, freelancer), "WrongFunder");
      await fund(deal);
      await rejectsWith(fund(deal), "NotDraft");
    });

    it("refuses a signal before funding, from a stranger, and twice", async () => {
      const deal = await createDeal(program, client, await freelanceSpec());
      await rejectsWith(signal(deal, client), "NotFunded");
      await fund(deal);
      await rejectsWith(signal(deal, stranger), "NotAParty");
      await signal(deal, freelancer);
      await rejectsWith(signal(deal, freelancer), "AlreadySignaled");
    });

    it("refuses a vote from a non-witness and a second vote", async () => {
      const deal = await fundedFreelanceDeal();
      await rejectsWith(attest(deal, stranger, true), "NotAWitness");
      await rejectsWith(attest(deal, client, true), "NotAWitness");
      await rejectsWith(
        attest(deal, witnesses[0] as Keypair, true, 1),
        "CheckOutOfRange"
      );
      await attest(deal, witnesses[0] as Keypair, true);
      await rejectsWith(
        attest(deal, witnesses[0] as Keypair, false),
        "AlreadyVoted"
      );
    });

    it("refuses to execute a rule whose condition is false", async () => {
      const deal = await fundedFreelanceDeal();
      await rejectsWith(execute(deal, 0), "ConditionNotMet");
      await rejectsWith(execute(deal, 1), "ConditionNotMet");
      await rejectsWith(execute(deal, 2), "ConditionNotMet");
      await rejectsWith(execute(deal, 3), "RuleOutOfRange");
    });

    it("refuses to execute twice", async () => {
      const deal = await fundedFreelanceDeal();
      await signal(deal, client);
      await execute(deal, 1);
      await rejectsWith(execute(deal, 1), "NotFunded");
    });

    it("refuses payout accounts that are not the parties in order", async () => {
      const deal = await fundedFreelanceDeal();
      await signal(deal, client);
      await rejectsWith(
        execute(
          deal,
          1,
          payoutAccounts([freelancer.publicKey, client.publicKey])
        ),
        "WrongPayoutAccounts"
      );
      await rejectsWith(
        execute(deal, 1, payoutAccounts([client.publicKey])),
        "WrongPayoutAccounts"
      );
      await rejectsWith(
        execute(
          deal,
          1,
          payoutAccounts([client.publicKey, stranger.publicKey])
        ),
        "WrongPayoutAccounts"
      );
      await rejectsWith(
        execute(deal, 1, [
          { isSigner: false, isWritable: true, pubkey: client.publicKey },
          { isSigner: false, isWritable: false, pubkey: freelancer.publicKey },
        ]),
        "WrongPayoutAccounts"
      );
    });

    it("refuses to execute a draft", async () => {
      const deal = await createDeal(program, client, await freelanceSpec());
      await rejectsWith(execute(deal, 1), "NotFunded");
    });

    it("cancels a draft for the creator only, and never after funding", async () => {
      const draft = await createDeal(program, client, await freelanceSpec());
      await rejectsWith(cancel(draft, freelancer), "NotCreator");
      await cancel(draft);
      assert.equal(await connection.getAccountInfo(draft, "confirmed"), null);

      const funded = await fundedFreelanceDeal();
      await rejectsWith(cancel(funded), "NotDraft");
    });
  });

  describe("close", () => {
    it("returns the rent of a settled deal to the creator only", async () => {
      const deal = await fundedFreelanceDeal();
      await rejectsWith(close(deal), "NotSettled");
      await signal(deal, client);
      await execute(deal, 1);

      await rejectsWith(close(deal, freelancer), "NotCreator");
      const rent = await balance(deal);
      const creatorBefore = await balance(client.publicKey);
      await close(deal);
      assert.equal(await connection.getAccountInfo(deal, "confirmed"), null);
      assert.equal(await balance(client.publicKey), creatorBefore + rent);
    });

    it("refuses to close a draft", async () => {
      const deal = await createDeal(program, client, await freelanceSpec());
      await rejectsWith(close(deal), "NotSettled");
    });
  });
});
