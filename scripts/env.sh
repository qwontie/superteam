#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$HOME/.cargo/bin:$HOME/.local/bin:$HOME/.bun/bin:$PATH"

REPO_ROOT="$(git rev-parse --show-toplevel)"
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
KEYS_DIR="${KEYS_DIR:-$MAIN_ROOT/.keys}"
ENV_FILE="$MAIN_ROOT/.env"
if [ -z "${RPC_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  RPC_URL="$(sed -n 's/^RPC_URL=//p' "$ENV_FILE" | tr -d "\"'" | head -n 1)"
fi
CLUSTER_URL="${CLUSTER_URL:-${RPC_URL:-https://api.devnet.solana.com}}"
WALLETS=(treasury client freelancer witness1 witness2 witness3)
PROGRAM_KEYPAIR="$KEYS_DIR/pact-keypair.json"

export REPO_ROOT MAIN_ROOT KEYS_DIR CLUSTER_URL PROGRAM_KEYPAIR
