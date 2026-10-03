#!/usr/bin/env bash
source "$(dirname "$0")/env.sh"

for name in "${WALLETS[@]}"; do
  file="$KEYS_DIR/$name.json"
  pubkey="$(solana-keygen pubkey "$file")"
  printf '%-12s %s %s\n' "$name" "$pubkey" "$(solana balance "$pubkey" --url "$CLUSTER_URL")"
done
