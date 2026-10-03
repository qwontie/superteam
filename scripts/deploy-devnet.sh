#!/usr/bin/env bash
source "$(dirname "$0")/env.sh"

if [ ! -f "$PROGRAM_KEYPAIR" ]; then
  echo "missing $PROGRAM_KEYPAIR: devnet deploys run only on the machine that holds the program key"
  exit 1
fi

solana program deploy "$REPO_ROOT/target/deploy/pact.so" \
  --program-id "$PROGRAM_KEYPAIR" \
  --keypair "$KEYS_DIR/treasury.json" \
  --url "$CLUSTER_URL"
solana program show "$(solana-keygen pubkey "$PROGRAM_KEYPAIR")" --url "$CLUSTER_URL"
