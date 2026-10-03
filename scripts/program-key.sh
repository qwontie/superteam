#!/usr/bin/env bash
source "$(dirname "$0")/env.sh"

if [ -f "$PROGRAM_KEYPAIR" ]; then
  mkdir -p "$REPO_ROOT/target/deploy"
  cp "$PROGRAM_KEYPAIR" "$REPO_ROOT/target/deploy/pact-keypair.json"
fi
