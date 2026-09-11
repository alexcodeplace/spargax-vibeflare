# UJ-008 — Install, diagnose, and update without losing state

```yaml
id: UJ-008
title: Install, diagnose, and update without losing state
actors: [installer]
surface: cli-lifecycle
goal: A member creates one receipt-owned Cloudflare installation, can inspect and diagnose it, and updates in place without recreating D1/R2 or losing application data.
trigger: Run vf setup --name=binary-test from a clean VibeFlare release.
fixtures: [provider-simulator, clean-install-name, local-health-server, release-package]
success_state:
  visible: Setup prints Setup complete.; status prints State: installed and Health: healthy; doctor prints healthy installation/server checks; update prints Updated binary-test: 0.9.2 → 0.9.2.
  durable: An atomic install receipt records the selected account, exact Worker/D1/R2 ownership, auth origin, release, deployment, and every applied migration.
  persistence: Update reuses the same Worker/D1/R2 identities and preserves existing users, keys, chats, and files.
source_specs: [apps/cli/src/lib/lifecycle.ts, apps/cli/src/lib/install-state.ts, apps/cli/src/lib/generated-wrangler.ts, apps/cli/src/lib/wrangler-provider.ts, apps/cli/src/commands/setup.ts, apps/cli/src/commands/status.ts, apps/cli/src/commands/doctor.ts, apps/cli/src/commands/update.ts]
readiness: ready
canonical: true
blockers: []
```

## Path

| Hop | Evidence |
|---|---|
| UI trigger | `apps/cli/src/commands/setup.ts:31` |
| Request construction | `apps/cli/src/commands/setup.ts:94` |
| Endpoint auth and parse | `apps/cli/src/lib/wrangler-provider.ts:94` |
| Authoritative write | `apps/cli/src/lib/install-state.ts:149` |
| Response | `apps/cli/src/commands/setup.ts:16` |
| Terminal render | `apps/cli/src/commands/status.ts:33` |

## Happy path

### H1
- Setup: No install receipt exists for `binary-test`; the selected Wrangler identity exposes account `acct-1`; provider health returns `{ "ok": true, "version": "0.9.2-test" }`.
- Action: Run `vf setup --name=binary-test --origin=<health-url>`, then run `vf status --name=binary-test` and `vf doctor --name=binary-test`.
- Request: N/A — lifecycle provisioning is a local CLI/provider workflow rather than an application HTTP endpoint.
- Response: N/A — the CLI/provider workflow has no application HTTP response contract.
- Visible: stdout contains `Setup complete.`, `State: installed`, `Health: healthy`, `✓ installation: installed v0.9.2`, and `✓ server: v0.9.2-test`.
- Durable: The receipt has status `installed`, owns Worker `binary-test`, D1 `binary-test-db`, R2 `binary-test-files`, and records applied migrations; its generated Wrangler file is installation-specific while the canonical template is unchanged.
- Fresh read: A new `vf status --name=binary-test` process reads the receipt and prints `State: installed` and `D1: binary-test-db`.
- Forbidden: Re-running setup for the installed receipt performs no provider mutation and a same-named unowned Worker or D1 is never adopted.
- Evidence:
  - Setup: `apps/cli/src/lib/lifecycle.ts:89`, `apps/cli/src/lib/wrangler-provider.ts:94`
  - Action: `apps/cli/src/commands/setup.ts:97`, `apps/cli/src/commands/status.ts:24`, `apps/cli/src/commands/doctor.ts:33`
  - Request: `apps/cli/src/lib/lifecycle.ts:85`
  - Response: `apps/cli/src/lib/lifecycle.ts:194`
  - Visible: `apps/cli/src/commands/setup.ts:18`, `apps/cli/src/commands/status.ts:34`, `apps/cli/src/commands/doctor.ts:89`
  - Durable: `apps/cli/src/lib/install-state.ts:149`, `apps/cli/src/lib/generated-wrangler.ts:14`, `apps/cli/src/lib/lifecycle.ts:187`
  - Fresh read: `apps/cli/src/commands/status.ts:24`
  - Forbidden: `apps/cli/src/lib/lifecycle.ts:90`, `apps/cli/src/lib/lifecycle.ts:119`

