# UJ-001 — First owner creates standalone passkey

```yaml
id: UJ-001
title: First owner creates standalone passkey
actors: [first-owner]
surface: browser-standalone-setup
goal: The first person on a fresh standalone deployment creates exactly one owner account and immediately receives an authenticated app session.
trigger: Activate first-owner passkey registration on /setup.
fixtures: [standalone-mode, empty-auth-users, no-existing-owner]
success_state:
  visible: Browser leaves setup and reaches authenticated application state.
  durable: Exactly one owner user and one passkey credential are stored; vf_sess is issued for that owner.
  persistence: Fresh GET /admin/me returns 200 for the new owner.
source_specs: [apps/worker/src/routes/auth.ts, apps/worker/src/auth/passkey.ts, apps/worker/src/auth/session.ts, apps/worker/src/db/queries.ts, apps/worker/src/routes/admin.ts, apps/ui/src/components/widgets/PasskeyButton.tsx]
readiness: ready
canonical: true
blockers: []
```

## Path

| Hop | Evidence |
|---|---|
| UI trigger | `apps/ui/src/components/widgets/PasskeyButton.tsx:77` |
| Request construction | `apps/ui/src/components/widgets/PasskeyButton.tsx:93` |
| Endpoint auth and parse | `apps/worker/src/routes/auth.ts:34` |
| Authoritative write | `apps/worker/src/auth/passkey.ts:144`, `apps/worker/src/auth/passkey.ts:166` |
| Response | `apps/worker/src/routes/auth.ts:58` |
| Terminal render | `apps/ui/src/components/widgets/PasskeyButton.tsx:101` |

## Happy path

### H1
- Setup: `auth_users` is empty and the deployment is in standalone browser-auth mode.
- Action: Activate first-owner passkey registration and complete WebAuthn registration.
- Request: `POST /auth/setup/finish`.
- Response: `200` with `{ "ok": true }`.
- Visible: The setup control reports `Passkey registered` and its success handler can navigate into the app.
- Durable: One `owner` row and one credential row are stored and `vf_sess` is issued for the same owner id.
- Fresh read: `GET /admin/me` returns `200` with `{ "user": { "role": "owner" } }` using the issued session.
- Forbidden: A concurrent setup completion cannot create a second owner.
- Evidence:
  - Setup: `apps/worker/src/db/queries.ts:69`
  - Action: `apps/ui/src/components/widgets/PasskeyButton.tsx:83`
  - Request: `apps/ui/src/components/widgets/PasskeyButton.tsx:93`
  - Response: `apps/worker/src/routes/auth.ts:58`
  - Visible: `apps/ui/src/components/widgets/PasskeyButton.tsx:100`
  - Durable: `apps/worker/src/auth/passkey.ts:144`, `apps/worker/src/auth/passkey.ts:166`, `apps/worker/src/auth/session.ts:26`
  - Fresh read: `apps/worker/src/routes/admin.ts:45`
  - Forbidden: `apps/worker/src/auth/passkey.ts:148`

## Alternate and failure paths

### A1
- Setup: At least one user already exists.
- Action: Start first-owner setup again.
- Request: `POST /auth/setup/start`.
- Response: `403` with `{ "error": { "type": "forbidden", "message": "setup already complete" } }`.
- Visible: The caller receives `setup already complete` rather than another registration challenge.
- Durable: Existing users and credentials are unchanged.
- Fresh read: `GET /admin/me` still resolves only according to the caller's existing authentication state.
- Forbidden: No second owner id or registration challenge is created.
- Evidence:
  - Setup: `apps/worker/src/routes/auth.ts:25`
  - Action: `apps/worker/src/routes/auth.ts:24`
  - Request: `apps/worker/src/routes/auth.ts:24`
  - Response: `apps/worker/src/routes/auth.ts:27`
  - Visible: `apps/worker/src/routes/auth.ts:27`
  - Durable: `apps/worker/src/routes/auth.ts:26`
  - Fresh read: `apps/worker/src/routes/admin.ts:45`
  - Forbidden: `apps/worker/src/routes/auth.ts:29`

## Permissions and boundaries

N/A — first-owner setup is intentionally reachable without an existing user only while the user table is empty; the atomic owner insert is the authority boundary.

## Source specs

- `apps/worker/src/routes/auth.ts`
- `apps/worker/src/auth/passkey.ts`
- `apps/worker/src/auth/session.ts`
- `apps/worker/src/db/queries.ts`
- `apps/worker/src/routes/admin.ts`
- `apps/ui/src/components/widgets/PasskeyButton.tsx`
