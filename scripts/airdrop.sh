#!/usr/bin/env bash
source "$(dirname "$0")/env.sh"

amount="${1:-2}"
tries="${2:-10}"
pause="${3:-30}"
treasury="$(solana-keygen pubkey "$KEYS_DIR/treasury.json")"

for i in $(seq 1 "$tries"); do
  if solana airdrop "$amount" "$treasury" --url "$CLUSTER_URL"; then
    solana balance "$treasury" --url "$CLUSTER_URL"
    exit 0
  fi
  echo "airdrop attempt $i of $tries failed, waiting ${pause}s"
  sleep "$pause"
done
echo "faucet refused; fund $treasury at https://faucet.solana.com"
exit 1
