#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

fail() {
  printf 'VibeFlare install: %s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail 'Node.js 22+ is required: https://nodejs.org/'
node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) process.exit(1);
' || fail "Node.js 22.12+ is required (found $(node --version))"
command -v bun >/dev/null 2>&1 || fail 'Bun is required to build the vf CLI: https://bun.sh/'

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  PNPM=(corepack pnpm)
else
  fail 'pnpm is required. Install pnpm or enable Corepack: https://pnpm.io/installation'
fi

printf 'Installing VibeFlare dependencies...\n'
"${PNPM[@]}" install --frozen-lockfile
printf 'Building vf...\n'
"${PNPM[@]}" --filter @vibeflare/cli build

BIN_DIR="${VIBEFLARE_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BIN_DIR"
install -m 0755 apps/cli/bin/vf "$BIN_DIR/vf"
ln -sf "$BIN_DIR/vf" "$BIN_DIR/vibeflare"

printf '\nVibeFlare is installed.\n'
printf '  Local command: %s/vf\n' "$ROOT"
printf '  User command:  %s/vf\n' "$BIN_DIR"
if [[ ":${PATH}:" != *":${BIN_DIR}:"* ]]; then
  printf '\n%s is not currently on PATH. You can still use ./vf, or add this line to your shell profile:\n' "$BIN_DIR"
  printf '  export PATH="%s:$PATH"\n' "$BIN_DIR"
fi
printf '\nNext: ./vf setup\n'
