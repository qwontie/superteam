#!/usr/bin/env bash
source "$(dirname "$0")/env.sh"

mkdir -p "$KEYS_DIR"
chmod 700 "$KEYS_DIR"

for name in pact-keypair "${WALLETS[@]}"; do
  file="$KEYS_DIR/$name.json"
  if [ ! -f "$file" ]; then
    solana-keygen new --no-bip39-passphrase --silent --outfile "$file"
    chmod 600 "$file"
    echo "created $name"
  fi
  printf '%-12s %s\n' "$name" "$(solana-keygen pubkey "$file")"
done
