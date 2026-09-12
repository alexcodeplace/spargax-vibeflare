# Model access and Workspace conversations

## Exclude paid

Settings > Models contains an **Exclude paid** checkbox. It is enabled on new and existing installations unless the owner explicitly saves `models.exclude_paid=0`. This is an installation-wide policy; members can see it but cannot change it.

With the policy enabled, known paid-required models are removed from the browser picker and `/v1/models`. The inference dispatcher also rejects a stale selection or direct API request before calling Workers AI. With the policy disabled, paid models are selectable and carry a **💲 Paid** marker. Models compatible with the free allocation remain ahead of paid models in automatic selection.

The setting is not a spending cap. Free-compatible requests still consume neurons, and Cloudflare's plan, allocation and other products determine the bill. A model with unknown billing is labeled **billing unknown**, not represented as free.

## Classification without inference probes

Classification comes from Cloudflare's public catalog and the explicit paid-billing note in its pricing documentation:

- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/platform/errors/

A daily/lazy metadata refresh makes ordinary HTTP requests, not model requests. A small dated fallback handles old cached rows and temporary documentation outages. Missing or unrecognized metadata stays unknown. A newer explicit classification can supersede the fallback.

Workers AI error `5035` observed during a real user request records paid-required status immediately. That observation survives subsequent catalog refreshes. It is not counted as an unhealthy-model failure and does not disable a model for users who explicitly enable paid access. No scheduled or synthetic inference probes are used.

`PUT /admin/settings` accepts a setting-name/value map, for example:

```json
{ "models.exclude_paid": "1" }
```

Only the owner can write this key, and only `"0"` and `"1"` are accepted. Changes notify other open tabs to refresh their model metadata. `/admin/models` exposes `paid_required: true | false | null`; the OpenAI-compatible model response exposes the same metadata as `x-paid-required`.

## Workspace conversations

The existing product navigation is retained. Conversations appear directly beneath **Workspace** as soon as the first message is submitted, before inference finishes. Titles are derived locally from that message; no title-generation model call is made.

A conversation is saved with a server-generated ID and the authenticated user's ID. Workspace and History share the same query cache, so create, rename and delete updates do not require per-token polling. The list is bounded to the 100 most recently updated conversations and scrolls independently of the remaining navigation links. **New chat** opens a blank workspace without deleting previous conversations. Reopening a conversation restores its transcript and available selected model.

Chats are private to the account that created them. The sidebar and conversation API are tested with separate owner/member sessions as well as desktop/mobile layouts.

## Verification

Regression coverage includes setting persistence through reload, opt-in and opt-out, server-side blocking before `AI.run`, paid-error learning across catalog refreshes, dollar labels, immediate pre-inference chat visibility, preserved navigation, reopen/new-chat flows and account isolation. Browser inference uses the local deterministic test binding, not remote Workers AI.
