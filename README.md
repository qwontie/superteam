# Pact

Pay for work with the money already locked. Pact holds the payment for a gig or a bounty in an on-chain vault from the moment it is posted, and releases it by rules everybody can read: the votes of the reviewers named in the deal, a signature, or a date. Nobody holds the money in between, no one approves the payout, and a deal can never get stuck because the program refuses to create one without a time-only exit.

Gigs and bounties are the first two templates of a general builder. A deal is a vault plus rules of the form "WHEN conditions THEN pay out by shares", enforced by one Anchor program that is live on Solana devnet.

Built for HackYeah 2026, challenge "Finance Without Intermediaries" by Superteam Poland. Pact is a working name.

| | |
|---|---|
| Program id (devnet) | `6uhLn2f5NZzydXocLTaxhGYKZ2pQQvrhrbwyMmM9YsCk` |
| Explorer | https://explorer.solana.com/address/6uhLn2f5NZzydXocLTaxhGYKZ2pQQvrhrbwyMmM9YsCk?cluster=devnet |
| Live app (devnet) | https://pact.qwontie.dev |
| Repository | https://github.com/qwontie/superteam |

## The use case

A DAO treasurer, Maria, needs a landing page built by someone she has never met, Piotr, for 2 SOL by Friday. Today one of three things happens: Maria pays first and hopes, Piotr works first and hopes, or a platform holds the money in between and decides how and when it is released.

With Pact:

1. Maria posts the gig as a deal: 2 SOL, Piotr as the contributor, three reviewers (M of N, here 2 of 3) who will confirm the work, a deadline.
2. She locks the 2 SOL in the vault. Piotr can see the money is there and read every rule before he starts.
3. When 2 of the 3 reviewers vote yes, the first rule is true. Piotr, or anyone, sends `execute` and the program moves the 2 SOL to Piotr. Maria does not need to press anything, and neither does a platform.
4. If nobody shows up, nobody votes, or Piotr vanishes, the time rule becomes true on Friday and anyone can send `execute`; the 2 SOL return to Maria.

Every step is a transaction on Solana Explorer.

The same machinery works for a bounty where the winner is not known when the prize is posted: the reviewers name the winning wallet, and the prize goes there.

## Which financial relationship was redesigned

Payment for work between parties who do not know each other: gigs, bounties, grants paid on delivery.

The intermediary was whoever holds the money between "agreed" and "delivered": a platform, or the sponsor's own promise to pay later. That party decides when the money is released, can delay or reverse it, and settles disputes. The contributor trusts it to pay; the sponsor trusts it to be fair.

What changes without it:

- The money is locked on day one in a program account, not in anyone's wallet or promise.
- The release conditions are written into the account in plain text, are the same for everyone and cannot be edited after creation.
- The "judge" is not a platform but the M of N named people in the deal, chosen before the money is locked, who can vote once and cannot touch the money. For facts a machine can check (a page contains a marker, CI is green, a pull request is merged), the judge is a witness node anyone can run.
- If nobody acts, a time rule returns the money. Nobody's cooperation is needed to recover it.
- The deal pays no fee to us. There is no admin key in the program.

Target users: teams, DAOs and sponsors who pay contributors they have never met, and those contributors.

## How it works

```
  client wallet                                          witness 1..N (people or nodes)
       |                                                        |
       | fund(exact amount)                                     | attest(yes/no) once each
       v                                                        v
  +----------------------------------------------------------------------+
  | deal account, owned by the pact program, holds the money             |
  |                                                                      |
  |  rule 1  WHEN 2 of 3 witnesses said yes          THEN 100% freelancer|
  |  rule 2  WHEN the client signed                  THEN 100% freelancer|
  |  rule 3  WHEN the clock is past Friday 18:00     THEN 100% client    |
  |          (exit rule: time only, required at creation)                |
  +----------------------------------------------------------------------+
       ^
       | execute(rule n): anyone, at any time
       | the program checks every condition of that rule against the
       | clock, the stored signatures and the stored votes.
       | all true: lamports move to the parties. any false: refused.
```

- A deal has 2 to 4 parties, up to 3 checks, up to 6 rules with up to 4 conditions each and up to 4 payouts each. Shares in a rule add up to 100%.
- Conditions: `After(time)`, `Signed(party)`, `Unsigned(party)`, `Attested(check)`.
- A check is a statement plus a list of witnesses and a threshold. The program only counts the votes of the listed keys. The check kind tells the witnesses and the UI what to verify: `manual` (people judge), `http_contains`, `github_checks`, `github_pr_merged`.
- A bounty has an open slot instead of a named winner. A check bound to that slot is passed when the threshold of witnesses name the same address, and at that moment the slot is filled.
- The first rule that is true and gets executed wins. Templates order their rules so that the exit comes last in time.
- The user signs exactly the rules they see. Creation is refused by the program if shares do not add up, an index is out of range, a witness is listed twice, or there is no exit rule.

