SHELL := /bin/bash
export PATH := $(HOME)/.local/share/solana/install/active_release/bin:$(HOME)/.avm/bin:$(HOME)/.cargo/bin:$(HOME)/.local/bin:$(HOME)/.bun/bin:$(PATH)

.PHONY: setup install fmt check build test dev witness keys balances airdrop topup deploy-devnet ping-devnet

setup:
	bash scripts/setup.sh

install:
	bun install

fmt:
	cargo fmt --all
	bunx biome check --write .

build:
	bash scripts/program-key.sh
	anchor build
	cp target/idl/pact.json target/types/pact.ts packages/sdk/src/idl/

check: build
	cargo fmt --all -- --check
	cargo clippy --all-targets -- -D warnings
	bunx biome check .
	bunx tsc -p tsconfig.json
	bun run --workspaces --if-present typecheck

test: build
	anchor test --skip-build

dev:
	bun run --filter web dev

witness:
	bun run --filter witness start

keys:
	bash scripts/keys.sh

balances:
	bash scripts/balances.sh

airdrop:
	bash scripts/airdrop.sh

topup:
	bash scripts/topup.sh

deploy-devnet: build
	bash scripts/deploy-devnet.sh

ping-devnet:
	bash scripts/ping-devnet.sh
