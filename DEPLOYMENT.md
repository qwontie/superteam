# Deployment

How to run Pact in production with real money on Solana mainnet, starting either from the devnet demo at https://pact.qwontie.dev or from an empty server.

Read this first:

- **The programs are not audited.** Get an audit of `programs/pact` and `programs/pact_gate` before real users lock real SOL.
- **Devnet is pinned in the code today, not in a config file.** Moving to mainnet is a short list of edits, listed in full in [step 3](#3-point-the-code-at-mainnet). Do them all; a half-switched build shows devnet state or sends transactions to the wrong cluster.
- **The demo and prod are separate deployments.** Deals on devnet stay on devnet. Nothing is migrated: on mainnet you deploy new programs and users create new deals.

## What gets deployed

| Part | Where it runs | Holds keys | Needs SOL |
|---|---|---|---|
| `pact` program | Solana mainnet | upgrade authority (until revoked) | about 1.5 SOL rent, once |
| `pact_gate` program | Solana mainnet | upgrade authority (until revoked) | about 0.65 SOL rent, once |
| Web app (`apps/web`) | Docker, static files behind Caddy | no | no |
| AI helper (`backend`) | Docker, behind Caddy at `/api` | no wallet keys, only `GEMINI_API_KEY` | no |
| Witness nodes (`apps/witness`) x3 | Docker, same server or anywhere | one wallet each | fees, about 0.05 SOL each |
| Caddy | Docker, ports 80 and 443 | TLS certificates | no |

Rent figures are the sizes of the devnet builds (290 973 and 127 237 bytes) at devnet rates. Check the exact number with `solana rent <bytes> --url mainnet-beta`. A deploy writes the program into a temporary buffer of the same size first, so the deployer wallet needs about twice the rent while it runs; the buffer is refunded.

## 0. What you need

- A Linux or macOS machine to build and deploy the programs, with this repository.
- A Linux server with Docker and the Compose plugin, ports 80 and 443 open.
- A domain with an `A` record pointing to the server, for example `pact.example.com`.
- A paid mainnet RPC endpoint (Helius, Triton, QuickNode or similar). The public `api.mainnet-beta.solana.com` rate limits too hard for the app and the witness nodes.
- A Gemini API key for the AI draft (https://aistudio.google.com/apikey). Optional: without it the AI box fails and templates and blocks still work.
- About 5 SOL on a fresh deployer wallet: rent for both programs, the deploy buffers, fees and witness top-ups.

## 1. Install the toolchain

On the build machine, in the repository root:

```sh
make setup        # Rust, Solana CLI 3.1.10, Anchor 1.1.2, Surfpool, bun, packages
make test         # builds the programs and runs the program tests locally
```

Both must pass before you go further.

## 2. Create the production keys

Never reuse the demo keys from `.keys/` of the hackathon machines on mainnet. Create new ones in a separate folder that is never committed (`.keys/` is already in `.gitignore`):

```sh
mkdir -p .keys-prod && chmod 700 .keys-prod
solana-keygen new -o .keys-prod/deployer.json            # pays rent, holds the upgrade authority
solana-keygen new -o .keys-prod/pact-keypair.json        # address of the pact program
solana-keygen new -o .keys-prod/pact_gate-keypair.json   # address of the pact_gate program
solana-keygen new -o .keys-prod/treasury.json            # receives the optional AI subscription payments
solana-keygen new -o .keys-prod/witness1.json
solana-keygen new -o .keys-prod/witness2.json
solana-keygen new -o .keys-prod/witness3.json
chmod 600 .keys-prod/*.json
for f in .keys-prod/*.json; do printf '%-28s %s\n' "$f" "$(solana-keygen pubkey "$f")"; done
```

Write the printed addresses down, they are used in the next step. Back up the seed phrases offline. The deployer and the treasury are the valuable ones; for the treasury, a hardware wallet or a Squads multisig address is better than a file (you only need its public address in step 3).

## 3. Point the code at mainnet

Make these edits on a release branch. Every line below is a place where a devnet value is written in the code today.

**Program addresses** (use the addresses from step 2):

| File | Change |
|---|---|
| `programs/pact/src/lib.rs` | `declare_id!(...)` to the new `pact` address |
| `programs/pact_gate/src/lib.rs` | `declare_id!(...)` to the new `pact_gate` address; `PACT_PROGRAM` to the new `pact` address |
| `Anchor.toml` | both addresses in `[programs.localnet]` (the tests deploy there) and a new `[programs.mainnet]` section with the same two lines |
| `packages/sdk/src/gate.ts` | `PACT_GATE_PROGRAM_ID` to the new `pact_gate` address |
| `backend/src/utils/env.py` | default `program_id` to the new `pact` address (or set `SOLANA__PROGRAM_ID` in `.env`, step 5) |

`packages/sdk/src/client.ts` reads the `pact` address from the IDL, and `make build` regenerates the IDL from `declare_id!`, so the SDK and the web app follow automatically.

**Subscription revenue address** (the optional AI tier, 0.05 SOL for 30 days):

| File | Change |
|---|---|
| `programs/pact/src/subscription.rs` | `REVENUE` to your treasury address |
| `packages/sdk/src/subscription.ts` | the same address |
| `tests/pact.ts` | the `REVENUE` constant in the `subscription` tests, so `make test` stays green |

The price `PRICE_LAMPORTS` is in the same Rust file. It cannot be changed after the upgrade authority is revoked (step 9).

**Switchboard (the oracle gate)** uses the devnet queue and the devnet build of the Switchboard crate:

| File | Change |
|---|---|
| `programs/pact_gate/Cargo.toml` | drop `"devnet"` from the `features` of `switchboard-on-demand` |
| `programs/pact_gate/src/lib.rs` | `SWITCHBOARD_QUEUE` to the Switchboard On-Demand mainnet queue |
| `packages/sdk/src/gate.ts` | `SWITCHBOARD_DEVNET_QUEUE` to the same mainnet queue |

The mainnet queue at the time of writing is `A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w`. Confirm it in the Switchboard docs before you deploy; a wrong queue makes every gate check fail, it does not move money.

**Witness nodes** that the builder offers as "Pact witness nodes":

| File | Change |
|---|---|
| `packages/sdk/src/demo.ts` | the three addresses in `DEMO_WITNESS_NODES` to `witness1..3` from step 2 |
| `backend/src/services/deal/facts.py` | the same three addresses |

**Cluster in the web app:**

| File | Change |
|---|---|
| `apps/web/src/lib/solana.ts` | `CLUSTER = "mainnet-beta"`; the fallback RPC to `https://api.mainnet-beta.solana.com`; `walletSigner({ chain: "solana:mainnet" })` |
| `apps/web/src/lib/use-cluster.ts` | the genesis hash to `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` (mainnet) and the chain to `solana:mainnet` |
| `apps/web/src/components/shell/devnet-badge.tsx`, `network-banner.tsx` | remove the devnet badge, reword the banner to "mainnet" |
| texts | `grep -rn devnet apps/web/src` lists every user-facing sentence that says devnet or test SOL (wallet button, errors, deal list, privacy page); change each to mainnet |

Explorer links in the app are built from `CLUSTER` (`?cluster=mainnet-beta` opens mainnet Explorer), so they follow this change.

**Cluster in the witness node:**

| File | Change |
|---|---|
| `apps/witness/src/config.ts` | `PUBLIC_DEVNET` to the mainnet URL; `clusterOf` to return `"mainnet-beta"` instead of `"devnet"` (only Explorer links in the logs depend on it) |

**Cluster in the backend:** `backend/src/utils/env.py`, the fallback `https://api.devnet.solana.com` in `solana_rpc` to the mainnet URL. In practice `RPC_URL` from `.env` always wins.

Then build and check everything:

```sh
mv .keys .keys-devnet 2> /dev/null || true    # make build copies a .keys/pact-keypair.json over the new one
mkdir -p target/deploy
cp .keys-prod/pact-keypair.json      target/deploy/pact-keypair.json
cp .keys-prod/pact_gate-keypair.json target/deploy/pact_gate-keypair.json
make check            # builds both programs, copies the new IDL into the SDK, runs every linter and type check
make test             # program tests on a local validator
anchor keys list      # must print the two new addresses from step 2
grep -rn "6uhLn2f5\|CYb16ChX\|3p4TEJLZ\|EYiAmGSd" --exclude-dir=node_modules --exclude-dir=target --exclude-dir=docs .
```

The last command must print nothing except lines in `README.md`, `HOW-IT-WORKS.md` and this file, which describe the devnet demo.

## 4. Deploy the programs to mainnet

Fund the deployer with about 5 SOL, then:

```sh
export RPC=https://your-mainnet-rpc-url
solana balance --keypair .keys-prod/deployer.json --url "$RPC"

solana program deploy target/deploy/pact.so \
  --program-id .keys-prod/pact-keypair.json \
  --keypair .keys-prod/deployer.json \
  --url "$RPC" \
  --with-compute-unit-price 50000 \
  --max-sign-attempts 50

solana program deploy target/deploy/pact_gate.so \
  --program-id .keys-prod/pact_gate-keypair.json \
  --keypair .keys-prod/deployer.json \
  --url "$RPC" \
  --with-compute-unit-price 50000 \
  --max-sign-attempts 50

solana program show "$(solana-keygen pubkey .keys-prod/pact-keypair.json)" --url "$RPC"
solana program show "$(solana-keygen pubkey .keys-prod/pact_gate-keypair.json)" --url "$RPC"
```

`solana program show` must print both programs with `Authority` equal to the deployer address.

If a deploy stops halfway (network, fees), the SOL sits in a buffer account. `solana program show --buffers --keypair .keys-prod/deployer.json --url "$RPC"` lists it; rerun the same deploy, or `solana program close --buffers --keypair .keys-prod/deployer.json --url "$RPC"` to get the SOL back.

## 5. Prepare the server

On the server, as a user that can run Docker (`git` and `make` installed):

```sh
git clone https://github.com/qwontie/superteam.git /opt/pact
cd /opt/pact
git checkout <your release branch or tag>
docker network create caddy
mkdir -p .keys && chmod 700 .keys
```

Copy only the three witness keys to the server, nothing else from `.keys-prod/`:

```sh
scp .keys-prod/witness1.json .keys-prod/witness2.json .keys-prod/witness3.json server:/opt/pact/.keys/
ssh server 'chmod 600 /opt/pact/.keys/*.json'
```

Create `/opt/pact/.env` (mode 600, never in git):

```sh
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
COMPOSE_PROFILES=services

RPC_URL=https://your-mainnet-rpc-url
VITE_RPC_URL=https://your-mainnet-rpc-url-for-browsers

GEMINI_API_KEY=your-gemini-key
SOLANA__PROGRAM_ID=your-new-pact-address

WITNESS_GITHUB_TOKEN=
WITNESS_POLL_SECONDS=20
```

- `RPC_URL` is used by the backend and the witness nodes and stays on the server.
- `VITE_RPC_URL` is built into the public JavaScript, so anyone can read it. Use a separate key that your RPC provider restricts to your domain, or an endpoint without a secret.
- `WITNESS_GITHUB_TOKEN` is optional: a read-only GitHub token raises the rate limit for the `github_checks` and `github_pr_merged` checks.
- Every other backend setting has a safe default; the full list with defaults is in `backend/.env.example` (rate limits, free AI drafts per day, model).

## 6. Remove the demo-only parts

These exist only for the hackathon demo and do not belong in production:

- `docker-compose.prod.yml`: delete the `demo-page` service. It serves a page the demo deals check.
- `caddy/site.caddy`: delete the `handle_path /proof/* { ... }` block that routes to it.
- Do not run the `make demo-*`, `make smoke-devnet`, `make airdrop` or `make topup` targets against mainnet. They create test deals with the demo wallets.

## 7. Start everything

On the server, in `/opt/pact`:

```sh
make deploy                 # builds the images and starts api, web and witness1..3
docker compose ps           # all five containers "running"
docker compose logs --tail=20 witness1 witness2 witness3
```

Each witness prints its address and `program <your pact address> on mainnet-beta` on start. Fund each witness address with about 0.05 SOL: it pays the fee of every vote and execute it sends.

Then start Caddy, which gets the HTTPS certificate for your domain:

```sh
cd /opt/pact/caddy
cp Caddyfile.example Caddyfile
echo "SUPERTEAM_DOMAIN=pact.example.com" > .env
docker compose up -d
docker compose logs --tail=50 caddy      # look for "certificate obtained successfully"
```

If the domain is proxied by Cloudflare, also put `CLOUDFLARE_API_TOKEN=...` (DNS edit rights on the zone) in `caddy/.env` and add `acme_dns cloudflare {env.CLOUDFLARE_API_TOKEN}` to the global block at the top of `caddy/Caddyfile`. If you already run a Caddy on that server, see `caddy/README.md` to plug `site.caddy` into it instead.

## 8. Check it on mainnet with a small amount

From a normal browser, with a wallet on mainnet and a little SOL:

1. `https://pact.example.com` opens, shows no devnet badge and no network warning. `https://pact.example.com/api/health` answers.
2. Create a gig from the template for 0.01 SOL: you as the client, a second wallet of yours as the freelancer, the three witness nodes as reviewers with threshold 2. Fund it.
3. The deal page shows the money in the vault. Open the Explorer link: it opens mainnet Explorer, not devnet.
4. Sign as the client: the "client signed" rule becomes true. Execute it: the freelancer wallet receives 0.01 SOL. Close the deal to get the rent back.
5. Create a second deal with a 2 minute deadline, fund it, wait, execute the exit rule from a third wallet: the client is refunded.
6. Type one sentence into the AI box on `/new`: a draft deal appears as blocks.

Every step must succeed before you announce the launch.

## 9. Lock the programs

As long as the deployer holds the upgrade authority, whoever has that key can replace the program code, and with it every rule of every deal. Choose one and do it right after step 8:

- **Revoke (no more upgrades ever).** Bugs can no longer be fixed in place; a fix means a new program and new deals.

  ```sh
  solana program set-upgrade-authority <pact address> --final --keypair .keys-prod/deployer.json --url "$RPC"
  solana program set-upgrade-authority <pact_gate address> --final --keypair .keys-prod/deployer.json --url "$RPC"
  ```

- **Hand it to a multisig** (for example a Squads vault with 2 of 3 signers), so no single person can upgrade.

  ```sh
  solana program set-upgrade-authority <pact address> --new-upgrade-authority <multisig vault> --skip-new-upgrade-authority-signer-check --keypair .keys-prod/deployer.json --url "$RPC"
  solana program set-upgrade-authority <pact_gate address> --new-upgrade-authority <multisig vault> --skip-new-upgrade-authority-signer-check --keypair .keys-prod/deployer.json --url "$RPC"
  ```

Check with `solana program show <address> --url "$RPC"`: `Authority: none` after a revoke, the multisig address otherwise. The `pact_gate` program matters as much as `pact`: whoever can upgrade it can make it vote yes on any deal that lists a gate check.

After this, move any SOL left on the deployer to the treasury and store `.keys-prod/` offline.

## Day-to-day operations

**Update the web app, backend or witness** (not the programs):

```sh
cd /opt/pact
git pull --ff-only
make deploy
docker exec caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile    # only if caddy/site.caddy changed
```

`VITE_*` values are baked in at build time: after changing one in `.env`, run `make deploy`, not just a restart.

**Update the programs:** only possible while an upgrade authority exists (step 9). Build as in step 3, then the same `solana program deploy` command as in step 4 (with the multisig, write the buffer with `solana program write-buffer` and approve the upgrade in Squads). If the new build is bigger than the old one, first `solana program extend <address> <extra bytes> --keypair .keys-prod/deployer.json --url "$RPC"`.

**Logs:**

```sh
docker compose logs -f --tail=100 api web
docker compose logs -f --tail=50 witness1 witness2 witness3
```

**Roll back the app:** `git checkout <previous good commit> && make deploy`. Deals on chain are not affected by app deploys or rollbacks: the money and the rules live in the program.

**Witness balances:** each vote and execute costs a fee. Check them weekly with `solana balance <witness address> --url "$RPC"` and top up below 0.01 SOL. A witness without SOL stops voting, and deals that depend on it fall back to their exit rule.

## Before you go live

- [ ] Programs audited, or users clearly told they are not.
- [ ] Every edit of step 3 done; the `grep` of step 3 prints nothing outside `README.md`, `HOW-IT-WORKS.md` and `DEPLOYMENT.md`.
- [ ] `make check` and `make test` green on the release commit.
- [ ] Both programs deployed, `solana program show` checked.
- [ ] `.env` on the server with mainnet `RPC_URL`, a domain-restricted `VITE_RPC_URL`, the new `SOLANA__PROGRAM_ID`.
- [ ] Demo page and `/proof/*` route removed (step 6).
- [ ] Witnesses running and funded; their addresses match `packages/sdk/src/demo.ts`.
- [ ] HTTPS works on the domain.
- [ ] Every step of the mainnet check (step 8) passed with real wallets.
- [ ] Upgrade authority revoked or held by a multisig (step 9).
- [ ] Deployer and treasury keys backed up offline; nothing from `.keys-prod/` except the witness keys is on the server.
