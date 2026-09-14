# UJ-002 — Existing user signs in with passkey

## Binding experience amendment (2026-09-14)

Apply [VF-UX01 through VF-UX03 and VF-A01](../design/VISIBLE-CONTROLS.md#regularpro-and-inspect-binding-owner-amendment-2026-09-14).
A genuinely new user first chooses Regular or Pro before account setup; an existing
user restores their saved choice without redoing onboarding. Store any pre-auth
choice as a non-secret draft and bind/reconcile only after successful authentication.
Both experiences use exactly the auth endpoints and ownership guarantees below.
The source-line evidence below proves the existing authentication segment only;
first-choice persistence, mode-specific UI and safe Inspect need new evidence.
No additional auth endpoint or synthetic completion receipt is invented here.

```yaml
id: UJ-002
title: Existing user signs in with passkey
actors: [member]
surface: browser-standalone-auth
goal: Existing member authenticates with a registered passkey and immediately reaches authenticated application state.
trigger: Activate Sign in with passkey on /login.
fixtures: [standalone-mode, member-a, registered-passkey-a]
success_state:
  visible: Browser navigates to / after the authentication response is accepted.
  durable: Credential counter/last-used state advances and vf_sess is issued for member-a.
  persistence: Fresh GET /admin/me returns 200 for member-a using the issued session.
source_specs: [apps/ui/src/components/widgets/LoginPage.tsx, apps/ui/src/components/widgets/PasskeyButton.tsx, apps/worker/src/routes/auth.ts, apps/worker/src/auth/passkey.ts, apps/worker/src/auth/session.ts, apps/worker/src/auth/middleware.ts, apps/worker/src/routes/admin.ts]
readiness: ready
canonical: true
blockers: []
```

## Path

| Hop | Evidence |
|---|---|
| UI trigger | `apps/ui/src/components/widgets/LoginPage.tsx:55` |
| Request construction | `apps/ui/src/components/widgets/PasskeyButton.tsx:110` |
| Endpoint auth and parse | `apps/worker/src/routes/auth.ts:68` |
| Authoritative write | `apps/worker/src/auth/passkey.ts:235`, `apps/worker/src/auth/session.ts:26` |
| Response | `apps/worker/src/routes/auth.ts:90` |
| Terminal render | `apps/ui/src/components/widgets/LoginPage.tsx:58` |

## Happy path

### H1
- Setup: `member-a` exists with `registered-passkey-a`; standalone mode serves `/login` without a Cloudflare Access edge challenge.
- Action: Activate `Sign in with passkey` and satisfy the WebAuthn prompt with `registered-passkey-a`.
- Request: `POST /auth/passkey/finish`.
- Response: `200` with `{ "ok": true }`.
- Visible: Browser navigates to `/`.
- Durable: The stored credential counter and `last_used_at` advance and response cookie `vf_sess` is issued for `member-a`.
- Fresh read: `GET /admin/me` returns `200` with `{ "user": { "id": "member-a" } }` using the newly issued session.
- Forbidden: No new user row is created and no second authentication method is required after the passkey is accepted.
- Evidence:
  - Setup: `apps/worker/src/auth/passkey.ts:211`
  - Action: `apps/ui/src/components/widgets/PasskeyButton.tsx:108`
  - Request: `apps/ui/src/components/widgets/PasskeyButton.tsx:110`
  - Response: `apps/worker/src/routes/auth.ts:90`
  - Visible: `apps/ui/src/components/widgets/LoginPage.tsx:58`
  - Durable: `apps/worker/src/auth/passkey.ts:235`, `apps/worker/src/auth/session.ts:26`
  - Fresh read: `apps/worker/src/routes/admin.ts:45`
  - Forbidden: `apps/worker/src/auth/passkey.ts:242`

## Alternate and failure paths

### A1
- Setup: `member-a` exists but the supplied WebAuthn assertion cannot be verified.
- Action: Complete the passkey prompt with an invalid assertion.
- Request: `POST /auth/passkey/finish`.
- Response: `401` with `{ "error": { "type": "auth", "message": "authentication failed" } }`.
- Visible: `Authentication failed` is shown by the passkey control.
- Durable: No `vf_sess` cookie is issued and the authenticated credential counter is not advanced.
- Fresh read: `GET /admin/me` returns `401` with `{ "error": { "type": "auth", "message": "authentication required" } }`.
- Forbidden: Browser does not navigate to `/` as an authenticated user.
- Evidence:
  - Setup: `apps/worker/src/auth/passkey.ts:228`
  - Action: `apps/ui/src/components/widgets/PasskeyButton.tsx:108`
  - Request: `apps/ui/src/components/widgets/PasskeyButton.tsx:110`
  - Response: `apps/worker/src/routes/auth.ts:82`
  - Visible: `apps/ui/src/components/widgets/PasskeyButton.tsx:116`
  - Durable: `apps/worker/src/routes/auth.ts:82`
  - Fresh read: `apps/worker/src/auth/middleware.ts:63`
  - Forbidden: `apps/ui/src/components/widgets/LoginPage.tsx:58`

## Permissions and boundaries

### P1
- Setup: No valid app session and no accepted Cloudflare Access identity are present.
- Action: Request the authenticated identity endpoint directly.
- Request: `GET /admin/me`.
- Response: `401` with `{ "error": { "type": "auth", "message": "authentication required" } }`.
- Visible: `/admin/me` exposes no member identity.
- Durable: Authentication state and user rows are unchanged.
- Fresh read: `GET /admin/me` returns `401` with `{ "error": { "type": "auth", "message": "authentication required" } }`.
- Forbidden: User id, email, and role are not disclosed.
- Evidence:
  - Setup: `apps/worker/src/auth/middleware.ts:51`
  - Action: `apps/worker/src/routes/admin.ts:45`
  - Request: `apps/worker/src/routes/admin.ts:45`
  - Response: `apps/worker/src/auth/middleware.ts:63`
  - Visible: `apps/worker/src/auth/middleware.ts:64`
  - Durable: `apps/worker/src/auth/middleware.ts:59`
  - Fresh read: `apps/worker/src/auth/middleware.ts:63`
  - Forbidden: `apps/worker/src/routes/admin.ts:47`

## Source specs

- `apps/ui/src/components/widgets/LoginPage.tsx`
- `apps/ui/src/components/widgets/PasskeyButton.tsx`
- `apps/worker/src/routes/auth.ts`
- `apps/worker/src/auth/passkey.ts`
- `apps/worker/src/auth/session.ts`
- `apps/worker/src/auth/middleware.ts`
- `apps/worker/src/routes/admin.ts`
