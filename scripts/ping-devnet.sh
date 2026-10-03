#!/usr/bin/env bash
source "$(dirname "$0")/env.sh"

bun "$REPO_ROOT/scripts/ping-devnet.ts"
