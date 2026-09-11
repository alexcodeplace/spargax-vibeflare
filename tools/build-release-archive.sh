#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
OUT_DIR="${1:-$ROOT/release-artifacts}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "release archive requires a clean Git worktree" >&2
  exit 2
fi
if ! git rev-parse -q --verify "refs/tags/$TAG^{commit}" >/dev/null; then
  echo "release archive requires tag $TAG" >&2
  exit 2
fi
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "$TAG^{commit}")" ]]; then
  echo "tag $TAG does not point at HEAD" >&2
  exit 2
fi

mkdir -p "$OUT_DIR"
ARCHIVE="$OUT_DIR/vibeflare-${VERSION}.tar.gz"
CHECKSUM="$ARCHIVE.sha256"
TMP="$(mktemp "${TMPDIR:-/tmp}/vibeflare-release.XXXXXX.tar.gz")"
LIST="$(mktemp "${TMPDIR:-/tmp}/vibeflare-release.XXXXXX.list")"
trap 'rm -f "$TMP" "$LIST"' EXIT

git archive --format=tar --prefix="vibeflare-${VERSION}/" "$TAG" | gzip -n -9 > "$TMP"
tar -tzf "$TMP" > "$LIST"

for required in LICENSE README.md CHANGELOG.md THIRD_PARTY_NOTICES.md .env.cli.example wrangler.toml install.sh vf docs/screenshots/vibeflare-landing.png docs/screenshots/vibeflare-chat.png docs/screenshots/vibeflare-key-creation.png docs/screenshots/vibeflare-status-doctor.png; do
  if ! grep -Fxq "vibeflare-${VERSION}/$required" "$LIST"; then
    echo "release archive is missing required file: $required" >&2
    exit 1
  fi
done

FORBIDDEN_LIST="$(mktemp "${TMPDIR:-/tmp}/vibeflare-release.XXXXXX.forbidden")"
trap 'rm -f "$TMP" "$LIST" "$FORBIDDEN_LIST"' EXIT
{
  grep -E '/(\.internal|\.claude|\.slopgate|evaluate|node_modules|\.wrangler|test-results|playwright-report|coverage|\.cache|tmp|\.tmp)(/|$)|\.(sqlite|sqlite-journal)$' "$LIST" || true
  grep -E '/\.env($|\.)' "$LIST" | grep -Ev '/\.env\.cli\.example$' || true
} > "$FORBIDDEN_LIST"
if [[ -s "$FORBIDDEN_LIST" ]]; then
  echo "release archive contains forbidden paths:" >&2
  cat "$FORBIDDEN_LIST" >&2
  exit 1
fi

mv "$TMP" "$ARCHIVE"
rm -f "$LIST" "$FORBIDDEN_LIST"
trap - EXIT
(
  cd "$OUT_DIR"
  sha256sum "$(basename "$ARCHIVE")" > "$(basename "$CHECKSUM")"
)
printf '%s\n' "$ARCHIVE" "$CHECKSUM"
