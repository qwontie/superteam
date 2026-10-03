#!/usr/bin/env bash
source "$(dirname "$0")/env.sh"

target="${1:-0.5}"
treasury="$KEYS_DIR/treasury.json"

for name in "${WALLETS[@]:1}"; do
  pubkey="$(solana-keygen pubkey "$KEYS_DIR/$name.json")"
  balance="$(solana balance "$pubkey" --url "$CLUSTER_URL" | awk '{print $1}')"
  need="$(echo "$target - $balance" | bc -l)"
  if [ "$(echo "$need > 0" | bc -l)" -eq 1 ]; then
    solana transfer "$pubkey" "$need" --from "$treasury" --fee-payer "$treasury" \
      --allow-unfunded-recipient --url "$CLUSTER_URL" > /dev/null
    echo "$name +$need SOL"
  else
    echo "$name already has $balance SOL"
  fi
done
