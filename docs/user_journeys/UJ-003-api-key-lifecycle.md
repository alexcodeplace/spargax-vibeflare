# UJ-003 — User creates and revokes API key

```yaml
id: UJ-003
title: User creates and revokes API key
actors: [member]
surface: browser-api-keys
goal: Authenticated member creates a named API key, sees the secret once, can use the stored key record, and can revoke only an owned key.
trigger: Activate Create key on /keys.
fixtures: [member-a-session, no-key-with-label-member-tool]
success_state:
  visible: The new full secret is shown with the warning Copy this key now — it will not be shown again.
  durable: api_keys stores only the hash/prefix/metadata for member-a and revocation sets revoked_at.
  persistence: Fresh GET /admin/keys lists the key metadata without full secret or key_hash, then excludes it from usable-key lookup after revocation.
source_specs: [apps/ui/src/components/widgets/KeysPage.tsx, apps/ui/src/lib/api.ts, apps/ui/src/lib/api/keys.ts, apps/worker/src/routes/admin.ts, apps/worker/src/db/queries.ts, apps/worker/src/auth/middleware.ts]
readiness: ready
canonical: true
blockers: []
```

## Path

| Hop | Evidence |
|---|---|
| UI trigger | `apps/ui/src/components/widgets/KeysPage.tsx:51` |
| Request construction | `apps/ui/src/lib/api.ts:88` |
| Endpoint auth and parse | `apps/worker/src/routes/admin.ts:66` |
| Authoritative write | `apps/worker/src/routes/admin.ts:86`, `apps/worker/src/db/queries.ts:172` |
| Response | `apps/worker/src/routes/admin.ts:96` |
| Terminal render | `apps/ui/src/components/widgets/KeysPage.tsx:93` |

## Happy path

### H1
- Setup: `member-a` has a valid browser session and no key labeled `member-tool`.
- Action: Enter `member-tool`, activate `Create`, then copy the revealed key.
- Request: `POST /admin/keys`.
- Response: `201` with `{ "label": "member-tool", "full": "vf-..." }`.
- Visible: `Copy this key now — it will not be shown again.` renders above the full secret.
- Durable: `api_keys` stores the new key hash, prefix, label, owner id, and creation timestamp rather than the full secret.
- Fresh read: `GET /admin/keys` returns `200` with `{ "keys": [{ "label": "member-tool" }] }` and no `full` or `key_hash` field.
- Forbidden: Another user's keys are not listed and the full secret is not recoverable from the list endpoint.
- Evidence:
  - Setup: `apps/worker/src/routes/admin.ts:55`
  - Action: `apps/ui/src/components/widgets/KeysPage.tsx:29`
  - Request: `apps/ui/src/lib/api.ts:88`
  - Response: `apps/worker/src/routes/admin.ts:96`
  - Visible: `apps/ui/src/components/widgets/KeysPage.tsx:95`
  - Durable: `apps/worker/src/db/queries.ts:160`
  - Fresh read: `apps/worker/src/routes/admin.ts:54`
  - Forbidden: `apps/worker/src/routes/admin.ts:57`

### H2
- Setup: `member-a` owns API key id `key-owned-1` and has a valid browser session.
- Action: Activate Revoke for `key-owned-1`.
- Request: `DELETE /admin/keys/key-owned-1`.
- Response: `200` with `{ "ok": true }`.
- Visible: The refreshed key list keeps `member-tool` visible with a `revoked` badge and no Revoke action.
- Durable: `api_keys.revoked_at` is set for `key-owned-1`.
- Fresh read: `GET /admin/keys` returns `200` and the record has a non-null `revoked_at`; bearer lookup no longer accepts it as an active key.
- Forbidden: No key belonging to another user is revoked.
- Evidence:
  - Setup: `apps/worker/src/routes/admin.ts:104`
  - Action: `apps/ui/src/lib/api/keys.ts:25`
  - Request: `apps/ui/src/lib/api.ts:94`
  - Response: `apps/worker/src/routes/admin.ts:110`
  - Visible: `apps/ui/src/lib/api/keys.ts:29`
  - Durable: `apps/worker/src/db/queries.ts:180`
  - Fresh read: `apps/worker/src/db/queries.ts:150`
  - Forbidden: `apps/worker/src/routes/admin.ts:105`

## Alternate and failure paths

### A1
- Setup: `member-a` does not own key id `key-other-1`.
- Action: Request revocation of `key-other-1`.
- Request: `DELETE /admin/keys/key-other-1`.
- Response: `404` with `{ "error": { "type": "not_found", "message": "key not found" } }`.
- Visible: The caller receives `key not found` and their list remains unchanged.
- Durable: `key-other-1` is not modified.
- Fresh read: `GET /admin/keys` returns `200` with only `member-a` key metadata.
- Forbidden: Possession of another key id does not grant revocation authority.
- Evidence:
  - Setup: `apps/worker/src/routes/admin.ts:104`
  - Action: `apps/worker/src/routes/admin.ts:101`
  - Request: `apps/worker/src/routes/admin.ts:101`
  - Response: `apps/worker/src/routes/admin.ts:107`
  - Visible: `apps/worker/src/routes/admin.ts:107`
  - Durable: `apps/worker/src/routes/admin.ts:106`
  - Fresh read: `apps/worker/src/routes/admin.ts:54`
  - Forbidden: `apps/worker/src/routes/admin.ts:105`

## Permissions and boundaries

### P1
- Setup: No accepted browser authentication is present.
- Action: Request creation of an API key.
- Request: `POST /admin/keys`.
- Response: `401` with `{ "error": { "type": "auth", "message": "authentication required" } }`.
- Visible: No key secret or metadata is returned.
- Durable: `api_keys` is unchanged.
- Fresh read: `GET /admin/keys` returns `401` with `{ "error": { "type": "auth", "message": "authentication required" } }`.
- Forbidden: An unauthenticated caller cannot create or enumerate API keys.
- Evidence:
  - Setup: `apps/worker/src/auth/middleware.ts:51`
  - Action: `apps/worker/src/routes/admin.ts:66`
  - Request: `apps/worker/src/routes/admin.ts:66`
  - Response: `apps/worker/src/auth/middleware.ts:63`
  - Visible: `apps/worker/src/auth/middleware.ts:64`
  - Durable: `apps/worker/src/auth/middleware.ts:59`
  - Fresh read: `apps/worker/src/auth/middleware.ts:63`
  - Forbidden: `apps/worker/src/routes/admin.ts:37`

## Source specs

- `apps/ui/src/components/widgets/KeysPage.tsx`
- `apps/ui/src/lib/api.ts`
- `apps/ui/src/lib/api/keys.ts`
- `apps/worker/src/routes/admin.ts`
- `apps/worker/src/db/queries.ts`
- `apps/worker/src/auth/middleware.ts`
