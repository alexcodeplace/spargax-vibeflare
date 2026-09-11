# UJ-009 — Preview and safely uninstall owned resources

```yaml
id: UJ-009
title: Preview and safely uninstall owned resources
actors: [installer]
surface: cli-lifecycle
goal: A member previews and removes only resources recorded as owned by one VibeFlare installation, including application-managed R2 objects, while unrelated resources remain untouched.
trigger: Run vf uninstall --name=binary-test --preview for a recorded installation.
fixtures: [provider-simulator, vibeflare-install-receipt, recorded-r2-file, unrelated-same-prefix-resources]
success_state:
  visible: Preview prints exact owned Worker/R2/D1 names and No deletion was performed.; confirmed removal prints each Removed entry and State: removed.
  durable: Receipt-owned names and ids are the only deletion authority; each completed or failed destructive step is written immediately to the receipt.
  persistence: Unrelated same-prefix account resources remain present and a partial failure resumes only resources not already marked removed.
source_specs: [apps/cli/src/lib/lifecycle.ts, apps/cli/src/lib/install-state.ts, apps/cli/src/lib/wrangler-provider.ts, apps/cli/src/commands/uninstall.ts]
readiness: ready
canonical: true
blockers: []
```

## Path

| Hop | Evidence |
|---|---|
| UI trigger | `apps/cli/src/commands/uninstall.ts:18` |
| Request construction | `apps/cli/src/commands/uninstall.ts:28` |
| Endpoint auth and parse | `apps/cli/src/lib/lifecycle.ts:282` |
| Authoritative write | `apps/cli/src/lib/install-state.ts:149` |
| Response | `apps/cli/src/commands/uninstall.ts:34` |
| Terminal render | `apps/cli/src/commands/uninstall.ts:36` |

## Happy path

### H1
- Setup: The `binary-test` receipt owns Worker `binary-test`, R2 `binary-test-files`, and D1 `binary-test-db`; unrelated same-prefix resources also exist.
- Action: Run `vf uninstall --name=binary-test --preview`.
- Request: N/A — uninstall preview is a local receipt read and does not invoke an application HTTP endpoint.
- Response: N/A — preview has no application HTTP response contract.
- Visible: stdout contains `Uninstall preview for binary-test`, `worker: binary-test`, `r2: binary-test-files`, `d1: binary-test-db`, and `No deletion was performed.`.
- Durable: The install receipt and every provider resource remain byte-for-byte unchanged by preview.
- Fresh read: Reading the same receipt after preview returns the same owned Worker/R2/D1 records.
- Forbidden: Preview performs no provider mutation and does not include same-prefix resources absent from the receipt.
- Evidence:
  - Setup: `apps/cli/src/lib/lifecycle.ts:263`
  - Action: `apps/cli/src/commands/uninstall.ts:28`
  - Request: `apps/cli/src/lib/lifecycle.ts:264`
  - Response: `apps/cli/src/lib/lifecycle.ts:273`
  - Visible: `apps/cli/src/commands/uninstall.ts:6`, `apps/cli/src/commands/uninstall.ts:14`
  - Durable: `apps/cli/src/lib/install-state.ts:137`
  - Fresh read: `apps/cli/src/lib/install-state.ts:137`
  - Forbidden: `apps/cli/src/lib/lifecycle.ts:266`, `apps/cli/src/commands/uninstall.ts:29`

