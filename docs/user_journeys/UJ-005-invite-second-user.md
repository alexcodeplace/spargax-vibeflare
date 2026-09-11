# UJ-005 — Owner invites a second user

```yaml
id: UJ-005
title: Owner invites a second user
actors: [owner, invited-member]
surface: browser-invites-signup
goal: Owner creates one invite and a new passkey identity redeems it exactly once as a normal member.
trigger: Activate New invite in Settings > Invites.
fixtures: [owner-session, standalone-auth-mode, second-virtual-passkey]
success_state:
  visible: The invited user completes signup and reaches the authenticated app.
  durable: auth_users contains one new role=user account and auth_invites records used_at/used_by for that account.
  persistence: Fresh GET /admin/me returns 200 for the invited member while owner-only invite creation returns 403.
source_specs: [apps/ui/src/components/widgets/InvitesTab.tsx, apps/ui/src/lib/api/invites.ts, apps/ui/src/components/widgets/SignupPage.tsx, apps/worker/src/routes/admin.invites.ts, apps/worker/src/routes/auth.invite.ts, apps/worker/src/auth/invites.ts, apps/worker/src/auth/middleware.ts, apps/worker/src/routes/admin.ts]
readiness: ready
canonical: true
blockers: []
```

## Path

| Hop | Evidence |
|---|---|
| UI trigger | `apps/ui/src/components/widgets/InvitesTab.tsx:24` |
| Request construction | `apps/ui/src/lib/api/invites.ts:38` |
| Endpoint auth and parse | `apps/worker/src/routes/admin.invites.ts:16` |
| Authoritative write | `apps/worker/src/auth/invites.ts:99` |
| Response | `apps/worker/src/routes/auth.invite.ts:176` |
| Terminal render | `apps/ui/src/components/widgets/SignupPage.tsx:47` |

## Happy path

### H1
- Setup: `owner-a` is authenticated; standalone browser auth is active; the second passkey identity is not registered; invite `vfi-test-live` is live.
- Action: The invited user opens the invite link, registers the second passkey, and submits signup.
- Request: `POST /auth/invite/redeem/passkey/finish`.
- Response: `200` with `{ok:true}`.
- Visible: The invited browser leaves `/signup` and renders the authenticated application.
- Durable: `auth_users` has exactly one new row for the generated invited user id with `role='user'`; `auth_invites` for `vfi-test-live` has non-null `used_at` and `used_by` equal to that id.
- Fresh read: `GET /admin/me` returns `200` with `{user:{id:<invited-id>,email:null,role:"user"},authMethod:"session"}`.
- Forbidden: The redeemed account is not `owner` and the invite cannot provision another account.
- Evidence:
  - Setup: `apps/worker/src/routes/auth.invite.ts:96`
  - Action: `apps/ui/src/components/widgets/SignupPage.tsx:47`
  - Request: `apps/worker/src/routes/auth.invite.ts:96`
  - Response: `apps/worker/src/routes/auth.invite.ts:176`
  - Visible: `apps/ui/src/components/widgets/SignupPage.tsx:47`
  - Durable: `apps/worker/src/auth/invites.ts:99`
  - Fresh read: `apps/worker/src/routes/admin.ts:45`
  - Forbidden: `apps/worker/src/routes/admin.invites.ts:12`

## Alternate and failure paths

### A1
- Setup: `vfi-test-used` is already consumed by `member-b`.
- Action: A second unregistered passkey identity submits signup with that consumed invite cookie.
- Request: `POST /auth/invite/redeem/passkey/finish`.
- Response: `410` with `{error:{type:"invite_consumed",message:"invite not valid"}}`.
- Visible: Signup remains unauthenticated and displays the invite failure state.
- Durable: No second `auth_users` row or credential is created and the invite remains assigned to `member-b`.
- Fresh read: `GET /admin/me` returns `401` with `{error:{type:"auth",message:"authentication required"}}` for the failed browser.
- Forbidden: Replaying an invite does not create another account or session.
- Evidence:
  - Setup: `apps/worker/src/auth/invites.ts:79`
  - Action: `apps/ui/src/components/widgets/SignupPage.tsx:47`
  - Request: `apps/worker/src/routes/auth.invite.ts:96`
  - Response: `apps/worker/src/routes/auth.invite.ts:113`
  - Visible: `apps/ui/src/components/widgets/SignupPage.tsx:34`
  - Durable: `apps/worker/src/auth/invites.ts:99`
  - Fresh read: `apps/worker/src/auth/middleware.ts:51`
  - Forbidden: `apps/worker/src/routes/auth.invite.ts:113`

## Permissions and boundaries

### P1
- Setup: `member-a` is authenticated with `role='user'`.
- Action: Member A attempts to create an invite.
- Request: `POST /admin/invites`.
- Response: `403` with `{error:{type:"forbidden",message:"owner role required"}}`.
- Visible: No invite secret is returned.
- Durable: `auth_invites` is unchanged.
- Fresh read: `GET /admin/invites` returns `403` with `{error:{type:"forbidden",message:"owner role required"}}`.
- Forbidden: A normal member cannot create, enumerate, or revoke invites.
- Evidence:
  - Setup: `apps/worker/src/auth/middleware.ts:75`
  - Action: `apps/ui/src/components/widgets/InvitesTab.tsx:24`
  - Request: `apps/worker/src/routes/admin.invites.ts:16`
  - Response: `apps/worker/src/auth/middleware.ts:88`
  - Visible: `apps/worker/src/auth/middleware.ts:88`
  - Durable: `apps/worker/src/routes/admin.invites.ts:12`
  - Fresh read: `apps/worker/src/routes/admin.invites.ts:33`
  - Forbidden: `apps/worker/src/routes/admin.invites.ts:12`

## Source specs

- `apps/ui/src/components/widgets/InvitesTab.tsx`
- `apps/ui/src/lib/api/invites.ts`
- `apps/ui/src/components/widgets/SignupPage.tsx`
- `apps/worker/src/routes/admin.invites.ts`
- `apps/worker/src/routes/auth.invite.ts`
- `apps/worker/src/auth/invites.ts`
- `apps/worker/src/auth/middleware.ts`
- `apps/worker/src/routes/admin.ts`
