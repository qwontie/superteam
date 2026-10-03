SHELL := /bin/bash
export PATH := $(HOME)/.local/share/solana/install/active_release/bin:$(HOME)/.avm/bin:$(HOME)/.cargo/bin:$(HOME)/.local/bin:$(HOME)/.bun/bin:$(PATH)

.PHONY: setup install fmt check build test dev backend-dev witness keys balances airdrop topup deploy-devnet smoke-devnet pre-deploy deploy prod prod-logs prod-witness-logs demo-deals demo-deals-status demo-clean demo-vote demo-deliver demo-undeliver demo-wallets demo-topup demo-preflight

PROD_HOST ?= personal-main-contabo
PROD_DIR ?= /root/superteam

setup:
	bash scripts/setup.sh

install:
	bun install

fmt:
	cargo fmt --all
	bunx biome check --write .
	$(MAKE) -C backend fmt

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
	$(MAKE) -C backend check

test: build
	anchor test --skip-build

dev:
	bun run --filter web dev

backend-dev:
	$(MAKE) -C backend dev

witness:
	bun run --cwd apps/witness start

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

smoke-devnet:
	bash scripts/smoke-devnet.sh

pre-deploy:
	docker compose --profile services build

deploy: pre-deploy
	docker compose --profile services up -d --remove-orphans

prod:
	git fetch origin main
	git bundle create - origin/main | ssh $(PROD_HOST) 'cd $(PROD_DIR) && cat > .git/prod.bundle && git fetch -q .git/prod.bundle refs/remotes/origin/main && rm .git/prod.bundle && git merge -q --ff-only FETCH_HEAD && make deploy && docker exec caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile && git log -1 --format="deployed %h %s"'

prod-logs:
	ssh -t $(PROD_HOST) 'cd $(PROD_DIR) && docker compose logs -f --tail=100'

prod-witness-logs:
	ssh -t $(PROD_HOST) 'cd $(PROD_DIR) && docker compose logs -f --tail=50 witness1 witness2 witness3'

demo-deals:
	source scripts/env.sh && bun scripts/demo-deals.ts create $(KINDS)

demo-deals-status:
	source scripts/env.sh && bun scripts/demo-deals.ts status

demo-clean:
	source scripts/env.sh && bun scripts/demo-deals.ts clean

demo-vote:
	source scripts/env.sh && bun scripts/demo-deals.ts vote $(DEAL) $(AS) $(NOMINEE)

demo-deliver:
	source scripts/env.sh && bun scripts/demo-deals.ts deliver "$(TEXT)"

demo-undeliver:
	source scripts/env.sh && bun scripts/demo-deals.ts undeliver

demo-wallets:
	source scripts/env.sh && bun scripts/demo-wallets.ts check

demo-topup:
	source scripts/env.sh && bun scripts/demo-wallets.ts topup

demo-preflight:
	source scripts/env.sh && bun scripts/demo-preflight.ts