### H2
- Setup: The receipt owns Worker `binary-test`, R2 `binary-test-files`, D1 `binary-test-db`, and D1 records the exact R2 object key `owner/one-file.txt`.
- Action: Run `vf uninstall --name=binary-test --confirm=binary-test` in a real terminal.
- Request: N/A — confirmed uninstall invokes the local Cloudflare provider rather than an application HTTP endpoint.
- Response: N/A — the provider workflow has no application HTTP response contract.
- Visible: stdout contains `Removed: worker:binary-test`, `Removed: r2:binary-test-files`, `Removed: d1:binary-test-db`, and `State: removed`.
- Durable: The receipt persists each resource as `removed` and finishes with install status `removed` instead of deleting ownership history.
- Fresh read: Reading the receipt after completion returns status `removed` with Worker/R2/D1 each marked `removed`.
- Forbidden: Only the exact R2 keys read from the receipt-owned D1 and the exact receipt-owned Worker/R2/D1 are deleted; unrelated same-prefix resources remain untouched.
- Evidence:
  - Setup: `apps/cli/src/lib/lifecycle.ts:282`, `apps/cli/src/lib/wrangler-provider.ts:199`
  - Action: `apps/cli/src/commands/uninstall.ts:33`
  - Request: `apps/cli/src/lib/lifecycle.ts:328`, `apps/cli/src/lib/lifecycle.ts:340`
  - Response: `apps/cli/src/lib/lifecycle.ts:359`
  - Visible: `apps/cli/src/commands/uninstall.ts:34`, `apps/cli/src/commands/uninstall.ts:36`
  - Durable: `apps/cli/src/lib/lifecycle.ts:303`, `apps/cli/src/lib/lifecycle.ts:359`
  - Fresh read: `apps/cli/src/lib/install-state.ts:137`
  - Forbidden: `apps/cli/src/lib/lifecycle.ts:267`, `apps/cli/src/lib/wrangler-provider.ts:199`

## Alternate and failure paths

### A1
- Setup: No install receipt exists for `binary-test`.
- Action: Run `vf uninstall --name=binary-test --preview`.
- Request: N/A — the command fails at local receipt lookup before any provider operation.
- Response: N/A — no application HTTP request is made.
- Visible: stderr begins with `uninstall:` and includes `ownership unknown for 'binary-test'`.
- Durable: No receipt is created and no Cloudflare resource state is modified.
- Fresh read: Reading `binary-test` still returns no receipt.
- Forbidden: Missing ownership never falls back to prefix search, name guessing, Worker deletion, R2 deletion, or D1 deletion.
- Evidence:
  - Setup: `apps/cli/src/lib/lifecycle.ts:264`
  - Action: `apps/cli/src/commands/uninstall.ts:29`
  - Request: `apps/cli/src/lib/lifecycle.ts:265`
  - Response: `apps/cli/src/commands/uninstall.ts:38`
  - Visible: `apps/cli/src/commands/uninstall.ts:39`
  - Durable: `apps/cli/src/lib/install-state.ts:137`
  - Fresh read: `apps/cli/src/lib/install-state.ts:137`
  - Forbidden: `apps/cli/src/lib/lifecycle.ts:265`

## Permissions and boundaries

### P1
- Setup: Worker deletion has completed and been persisted; R2 purge is then denied while R2 and D1 remain in the receipt.
- Action: Retry `vf uninstall --name=binary-test --confirm=binary-test` after the R2 permission failure is removed.
- Request: N/A — retry is a local provider workflow rather than an application HTTP endpoint.
- Response: N/A — the provider workflow has no application HTTP response contract.
- Visible: The failed attempt prints `State: uninstall-incomplete`; the retry finishes with `State: removed`.
- Durable: The failed receipt records Worker `removed`, R2 `delete-failed`, D1 `owned`, and status `uninstall-incomplete`; retry advances only the remaining R2/D1 states.
- Fresh read: Reading the receipt between attempts exposes the partial statuses; reading it after retry returns status `removed`.
- Forbidden: Retry skips Worker deletion because the receipt already marks it removed, and a non-interactive Worker deletion is refused before storage/database deletion can continue.
- Evidence:
  - Setup: `apps/cli/src/lib/lifecycle.ts:325`, `apps/cli/src/lib/lifecycle.ts:335`
  - Action: `apps/cli/src/commands/uninstall.ts:33`
  - Request: `apps/cli/src/lib/lifecycle.ts:340`
  - Response: `apps/cli/src/lib/lifecycle.ts:344`
  - Visible: `apps/cli/src/commands/uninstall.ts:36`
  - Durable: `apps/cli/src/lib/lifecycle.ts:291`, `apps/cli/src/lib/lifecycle.ts:303`
  - Fresh read: `apps/cli/src/lib/install-state.ts:137`
  - Forbidden: `apps/cli/src/lib/lifecycle.ts:326`, `apps/cli/src/lib/wrangler-provider.ts:186`

## Source specs

- `apps/cli/src/lib/lifecycle.ts`
- `apps/cli/src/lib/install-state.ts`
- `apps/cli/src/lib/wrangler-provider.ts`
- `apps/cli/src/commands/uninstall.ts`
