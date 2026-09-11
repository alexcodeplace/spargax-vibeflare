#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
OUT="$ROOT/release-artifacts"
LOG="$OUT/release-gate.log"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "release verification requires a clean Git worktree" >&2
  exit 2
fi
if [[ "$(git tag --points-at HEAD)" != *"$TAG"* ]]; then
  echo "release verification requires tag $TAG at HEAD" >&2
  exit 2
fi

mkdir -p "$OUT"
: > "$LOG"
set -o pipefail
pnpm release:gate 2>&1 | tee "$LOG"
node tools/release-receipt.mjs "$LOG"
bash tools/build-release-archive.sh "$OUT"
