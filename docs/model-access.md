# Model access and Workspace conversations

## Experience-mode boundary (2026-09-14)

The [VF-S04 and VF-I03 requirements](design/VISIBLE-CONTROLS.md#vibeflare-settings-visibility)
apply in Regular and Pro. Neither mode changes personal model visibility or
owner-controlled Exclude paid. Both must show the actual paid-policy consequences;
Pro is not a paid-model opt-in. Mode is a separate user-owned preference, never
written through the generic installation-settings endpoint.

Required new navigation: Settings > Experience at `/settings/experience/`, following
the same link/Back/Forward/reload contract as existing sections below. This is an
unimplemented required addition, not evidence that the route already exists.
Role-restricted sections remain role-restricted even in Pro.

## Exclude paid

Settings > Models contains an **Exclude paid** checkbox. It is enabled on new and existing installations unless the owner explicitly saves `models.exclude_paid=0`. This is an installation-wide policy; members can see it but cannot change it.

With the policy enabled, known paid-required models are removed from the browser picker and `/v1/models`. The inference dispatcher also rejects a stale selection or direct API request before calling Workers AI. With the policy disabled, paid models are selectable and carry a **💲 Paid** marker. Models compatible with the free allocation remain ahead of paid models in automatic selection.

The setting is not a spending cap. Free-compatible requests still consume neurons, and Cloudflare's plan, allocation and other products determine the bill. Only models with resolved access metadata are selectable. Internal metadata gaps never become labels in the picker, and no missing price is treated as evidence of paid-only access.

## Classification without inference probes

Classification comes from the structured model registry that Cloudflare uses to build its own documentation:

- Public registry: https://ai-cloudflare-com.pages.dev/api/models
- Cloudflare's consumer of that registry: https://github.com/cloudflare/cloudflare-docs/blob/production/bin/fetch-ai-models.js
- General billing rules: https://developers.cloudflare.com/workers-ai/platform/pricing/

The model property `require_workers_paid` is the access flag. In a validated registry record, a true flag requires paid billing; an absent/false flag does not. `price`, beta status, and plan access are different properties. A zero-price beta model or a model without a neuron-table row can still have fully resolved plan access.

Daily/lazy refresh makes HTTP metadata requests, not model requests. The optional pricing page supplies neuron estimates only; failure of that request does not invalidate access classification. The complete registry snapshot is validated before database updates. Deprecated entries and elapsed retirement dates are not offered. Previously scraped rows that are no longer present in the active registry are disabled without deleting conversation history.

If the registry is unavailable or changes shape, the last verified catalog remains usable; a new installation has a small documented fallback. Unclassified records are withheld instead of labeled or guessed. An explicit refresh failure keeps the current selector available and reports a single catalog-level retry message. The catalog format marker forces older installations to refresh without waiting 24 hours.

Workers AI error `5035` observed during a real user request records paid-required status immediately. That observation survives subsequent catalog refreshes. It is not counted as an unhealthy-model failure and does not disable a model for users who explicitly enable paid access. No scheduled or synthetic inference probes are used.

`PUT /admin/settings` accepts a setting-name/value map, for example:

```json
{ "models.exclude_paid": "1" }
```

Only the owner can write this key, and only `"0"` and `"1"` are accepted. Changes notify other open tabs to refresh their model metadata. `/admin/models` returns only resolved `paid_required: true | false` entries; the OpenAI-compatible model response exposes the same metadata as `x-paid-required`. Records retain `access_source` and `access_checked_at` for auditability. Null is reserved for incomplete internal/legacy records and is not offered to the user.

## Choose the models in your chat

Open **Settings > Models**, directly at `/settings/models/`. Each available model has a checkbox. Unchecking it hides that model from your chat pickers; checking it restores it. Changes save immediately for the signed-in account and persist across reloads, devices and catalog refreshes. Other users' choices are independent.

Hidden models stay in this Settings list so they can be restored. Search by model name or task to find an entry. Other open chat tabs refresh their picker after a saved change. If the selected model is hidden, the picker chooses another selected model; if none remain for that task, the composer is disabled and links back to Settings. A failed save restores the previous checkbox state and reports the error.

This is a personal display preference, not a security or billing policy: it does not disable the model globally, modify other users, or remove models from the OpenAI-compatible `/v1/models` API. **Exclude paid** remains a separate owner-controlled policy and cannot be bypassed by checking a model.

Preferences are sparse, private per-user/per-model settings. A single-model PATCH prevents concurrent checkbox edits from overwriting each other. Catalog sync never replaces these preferences. They are removed when the account is deleted and cannot be read or modified through the generic shared settings API.

### Settings navigation

Settings sections have actual links and generated pages:

| Section | Path |
| --- | --- |
| Account | `/settings/account/` |
| Devices | `/settings/devices/` |
| Auth | `/settings/auth/` |
| Models | `/settings/models/` |
| Cache | `/settings/cache/` |
| Invites (owner only) | `/settings/invites/` |

`/settings/` still opens Account. Normal clicks switch sections without reloading the page; the URL, browser Back/Forward and reload stay synchronized. Links also support copy-link and opening in a new tab. A non-owner opening the Invites URL is returned to Account without rendering invite controls. Unknown section paths return 404.

## Workspace conversations

The existing product navigation is retained. Conversations appear directly beneath **Workspace** as soon as the first message is submitted, before inference finishes. Titles are derived locally from that message; no title-generation model call is made.

A conversation is saved with a server-generated ID and the authenticated user's ID. Workspace and History share the same query cache, so create, rename and delete updates do not require per-token polling. The list is bounded to the 100 most recently updated conversations and scrolls independently of the remaining navigation links. **New chat** opens a blank workspace without deleting previous conversations. Reopening a conversation restores its transcript and available selected model.

Chats are private to the account that created them. The sidebar and conversation API are tested with separate owner/member sessions as well as desktop/mobile layouts.

## Verification

Regression coverage includes setting persistence through reload, opt-in and opt-out, server-side blocking before `AI.run`, paid-error learning across catalog refreshes, dollar labels, immediate pre-inference chat visibility, preserved navigation, reopen/new-chat flows and account isolation. Browser inference uses the local deterministic test binding, not remote Workers AI.
