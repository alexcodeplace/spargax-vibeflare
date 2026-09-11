#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STATE="$ROOT/apps/worker/.wrangler/e2e-state"
rm -rf "$STATE"
cd "$ROOT"
corepack pnpm --filter @vibeflare/ui build
cd "$ROOT/apps/worker"
corepack pnpm exec wrangler d1 migrations apply DB --local --config wrangler.e2e.toml --persist-to "$STATE"
exec corepack pnpm exec wrangler dev --config wrangler.e2e.toml --local-protocol http --port 8788 --persist-to "$STATE"