### H2
- Setup: `binary-test` has an installed receipt with owned Worker/D1/R2 and persisted users, keys, chats, and files.
- Action: Run `vf update --name=binary-test`.
- Request: N/A — update is a local CLI/provider workflow rather than an application HTTP endpoint.
- Response: N/A — the CLI/provider workflow has no application HTTP response contract.
- Visible: stdout contains `Updated binary-test: 0.9.2 → 0.9.2`.
- Durable: The receipt returns to status `installed`, records the target release and newly applied migrations, and retains the same D1/R2 ownership records.
- Fresh read: Reading the receipt after update returns the same application data fixture and the installed release remains `0.9.2`.
- Forbidden: Update does not call D1 or R2 creation and does not advance the installed release when post-deploy health is unhealthy.
- Evidence:
  - Setup: `apps/cli/src/lib/lifecycle.ts:209`
  - Action: `apps/cli/src/commands/update.ts:13`
  - Request: `apps/cli/src/lib/lifecycle.ts:228`
  - Response: `apps/cli/src/lib/lifecycle.ts:250`
  - Visible: `apps/cli/src/commands/update.ts:14`
  - Durable: `apps/cli/src/lib/lifecycle.ts:242`, `apps/cli/src/lib/install-state.ts:149`
  - Fresh read: `apps/cli/src/lib/install-state.ts:137`
  - Forbidden: `apps/cli/src/lib/lifecycle.ts:230`, `apps/cli/src/lib/lifecycle.ts:239`

## Alternate and failure paths

### A1
- Setup: No receipt exists for `binary-test` and Wrangler identity lookup is denied before provisioning begins.
- Action: Run `vf setup --name=binary-test`.
- Request: N/A — identity discovery is a local provider invocation rather than an application HTTP endpoint.
- Response: N/A — the provider failure produces no application HTTP response.
- Visible: stderr begins with `setup:` and the command exits non-zero.
- Durable: No install receipt is created and no Cloudflare resource ownership is recorded.
- Fresh read: `readInstallReceipt('binary-test')` returns null.
- Forbidden: D1, R2, Worker creation, migration, and deployment are not attempted after identity lookup is denied.
- Evidence:
  - Setup: `apps/cli/src/lib/lifecycle.ts:96`
  - Action: `apps/cli/src/commands/setup.ts:97`
  - Request: `apps/cli/src/lib/wrangler-provider.ts:94`
  - Response: `apps/cli/src/lib/wrangler-provider.ts:95`
  - Visible: `apps/cli/src/commands/setup.ts:126`
  - Durable: `apps/cli/src/lib/lifecycle.ts:103`
  - Fresh read: `apps/cli/src/lib/install-state.ts:137`
  - Forbidden: `apps/cli/src/lib/lifecycle.ts:102`

## Permissions and boundaries

### P1
- Setup: D1 creation has completed and been written to the receipt, then the provider denies R2 creation.
- Action: Retry `vf setup --name=binary-test` after R2 permission is restored.
- Request: N/A — provisioning and retry are local provider operations rather than an application HTTP endpoint.
- Response: N/A — the provider workflow has no application HTTP response contract.
- Visible: The first command prints a `setup:` error; the retry reaches `Setup complete.`.
- Durable: The failed receipt remains `provisioning` with D1 marked `owned`; retry preserves that D1 record and adds the later resources instead of replacing it.
- Fresh read: Reading the receipt between attempts shows D1 owned, with R2 and Worker absent; reading it after retry shows status `installed`.
- Forbidden: Retry does not create the already receipt-owned D1 a second time and does not adopt a same-named Worker that appeared before ownership was recorded.
- Evidence:
  - Setup: `apps/cli/src/lib/lifecycle.ts:125`, `apps/cli/src/lib/lifecycle.ts:133`
  - Action: `apps/cli/src/commands/setup.ts:97`
  - Request: `apps/cli/src/lib/lifecycle.ts:134`
  - Response: `apps/cli/src/lib/lifecycle.ts:195`
  - Visible: `apps/cli/src/commands/setup.ts:126`, `apps/cli/src/commands/setup.ts:18`
  - Durable: `apps/cli/src/lib/lifecycle.ts:127`, `apps/cli/src/lib/lifecycle.ts:197`
  - Fresh read: `apps/cli/src/lib/install-state.ts:137`
  - Forbidden: `apps/cli/src/lib/lifecycle.ts:125`, `apps/cli/src/lib/lifecycle.ts:143`

## Source specs

- `apps/cli/src/lib/lifecycle.ts`
- `apps/cli/src/lib/install-state.ts`
- `apps/cli/src/lib/generated-wrangler.ts`
- `apps/cli/src/lib/wrangler-provider.ts`
- `apps/cli/src/commands/setup.ts`
- `apps/cli/src/commands/status.ts`
- `apps/cli/src/commands/doctor.ts`
- `apps/cli/src/commands/update.ts`
