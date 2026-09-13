# Visible tabs and buttons

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
