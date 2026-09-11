# UJ-007 — User uploads and deletes a private file

```yaml
id: UJ-007
title: User uploads and deletes a private file
actors: [member]
surface: browser-files
goal: Member uploads a private file and can later delete it without exposing or mutating another user's file.
trigger: Upload sample.txt from the chat/file surface.
fixtures: [member-a-session, member-b-session, sample-text-file]
success_state:
  visible: Member A sees sample.txt with its real metadata and it disappears after deletion.
  durable: files and R2 contain only member-a-owned state until deletion, then both are removed.
  persistence: Fresh GET /admin/files reflects the create/delete state.
source_specs: [apps/ui/src/lib/api.ts, apps/ui/src/components/widgets/FilesPage.tsx, apps/worker/src/routes/admin.ts, apps/worker/src/files/r2.ts]
readiness: ready
canonical: true
blockers: []
```

## Path

| Hop | Evidence |
|---|---|
| UI trigger | `apps/ui/src/components/widgets/FilesPage.tsx:54` |
| Request construction | `apps/ui/src/lib/api.ts:206` |
| Endpoint auth and parse | `apps/worker/src/routes/admin.ts:371` |
| Authoritative write | `apps/worker/src/routes/admin.ts:386` |
| Response | `apps/worker/src/routes/admin.ts:389` |
| Terminal render | `apps/ui/src/components/widgets/FilesPage.tsx:64` |

## Happy path

### H1
- Setup: `member-a` is authenticated and owns no file named `sample.txt`.
- Action: Member A uploads a UTF-8 `sample.txt` file containing `hello-vibeflare`.
- Request: `POST /admin/files`.
- Response: `201` with `{id:<file-id>,name:"sample.txt",mime:"text/plain",size:15,created_at:<timestamp>}`.
- Visible: The Files surface lists `sample.txt`, `text/plain`, and its real byte size.
- Durable: `files` has one row with `user_id='member-a'` and its R2 object contains `hello-vibeflare`.
- Fresh read: `GET /admin/files` returns `200` with `{files:[{id:<file-id>,name:"sample.txt",mime:"text/plain",size:15,...}]}`.
- Forbidden: The upload does not create a file row for another user.
- Evidence:
  - Setup: `apps/worker/src/routes/admin.ts:360`
  - Action: `apps/ui/src/lib/api.ts:206`
  - Request: `apps/ui/src/lib/api.ts:206`
  - Response: `apps/worker/src/routes/admin.ts:389`
  - Visible: `apps/ui/src/components/widgets/FilesPage.tsx:64`
  - Durable: `apps/worker/src/files/r2.ts:8`
  - Fresh read: `apps/worker/src/routes/admin.ts:360`
  - Forbidden: `apps/worker/src/routes/admin.ts:362`

### H2
- Setup: `member-a` owns file `<file-id>` from H1.
- Action: Member A activates Delete for that file.
- Request: `DELETE /admin/files/<file-id>`.
- Response: `200` with `{ok:true}`.
- Visible: `sample.txt` disappears from Member A's file list.
- Durable: the owned D1 file row and corresponding R2 object are removed.
- Fresh read: `GET /admin/files` returns `200` with `{files:[]}` for the fixture account.
- Forbidden: deletion is scoped through the authenticated `user_id` lookup.
- Evidence:
  - Setup: `apps/worker/src/routes/admin.ts:393`
  - Action: `apps/ui/src/components/widgets/FilesPage.tsx:105`
  - Request: `apps/ui/src/lib/api.ts:212`
  - Response: `apps/worker/src/routes/admin.ts:403`
  - Visible: `apps/ui/src/components/widgets/FilesPage.tsx:41`
  - Durable: `apps/worker/src/routes/admin.ts:400`
  - Fresh read: `apps/worker/src/routes/admin.ts:360`
  - Forbidden: `apps/worker/src/routes/admin.ts:396`

## Alternate and failure paths

### A1
- Setup: `member-a` is authenticated and file id `missing-file` does not exist for that user.
- Action: Member A requests deletion of `missing-file`.
- Request: `DELETE /admin/files/missing-file`.
- Response: `404` with `{error:{type:"not_found",message:"file not found"}}`.
- Visible: The caller receives an explicit file-not-found failure rather than a success state.
- Durable: no D1 row or R2 object is deleted.
- Fresh read: `GET /admin/files` returns `200` with Member A's original file list.
- Forbidden: A missing/foreign id does not broaden deletion scope.
- Evidence:
  - Setup: `apps/worker/src/routes/admin.ts:393`
  - Action: `apps/ui/src/components/widgets/FilesPage.tsx:105`
  - Request: `apps/ui/src/lib/api.ts:212`
  - Response: `apps/worker/src/routes/admin.ts:399`
  - Visible: `apps/ui/src/components/widgets/FilesPage.tsx:45`
  - Durable: `apps/worker/src/routes/admin.ts:399`
  - Fresh read: `apps/worker/src/routes/admin.ts:360`
  - Forbidden: `apps/worker/src/routes/admin.ts:396`

## Permissions and boundaries

### P1
- Setup: Member B is authenticated; `<member-a-file-id>` belongs to Member A.
- Action: Member B requests Member A's download URL.
- Request: `GET /admin/files/<member-a-file-id>/download`.
- Response: `404` with `{error:{type:"not_found",message:"file not found"}}`.
- Visible: No filename or file bytes are returned to Member B.
- Durable: Member A's file row and R2 object remain unchanged.
- Fresh read: `GET /admin/files` returns `200` without Member A's file in Member B's list.
- Forbidden: Knowing another user's file id does not authorize read or delete access.
- Evidence:
  - Setup: `apps/worker/src/routes/admin.ts:426`
  - Action: `apps/worker/src/routes/admin.ts:426`
  - Request: `apps/worker/src/routes/admin.ts:426`
  - Response: `apps/worker/src/routes/admin.ts:432`
  - Visible: `apps/worker/src/routes/admin.ts:432`
  - Durable: `apps/worker/src/routes/admin.ts:431`
  - Fresh read: `apps/worker/src/routes/admin.ts:360`
  - Forbidden: `apps/worker/src/routes/admin.ts:430`

## Source specs

- `apps/ui/src/lib/api.ts`
- `apps/ui/src/components/widgets/FilesPage.tsx`
- `apps/worker/src/routes/admin.ts`
- `apps/worker/src/files/r2.ts`
