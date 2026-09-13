#!/usr/bin/env bash
# audit-islands.sh — enforce hydration directive policy
# Runs as prebuild. Exits 1 on any violation.
set -e

PAGES_DIR="$(dirname "$0")/../src/pages"
FAIL=0

# Rule 1: forbid client:only="react" anywhere in pages, except allowlist
# chat.astro: auth-gated, no SEO; avoids SSR/CSR hydration mismatch from edge HTML transforms.
ONLY_ALLOWLIST="chat.astro"
BAD_CLIENT_ONLY=$(grep -rln 'client:only="react"' "$PAGES_DIR" 2>/dev/null \
  | grep -vE "/($ONLY_ALLOWLIST)\$" || true)
if [ -n "$BAD_CLIENT_ONLY" ]; then
  echo "ERROR: client:only=\"react\" found in pages outside allowlist ($ONLY_ALLOWLIST):"
  echo "$BAD_CLIENT_ONLY"
  FAIL=1
fi

# Rule 2: client:load is allowed on immediately interactive application pages.
# These surfaces expose controls at first paint; delaying hydration can silently lose the first click.
# Non-product/demo surfaces such as design-system.astro stay on client:idle.
# DailyUsage is mounted inside TopBar.astro (layouts dir), not pages — exempt.
LOAD_ALLOWLIST="chat.astro|login.astro|setup.astro|signup.astro|files.astro|history.astro|settings.astro|keys.astro|analytics.astro"

while IFS= read -r -d '' file; do
  # Direct Settings sections have first-paint interactive controls too.
  if [[ "$file" == "$PAGES_DIR/settings/[tab].astro" ]]; then continue; fi
  basename=$(basename "$file")
  if grep -q 'client:load' "$file" 2>/dev/null; then
    if ! echo "$basename" | grep -qE "$LOAD_ALLOWLIST"; then
      echo "ERROR: client:load in $file — not in allowlist ($LOAD_ALLOWLIST). Use client:load only for first-paint interactive application surfaces; otherwise use client:visible or client:idle."
      FAIL=1
    fi
  fi
done < <(find "$PAGES_DIR" -name "*.astro" -print0)

if [ "$FAIL" -eq 1 ]; then
  exit 1
fi

echo "OK: island hydration audit passed"
