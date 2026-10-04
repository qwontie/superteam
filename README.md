# Pact

![Solana](https://img.shields.io/badge/solana-%239945FF.svg?style=for-the-badge&logo=solana&logoColor=white) ![Rust](https://img.shields.io/badge/rust-%23000000.svg?style=for-the-badge&logo=rust&logoColor=white) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) ![Python](https://img.shields.io/badge/python-%233670A0.svg?style=for-the-badge&logo=python&logoColor=ffdd54) ![Google Gemini](https://img.shields.io/badge/google%20gemini-%238E75B2.svg?style=for-the-badge&logo=google%20gemini&logoColor=white)

Pay for work with the money already locked. Pact holds the payment for a gig or a bounty in an on-chain vault from the moment it is posted and releases it by rules everybody can read: the votes of the reviewers named in the deal, a signature, or a date. Nobody holds the money in between, nobody approves the payout, and every deal has a time-only exit, so it can never get stuck. One Anchor program on Solana devnet, no admin key, no fee.

Built for HackYeah 2026, challenge "Finance Without Intermediaries" by Superteam Poland.

**How it works, who can do what, what was checked and the honest limits: [HOW-IT-WORKS.md](HOW-IT-WORKS.md).**

**Going to production with real money on mainnet, or deploying your own copy from scratch: [DEPLOYMENT.md](DEPLOYMENT.md).**

## Demo

https://pact.qwontie.dev runs against Solana devnet. You need a Solana wallet extension switched to devnet and test SOL from https://faucet.solana.com. No real money moves anywhere.

| | |
|---|---|
| Program `pact` | [`6uhLn2f5NZzydXocLTaxhGYKZ2pQQvrhrbwyMmM9YsCk`](https://explorer.solana.com/address/6uhLn2f5NZzydXocLTaxhGYKZ2pQQvrhrbwyMmM9YsCk?cluster=devnet) |
| Program `pact_gate` | [`CYb16ChX7J5LPB6nv8HtPVmLE72cjhgHpKCxoujrgUmn`](https://explorer.solana.com/address/CYb16ChX7J5LPB6nv8HtPVmLE72cjhgHpKCxoujrgUmn?cluster=devnet) |

## Modules

| Module | What it does |
|---|---|
| Deals | create, fund, sign, vote, execute, cancel and close a deal, every step a transaction on Explorer |
| Templates | gig with reviewers, bounty with an open winner slot, silence is consent |
| Builder | rules as blocks: WHEN conditions THEN pay out by shares, with a simulator before signing |
| AI draft | one sentence in, a draft deal out; validated and shown as blocks, the user signs it |
| Witness node | checks a web page, CI or a merged pull request, votes with its own key and executes the rule its vote unlocks |
| Gate | turns a signed Switchboard quote into a witness vote on chain |

## Stack

| Part | Directory | Technology |
|---|---|---|
| Programs | `programs/` | Rust, Anchor 1.1.2, Solana devnet |
| SDK | `packages/sdk/` | TypeScript, `@solana/kit` |
| Web app | `apps/web/` | React 19, Vite, TanStack Router, Tailwind |
| Witness | `apps/witness/` | Bun, Switchboard On-Demand |
| AI helper | `backend/` | Python 3.13, FastAPI, Pydantic AI, Google Gemini |
| Proxy | `caddy/` | Caddy with HTTPS |

The web app and the AI helper run in Docker Compose. The helper holds no keys, no money and no database.

## Run locally

Needs macOS or Linux. `make setup` installs Rust, the Solana CLI, Anchor, Surfpool and bun, then the packages.

```sh
make setup
make test           # builds the program, runs the program tests on Surfpool
make dev            # web app on http://localhost:5173 against devnet
make backend-dev    # AI helper on http://localhost:8000, needs GEMINI_API_KEY in .env
make witness        # witness node, creates its own key on first start
```

An RPC key is optional: set `RPC_URL` in `.env` (and `VITE_RPC_URL` for the web app); without it the public devnet endpoint is used and it rate limits. `make smoke-devnet` runs a gig, a refund and a bounty end to end on devnet, see [HOW-IT-WORKS.md](HOW-IT-WORKS.md#devnet-smoke).

For developers: `make fmt` formats, `make check` runs rustfmt, clippy, biome, the type checks and the backend linters.

## Disclosure

The code was written by AI agents led by the four-person team Qwontie, who designed the solution, checked it and are responsible for the result. Devnet only, not audited.
