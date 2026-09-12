#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${VF_E2E_PORT:-8788}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "Invalid VF_E2E_PORT" >&2; exit 1; }
# SQLite shared-memory files need a native filesystem, not a mounted worktree.
STATE="$(mktemp -d "${TMPDIR:-/tmp}/vibeflare-e2e-${PORT}.XXXXXX")"
trap 'rm -rf "$STATE"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$ROOT"
if [[ "${VF_E2E_SKIP_BUILD:-0}" == "1" ]]; then
  test -f "$ROOT/apps/ui/dist/chat/index.html" || { echo "Missing prebuilt UI" >&2; exit 1; }
else
  corepack pnpm --filter @vibeflare/ui build
fi
cd "$ROOT/apps/worker"
corepack pnpm exec wrangler d1 migrations apply DB --local --config wrangler.e2e.toml --persist-to "$STATE"
corepack pnpm exec wrangler dev --config wrangler.e2e.toml --local-protocol http --port "$PORT" --var "RP_ORIGIN:http://localhost:$PORT" --persist-to "$STATE"
