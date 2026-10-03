#!/usr/bin/env bash
source "$(dirname "$0")/env.sh"

SOLANA_VERSION=3.1.10
ANCHOR_VERSION=1.1.2
PLATFORM_TOOLS=v1.57

if ! command -v rustup > /dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
(cd "$REPO_ROOT" && rustup show active-toolchain > /dev/null 2>&1 || rustup toolchain install)

if ! solana --version 2> /dev/null | grep -q "$SOLANA_VERSION"; then
  sh -c "$(curl -sSfL "https://release.anza.xyz/v$SOLANA_VERSION/install")"
fi

if ! command -v avm > /dev/null; then
  cargo install --git https://github.com/otter-sec/anchor avm --force
fi
if ! anchor --version 2> /dev/null | grep -q "$ANCHOR_VERSION"; then
  avm install "$ANCHOR_VERSION"
  avm use "$ANCHOR_VERSION"
fi

if [ ! -x "$HOME/.cache/solana/$PLATFORM_TOOLS/platform-tools/rust/bin/rustc" ]; then
  if ! cargo build-sbf --tools-version "$PLATFORM_TOOLS" --install-only; then
    case "$(uname -s)-$(uname -m)" in
      Darwin-arm64) asset=osx-aarch64 ;;
      Darwin-x86_64) asset=osx-x86_64 ;;
      Linux-aarch64 | Linux-arm64) asset=linux-aarch64 ;;
      *) asset=linux-x86_64 ;;
    esac
    dir="$HOME/.cache/solana/$PLATFORM_TOOLS/platform-tools"
    rm -rf "$dir" && mkdir -p "$dir"
    curl -sSfL "https://github.com/anza-xyz/platform-tools/releases/download/$PLATFORM_TOOLS/platform-tools-$asset.tar.bz2" | tar -xj -C "$dir"
  fi
fi

if ! command -v surfpool > /dev/null; then
  curl -sL https://run.surfpool.run/ | bash
fi

if ! command -v bun > /dev/null; then
  curl -fsSL https://bun.sh/install | bash
fi

if [ ! -f "$HOME/.config/solana/id.json" ]; then
  solana-keygen new --no-bip39-passphrase --silent --outfile "$HOME/.config/solana/id.json"
fi

(cd "$REPO_ROOT" && bun install)

echo "rustc:    $(cd "$REPO_ROOT" && rustc --version)"
echo "solana:   $(solana --version)"
echo "anchor:   $(anchor --version)"
echo "surfpool: $(surfpool --version)"
echo "bun:      $(bun --version)"
echo "node:     $(node --version 2> /dev/null || echo missing)"