Templates (`packages/sdk/src/templates.ts`):

| Template | Rules |
|---|---|
| Gig with reviewers | reviewers vote yes (M of N) pays the freelancer; the client's signature pays the freelancer; after the deadline the client is refunded |
| Bounty | reviewers name the winner (M of N) and the prize goes to the winner; after the deadline the sponsor is refunded |
| Silence is consent | the client signs, or the freelancer signs and the review window passes, pays the freelancer; no delivery by the deadline refunds the client; a final exit refunds the client |

## Permissions

| Actor | Can | Cannot |
|---|---|---|
| Creator | create a deal; cancel it while it is a draft; close it once settled (the rent comes back) | change the rules, touch funded money |
| Funder (a party) | deposit exactly the agreed amount, once | withdraw outside a rule |
| Party | sign once | undo a signature |
| Witness | one vote per check; on a bounty a yes vote names the winner | move money, change the check, vote twice |
| Anyone | execute a rule whose conditions all hold | execute anything else, pay anyone but the parties |
| Authors | upgrade the program while the upgrade authority exists | change anything once the authority is revoked |

The authors have no other power: the program has no admin instruction and no fee on deals. The only fixed address in it is the revenue address of the optional AI subscription (below), which has nothing to do with the money of a deal.

The upgrade authority of the devnet program is still held by the deploy wallet. It is revoked with `solana program set-upgrade-authority 6uhLn2f5NZzydXocLTaxhGYKZ2pQQvrhrbwyMmM9YsCk --final` after the last deploy. Check the current state yourself: `solana program show 6uhLn2f5NZzydXocLTaxhGYKZ2pQQvrhrbwyMmM9YsCk --url devnet` prints `Authority: none` once it is done.

## Where things are

| Path | What |
|---|---|
| `programs/pact/src/` | The on-chain program (Anchor 1.1.2). `lib.rs` entry points, `state.rs` account and the condition evaluation, `instructions/` one file per instruction, `errors.rs`, `events.rs`, `subscription.rs` |
| `programs/pact/src/instructions/execute.rs` | The place where the intermediary is gone: checks the rule, pays the parties |
| `programs/pact/src/instructions/create_deal.rs` | All validation, including the required time-only exit rule |
| `tests/` | Program tests on a local validator (Surfpool), `make test` |
| `packages/sdk/` | TypeScript client: IDL, program id, deal spec schema and validation, templates, rule evaluator, instruction builders, Explorer links |
| `apps/web/` | The web app (React, Vite): deal pages, fund, sign, vote, execute, cancel, close; the deal builder (templates, blocks, a simulator, an AI draft box) that creates and funds a deal |
| `apps/witness/` | Witness node: reads funded deals from the chain, verifies a web page, CI result or merged pull request, votes with its own key, then executes the rule that vote unlocks |
| `backend/` | Small stateless AI helper: turns a sentence into a draft deal. No keys, no money, no database |
| `scripts/` | Wallet, deploy and the devnet smoke script |

### Instructions of the program

| Instruction | Signer | Effect |
|---|---|---|
| `create_deal` | creator | creates the deal in `Draft` after validation |
| `fund` | the funder party | moves the agreed amount into the deal, status `Funded` |
| `signal` | a party | records that party's signature once |
| `attest` | a witness of the check | records one yes or no vote; on a bounty a yes names the winner |
| `execute` | anyone | if every condition of the chosen rule holds, pays the shares and marks the deal `Settled` |
| `cancel` | creator | deletes a draft |
| `close` | creator | deletes a settled deal and returns the rent |
| `subscribe` | user | pays for the optional AI tier, see below |

## Run it

Needs macOS or Linux. `make setup` installs Rust, the Solana CLI, Anchor, Surfpool and bun (idempotent), then installs the packages.

```
make setup          toolchain and dependencies
make test           builds the program and runs the program tests on Surfpool
make check          formatters, clippy, build, type checks
make dev            web app on http://localhost:5173, reads devnet (a deployed copy runs at https://pact.qwontie.dev)
make backend-dev    AI helper on http://localhost:8000, needs GEMINI_API_KEY in .env
make witness        witness node (creates its own key on first start)
```

