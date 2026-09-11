# UJ-006 — Usage and audit reflect real activity

```yaml
id: UJ-006
title: Usage and audit reflect real activity
actors: [member]
surface: browser-analytics
goal: Member sees analytics derived from their durable request audit rather than placeholder values.
trigger: Open /analytics after a known successful request fixture exists.
fixtures: [member-a-session, one-success-audit-event-model-alpha]
success_state:
  visible: Analytics shows one request, zero percent error rate, model-alpha as top model, and the matching audit row.
  durable: audit_events keeps the known member-a event.
  persistence: Fresh GET /admin/usage?range=24h and GET /admin/audit reproduce metrics from that event.
source_specs: [apps/ui/src/components/widgets/AnalyticsPage.tsx, apps/ui/src/lib/api.ts, apps/worker/src/routes/admin.ts, apps/worker/src/db/queries.ts, apps/worker/src/auth/middleware.ts]
readiness: ready
canonical: true
blockers: []
```

## Path

| Hop | Evidence |
|---|---|
| UI trigger | `apps/ui/src/components/widgets/AnalyticsPage.tsx:23` |
| Request construction | `apps/ui/src/lib/api.ts:183` |
| Endpoint auth and parse | `apps/worker/src/routes/admin.ts:249` |
| Authoritative write | `apps/worker/src/db/queries.ts:252` |
| Response | `apps/worker/src/routes/admin.ts:263` |
| Terminal render | `apps/ui/src/components/widgets/AnalyticsPage.tsx:52` |

## Happy path

### H1
- Setup: `member-a` has one `200` audit event in the last 24 hours for `model-alpha`, with `requests=1` and no error event.
- Action: Member A opens Analytics with range `24h`.
- Request: `GET /admin/usage?range=24h`.
- Response: `200` with `{data:[{ts:<iso-hour>,neurons:<n>,requests:1}],range:"24h",error_rate:0,top_model:"model-alpha"}`.
- Visible: The summary renders `1` request, `0%` error rate, and `model-alpha` as Top Model.
- Durable: The original `audit_events` row remains unchanged by reading analytics.
- Fresh read: `GET /admin/audit` returns `200` with `{events:[{user_id:"member-a",model:"model-alpha",status:200,...}]}`.
- Forbidden: Member A does not receive another user's audit rows.
- Evidence:
  - Setup: `apps/worker/src/db/queries.ts:252`
  - Action: `apps/ui/src/components/widgets/AnalyticsPage.tsx:23`
  - Request: `apps/ui/src/lib/api.ts:183`
  - Response: `apps/worker/src/routes/admin.ts:263`
  - Visible: `apps/ui/src/components/widgets/AnalyticsPage.tsx:52`
  - Durable: `apps/worker/src/db/queries.ts:252`
  - Fresh read: `apps/worker/src/routes/admin.ts:240`
  - Forbidden: `apps/worker/src/db/queries.ts:288`

## Alternate and failure paths

### A1
- Setup: `member-a` has no audit event in the last 24 hours.
- Action: Member A opens Analytics with range `24h`.
- Request: `GET /admin/usage?range=24h`.
- Response: `200` with `{data:[],range:"24h",error_rate:null,top_model:null}`.
- Visible: Analytics renders zero requests and a no-data value for error rate/top model rather than fabricated activity.
- Durable: Reading Analytics creates no audit event.
- Fresh read: `GET /admin/audit` returns `200` with `{events:[]}`.
- Forbidden: Empty data is not converted into fake metrics.
- Evidence:
  - Setup: `apps/worker/src/db/queries.ts:306`
  - Action: `apps/ui/src/components/widgets/AnalyticsPage.tsx:23`
  - Request: `apps/ui/src/lib/api.ts:183`
  - Response: `apps/worker/src/routes/admin.ts:263`
  - Visible: `apps/ui/src/components/widgets/AnalyticsPage.tsx:52`
  - Durable: `apps/worker/src/routes/admin.ts:249`
  - Fresh read: `apps/worker/src/routes/admin.ts:240`
  - Forbidden: `apps/ui/src/components/widgets/AnalyticsPage.tsx:52`

## Permissions and boundaries

### P1
- Setup: No accepted browser identity is present.
- Action: Request usage for the current account.
- Request: `GET /admin/usage?range=24h`.
- Response: `401` with `{error:{type:"auth",message:"authentication required"}}`.
- Visible: No usage values are returned.
- Durable: `audit_events` is unchanged.
- Fresh read: `GET /admin/audit` returns `401` with `{error:{type:"auth",message:"authentication required"}}`.
- Forbidden: Anonymous callers cannot enumerate usage or audit information.
- Evidence:
  - Setup: `apps/worker/src/auth/middleware.ts:51`
  - Action: `apps/worker/src/routes/admin.ts:249`
  - Request: `apps/worker/src/routes/admin.ts:249`
  - Response: `apps/worker/src/auth/middleware.ts:63`
  - Visible: `apps/worker/src/auth/middleware.ts:63`
  - Durable: `apps/worker/src/auth/middleware.ts:59`
  - Fresh read: `apps/worker/src/routes/admin.ts:240`
  - Forbidden: `apps/worker/src/auth/middleware.ts:59`

## Source specs

- `apps/ui/src/components/widgets/AnalyticsPage.tsx`
- `apps/ui/src/lib/api.ts`
- `apps/worker/src/routes/admin.ts`
- `apps/worker/src/db/queries.ts`
- `apps/worker/src/auth/middleware.ts`
