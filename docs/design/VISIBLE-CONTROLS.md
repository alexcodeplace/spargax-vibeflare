# VibeFlare interface and interaction specification

## Regular/Pro and Inspect: binding owner amendment (2026-09-14)

This existing interface specification adopts the [shared UX/INSP contract](https://github.com/alexcodeplace/vibeclub/blob/main/docs/specs/spargaxos-product.md#experience-and-inspect-contract)
and defines VibeFlare's required screen/settings/item inventory below. It supersedes
conflicting older one-size-fits-all onboarding or settings disclosure, not branding,
existing model-access policy, authentication, ownership or worker boundaries.
The new experience/Inspect implementation and acceptance are **OPEN**. Historical
control verification later in this document does not prove the new scope.

**VF-UX01. First onboarding decision.** A new user's first product onboarding screen
is Choose your experience: Regular / Pro, equally prominent, no preselection,
Continue with Regular / Continue with Pro, and You can change this anytime in
Settings > Experience. It precedes account setup, model configuration and first
inference. Only locale/accessibility/help/privacy and required platform security
may precede it. A pre-auth choice is a local non-secret draft, bound to the new
user after authentication; no private data is exposed publicly. Existing user
preferences are reconciled explicitly, never overwritten by another user's draft.
The selected mode persists immediately and governs setup, errors, help, task use,
settings, recovery and daily work. Pro never has to finish Regular onboarding first.

**VF-UX02. Persistence and scope.** Store experience per authenticated user using the
existing personal-preference ownership pattern, not the global `/admin/settings`
namespace. It is separate from personal model visibility and owner-controlled
`models.exclude_paid`. Account deletion/sign-out/cache invalidation must respect
identity boundaries. Standalone deployments work without a Spargax account. Host
inheritance is offered only through a real authorized connection, never assumed
cross-origin browser storage. An explicit app override wins. Existing users keep
configuration and active work while choosing a mode at a safe entry point.

**VF-UX03. Settings and switching.** Settings > Experience is reachable in both
modes, with a linkable `/settings/experience/` section following the existing tab
routing contract. It changes presentation, not the current task, model, prompts,
files, pending request, conversation, authentication, cache, cost policy or hidden
advanced values. Preserve drafts and context through a mode change. Partial saves
must not overwrite hidden or concurrent configuration. Search/deep links to Pro-only
editors show a permitted effective-value summary and explicit Edit in Pro action.
Do not auto-switch or return a false 404 for a supported but mode-hidden setting.
Unauthorized roles still receive the existing secure denial/redirect behavior.

### VibeFlare screen matrix

| ID / screen | Regular | Pro |
| --- | --- | --- |
| VF-V01 First run / account setup | First-mode choice, guided supported sign-in/owner setup, model choice and first useful task with clear cost/permission consequences. | Same choice, compact setup and supported advanced task/model configuration before first use; same authentication/ownership proof. |
| VF-V02 Workspace / task tabs | Consistent Text, Image, Embeddings and Audio layout with plain task explanations, input/drop review, model choice, output and useful failures. | Same tasks/layout plus supported request parameters, exact model/capability information and technical result metadata. Task type is not experience mode. |
| VF-V03 History / conversations / files | Own work, reopen/rename/delete/download, useful timestamps and clear media/partial-failure state. | Supported detailed filters, model/request/file metadata and direct Inspect affordances; no access to another user's records. |
| VF-V04 Usage / audit / health | Real measured usage/cost, failures, actionable status and existing authorized history/export. | Technical request/operation identifiers, source freshness and safe diagnostics. Unknown usage is not zero in either mode. |
| VF-V05 Settings / help | Experience, common controls below, actual privacy/security/access state, guided maintenance and practical help. | Advanced editors below with effective/default/source information, configuration references and concise engineering help. Same design tokens and role rules. |

### VibeFlare settings visibility

Every existing editable field must map to a row. Common means both modes, subject
to the same backend role/ownership checks; Pro-only refers only to UI editing.
Supported advanced fields must come from actual schemas/capability metadata, not
assumptions about every model. Inspect in either mode exposes only permitted state.

| ID | Common / Regular | Pro-only supported editing |
| --- | --- | --- |
| VF-S01 Experience / accessibility | Experience, language if supported, theme, reduced motion/accessibility and ordinary display preferences. | Optional technical-density defaults. Experience is never a billing tier. |
| VF-S02 Account / devices / invites | Account identity, sign-in/recovery, add/revoke own passkey device and owner-only invitations. | Additional technical metadata through Inspect, not additional privileges or secret access. |
| VF-S03 Who can sign in | Owner-authorized guided GitHub allowed-login management, including the consequence of an empty allowlist. | Exact supported auth configuration/allowlist representation. Do not make a secure basic deployment require Pro. |
| VF-S04 Models / paid policy | Personal model visibility/search, explicit task model selection and owner-controlled Exclude paid with its actual consequences. | Supported per-request model options. Pro never disables Exclude paid, restores hidden models or selects an unsupported/retired model automatically. |
| VF-S05 Task inputs / parameters | Prompt/file input, ordinary supported output choices, result review, cancel/retry and paid indicators. | Supported model-specific generation, sampling, limits or vector/output parameters where an actual schema permits them. Unsupported parameters are not generic enabled sliders. |
| VF-S06 Response cache | Effective retention state, relevant privacy implications and authorized Clear cache with scope confirmation. | `cache.responses.ttl_days` TTL editor and other supported tuning. Inspect never sets `cache.flush`. |
| VF-S07 Prompt templates | Existing template list, label/content editing, choose/add/delete with normal ownership and scope. | Supported advanced template configuration only if present; do not hide the existing useful template feature merely because it currently shares the Cache tab. |
| VF-S08 API keys / integration | Supported create/revoke key and copy-once secure setup workflow, scope/expiry consequences. | Supported detailed API configuration/reference controls; no privilege escalation or replay of stored key values. |
| VF-S09 Diagnostics / lifecycle | Actual version/health, safe diagnostics copy/export and supported install/update/uninstall actions. | Supported configuration/provenance/verbosity controls. Mode is not permission to change deployment resources. |

### VibeFlare inspectable inventory

Each eligible rendered card/row/status below offers right-click > Inspect and an
explicit More actions > Inspect menu. Keyboard uses the Context Menu key or
Shift+F10; touch uses the visible item menu. Preserve native text/input/link menus,
never trigger the row's primary action and never intercept the entire page.

The shared side panel contains Summary, Details and Evidence, source timestamps,
fresh/stale/unsupported/denied states and related authorized objects. Regular starts
with Summary; both can view safe structured details. Close restores appropriate
focus without cancelling work. Narrow layouts use an accessible modal equivalent.

| ID / eligible item | Permitted details and evidence / owner |
| --- | --- |
| VF-I01 Conversation / history item | Own conversation ID, task, timestamps, associated model/request/result references and lifecycle. Transcript remains in its authorized conversation view, not an automatic diagnostic export. |
| VF-I02 Message / inference request / result | Request ID, requested/actual model when recorded, safe supported parameters, lifecycle/timing, measured token/unit/cost data with source and failures. No inferred hidden reasoning, request credentials or automatic prompt-body dump. |
| VF-I03 Model / model-visibility / paid marker | Exact ID/task/capabilities, active/retired state, personal visibility, paid-required policy and actual catalog source/check time. Inspect does not refresh the catalog by inference or change policy. |
| VF-I04 Uploaded file / generated image/audio/vector/artifact | Authorized artifact identity, type/size, originating task/model/request, timestamps and availability. Actual artifact download uses existing authorization; metadata Inspect does not fetch unrelated file content. |
| VF-I05 Usage / audit / operation/error row | Actor/scope allowed by existing role, operation/request ID, real measured units/currency/interval, timestamp, safe result/error and related objects. No cross-user usage/history discovery. |
| VF-I06 API-key / passkey-device / invitation row | Safe record identifier/label, authorized scope/status, creation/expiry/revocation or last-used time when supplied. Never key values, passkey material, invitation bearer token or authentication cookies. |
| VF-I07 Cache / prompt-template item | Effective retention/config source, permitted template identity/version/label, recorded cache metadata and truncation. Private prompt/response bodies are not implicitly exported; use their ordinary authorized editor/view. |
| VF-I08 Setting / health / deployment receipt | Effective/default/overridden value, personal versus installation scope, actual source/support/version, owner and observed state/error. Preserve deployment ownership and secret exclusions. |

Inspection projections are authorized and allowlisted by the existing Worker/service,
not raw records masked in CSS. Bound requests, paginate and declare truncation;
late responses cannot populate another selected item. Sign-out/revoke clears stale
private caches. Opening/refreshing Inspect cannot call a model, flush a cache, send
a request again, repair, deploy or mutate configuration. Explicit Copy summary,
Copy safe structured details and Export inspection report follow the shared preview,
privacy and save-failure contract. No automatic support upload or unrestricted raw
request/log export. Navigation to an existing action does not duplicate it in Inspect.

### VibeFlare acceptance and drift

**VF-A01.** Extend first-owner and new-member journeys with both first-choice modes;
returning users restore their saved choice. Test provisional choice/account binding,
conflicts, failed saves, restart, upgrade and two-user isolation without changing
owner bootstrap or passkey/security guarantees.

**VF-A02.** Exercise every VF-V/VF-S row, including all four task types, permission
and paid-policy invariants, Pro-only search/deep links and mode changes during an
unsaved prompt/file upload/inference. Equivalent explicit parameters use the same
Worker operation and preserve hidden/custom values.

**VF-A03.** Exercise every VF-I object with right-click, item menu, keyboard and touch;
verify native text menus, focus, narrow layouts, source/error states, stale/late/
denied data, safe copy/export and no inference/cache/other mutations on inspection.
Plant secrets and cross-user fixtures; prove they do not reach inspector payload,
DOM, clipboard or export. Existing public API output contracts are unchanged.

**VF-A04.** Include both modes/Inspect in supported locale, theme, accessibility,
performance and browser acceptance. Record each ID against exact code/release and
evidence, distinguishing missing implementation from tests not run. Audit against
this spec; do not delete requirements to match the current UI or old screenshots.

## Design and asset decisions

The Settings navigation must read as separate, selectable tabs, not a line of adjacent text. Actions must have a visible hit target, padding, border and state feedback. The fix lives in the shared Button and Tabs adapters, so Settings, chat controls, dialogs and other application actions remain consistent.

The existing Club asset kit already supplies the required artwork. No new or duplicated image assets were introduced:

- Primary buttons reuse `button-primary-idle.svg`, `button-primary-hover.svg`, `button-primary-pressed.svg` and `button-primary-disabled.svg`.
- Secondary, outline and ghost buttons reuse `button-secondary-idle.svg` and `button-secondary-hover.svg`.
- Selected tabs reuse `language-segment-active.svg`, the existing filled segment surface. Inactive tabs reuse the secondary button surface.

Each file is selected from the existing `dark/surfaces` or `light/surfaces` directory. `node tools/sync-club-design-assets.mjs --check` verifies the complete canonical kit without altering it. The controls stylesheet reuses only the center fill of each SVG: a 24px slice excludes the supplied glow gutter, rounded edge and inset keylines, and zero-width image borders prevent those strokes from being painted. The clipped fill stays inside the control. One 1px CSS border owns the perimeter and a soft external shadow provides depth without an inset outline. SVGs remain decoration, not images of text or replacements for semantic controls. Borders and background colors remain usable when an image request fails. Destructive actions keep a distinct red surface.

## Control invariants

Every shared button and tab has one visible perimeter in idle, hover and pressed states. Decorative artwork must not add a second or third edge, and controls must not grow or shift between states. A keyboard-only focus outline is intentional and must not be clipped or removed to achieve the single-edge appearance.

Passkey, GitHub OAuth/bootstrap and GitHub device-flow actions use the shared primary Button variant. The auth layout owns only sizing, not foreground/background overrides. This prevents white text being paired with the light secondary/outline SVG. The primary and selected-tab fill filters keep white labels readable across the actual gradient, not only against the fallback CSS background. Enabled labels must achieve at least 4.5:1 rendered contrast in both themes, including hover and pressed states. Disabled/loading behavior remains owned by Astryx.

## Behavior

The tab rail has a boundary, spacing between targets, and a filled selected tab. Tabs wrap at narrow widths instead of squeezing labels together or clipping the final section. Tab and mobile button hit targets are at least 44px tall. Desktop small buttons are 40px tall.

Astryx continues to own button activation, loading/disabled behavior and keyboard navigation. In-page tabs control existing panels with instance-unique IDs and accessible names. Settings sections remain real navigation links with `/settings/<section>/` URLs and `aria-current`, and their visible regions are labelled by the corresponding link. Inactive panels remain empty and hidden, so their content does not mount early. The selected panel is keyboard focusable. Focus outlines, reduced motion and system forced colors remain supported.

The model-visibility checkboxes and direct Settings routes from v0.9.5 are retained, including reload, Back/Forward and opening a section in a new tab. Both navigation links and in-page tabs receive the same selected surface.

The design-system gallery opens its invite-form demo on demand and lets it close. An always-open demo must not block interaction with the button samples.

Buttons expose stable variant and size attributes for styling. Composed JSX labels now produce their actual accessible name instead of the generic name `Action`; explicitly supplied accessible names still take precedence.

## Regression coverage

`VisibleControls.test.tsx` covers styling hooks, activation, loading, composed labels, controlled selection and multiple uniquely associated tab instances.

`UI-visible-controls.spec.ts` covers both themes at 1440px, 390px and 320px; all Settings tabs; target size and separation; loaded artwork; primary/secondary/danger/ghost/outline sizes and states; keyboard focus; disabled/loading behavior; failed-artwork fallback; and forced colors. Its Settings interactions use the isolated local Worker fixture, not production credentials or data.

`UI-control-invariants.spec.ts` adds passkey/GitHub contrast checks in idle, hover and pressed states at desktop and mobile sizes, plus single-perimeter assertions on login and workspace controls in both themes. The contrast helper captures the browser-composited fill with only the ink temporarily hidden, restores the DOM in a `finally` block, and measures against the actual computed label colors. It accounts for SVG fills, transparency and filters, which a CSS-background-only check misses. The shared-gallery checks enforce the same single-edge invariant for every button variant and size.

The existing route/role screenshot matrix intentionally changes with the shared controls. Review those images before accepting updated baselines, then rerun the full browser suite without updating snapshots.

## Verification commands

Run the build before the browser tests. Keep Astro build and diagnostics sequential to avoid conflicting generated files in offloaded build environments.

```sh
pnpm --filter @vibeflare/ui build
pnpm --filter @vibeflare/ui typecheck
pnpm --filter @vibeflare/ui test
VF_E2E_PORT=18989 VF_E2E_SKIP_BUILD=1 pnpm --filter @vibeflare/ui exec playwright test
node tools/sync-club-design-assets.mjs --check
git diff --check
```

## Deployment safeguards

This is a presentation-only change. Worker source, authentication, database schema and production resource identities are unchanged. Upload a version using the verified live resource configuration, stage it with zero ordinary traffic, verify its HTML and assets against the tested build, and promote only after the staged check passes. Repeat the checks without the version override after promotion. Preserve existing variables, bindings, schedules and Worker URL settings; do not run a remote database migration for this change.

## Verified on 2026-09-13

The final candidate incorporates main's v0.9.5 model-selection and Settings-route changes. The 17-route production build, island audit, Astro diagnostics (zero errors or warnings), 35 UI unit tests, 134 Worker unit tests, and all 85 browser tests passed. The final browser run had no retries, failures, skipped cases or snapshot updates. Both themes and desktop/mobile screenshots were visually checked. All 128 canonical Club assets remain byte-for-byte intact. Worker and shared-runtime source are unchanged relative to v0.9.5 main.

Local verification used the installed executable entrypoints directly because the VM's pnpm store returned a disk I/O error. The same checked-in browser suite and fixture configuration were used, with an isolated local D1/R2/Durable Object state directory. No production account or data was used by the tests. The ignored `.internal/qa/` directory contains final build, diagnostic, unit, browser and visual evidence.