The web app needs a Solana wallet browser extension set to devnet. Test SOL: https://faucet.solana.com. An RPC key is optional: set `RPC_URL` in `.env` (and `VITE_RPC_URL` for the web app); without it the public devnet endpoint is used and it rate limits.

### Devnet smoke

`make smoke-devnet` runs three real scenarios against the deployed program with six demo wallets and prints an Explorer link for every transaction:

1. Gig: create, fund, two reviewer votes, execute (the freelancer is paid), close.
2. Refund: create, fund, wait for a 20 second deadline, a third wallet executes the exit rule and the client is refunded, close.
3. Bounty: create, fund, two reviewers name the same winner, execute, close.

To run it on your own wallets:

```
make keys           creates .keys/ with the program key and the six wallets
make airdrop        asks the faucet for SOL for the treasury wallet (retries; or use faucet.solana.com)
bash scripts/topup.sh 0.1    gives the five other wallets 0.1 SOL each from the treasury
make smoke-devnet
```

Each run moves 0.01 SOL between the demo wallets and returns all rent with `close`. 
## What was checked

| Claim | How it was checked |
|---|---|
| The program is deployed on devnet at the id above | `solana program show` against devnet |
| Gig, refund and bounty settle on devnet | three smoke runs; every transaction confirmed with status Ok (`solana confirm -v <signature> --url devnet`) |
| Anyone can execute | in the refund run a reviewer's wallet, not a paid party, sends `execute`; program test "refunds the client after the deadline, executed by anyone" |
| A deal without a time-only exit is refused | program test "refuses a deal without an exit rule" |
| Nobody can move funded money outside a rule | `execute.rs` holds the only lamport debit (`grep -rn sub_lamports programs/`); `cancel` refuses unless draft, `close` refuses unless settled |
| Program tests | 29 tests in `tests/pact.ts`, SDK tests in `packages/sdk/test`, witness tests in `apps/witness/test` |

## Honest limits

- **The chain does not know facts, it counts votes.** A check is a statement and a list of keys. If M of the listed witnesses lie or collude, the check passes. In a gig the money can only go to the parties named in the deal, so the worst a colluding majority can do is pay the contributor. In a bounty the reviewers name the winner, so a colluding majority can name any address that is not already a party, including their own. The people who fund see the reviewers before they lock the money.
- **Silent reviewers refund the funder.** If the reviewers never vote, the exit rule returns the money to the funder, even if the work was delivered. The contributor carries that risk and should read the reviewers list before starting.
- **Witness nodes are ordinary programs run by people.** In our demo every witness key belongs to us. An automatic check proves that a page contains a text, that CI is green or that a pull request is merged; it does not prove the work is good, and whoever controls the page controls the fact.
- **Rules race.** The first true rule that is executed wins. After the deadline of a gig both the "reviewers approved" rule and the refund rule can be true. A running witness node executes the payout right after the vote, but it polls every 20 seconds or more, and a deal with only human reviewers has no node: the contributor should execute the payout before the deadline.
- **Someone has to send `execute`.** Anyone can, and a running witness node does it right after the vote that unlocks the rule, but nobody is paid to. For a refund after the deadline or a signature rule, the recipient presses the button.
- **SOL only.** No token accounts yet.
- **The exit date has no upper bound.** The funder reads it before locking the money.
- **A lost key is a lost refund.** Payouts go to the addresses in the deal.
- **Fixed-size accounts.** A deal account is 2231 bytes, about 0.012 SOL of rent on devnet, returned by `cancel` or `close`. A deal with every limit at its maximum does not fit into one transaction.
- **Plain transfers to a deal account are not recoverable.** `execute` pays exactly the agreed amount.
- **Devnet only, not audited.** Time comes from the cluster clock, which can differ from wall time by seconds.
- **The upgrade authority is not revoked yet.** See Permissions.
- **The AI helper can be wrong.** It suggests a draft; the draft is validated, shown as blocks and signed by the user. The text goes to a hosted model (Gemini). It never fills an address that is not in the user's text or wallet. Without it, the templates and blocks still work.
- **The optional paid tier** (0.05 SOL for 30 days) raises the AI draft limit from 10 per day to unlimited. The payment is on chain, but the limit is enforced by our backend, which reads your subscription from the chain. It has no effect on deals.

## What is next

- USDC and other tokens as the vault asset.
- Witness stake and slashing, so a witness has something to lose.
- A keeper that executes a rule the moment it becomes true.
- Splitting a bounty among submitters registered on chain, instead of refunding when reviewers are silent.
- A price feed as a first-class condition (Switchboard).
- Many funders per deal (crowdfunding with a conditional refund).
