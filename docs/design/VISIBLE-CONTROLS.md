# Visible tabs and buttons

## Design and asset decisions

The Settings navigation must read as separate, selectable tabs, not a line of adjacent text. Actions must have a visible hit target, padding, border and state feedback. The fix lives in the shared Button and Tabs adapters, so Settings, chat controls, dialogs and other application actions remain consistent.

The existing Club asset kit already supplies the required artwork. No new or duplicated image assets were introduced:

- Primary buttons reuse `button-primary-idle.svg`, `button-primary-hover.svg`, `button-primary-pressed.svg` and `button-primary-disabled.svg`.
- Secondary, outline and ghost buttons reuse `button-secondary-idle.svg` and `button-secondary-hover.svg`.
- Selected tabs reuse `language-segment-active.svg`, the existing filled segment surface. Inactive tabs reuse the secondary button surface.

Each file is selected from the existing `dark/surfaces` or `light/surfaces` directory. `node tools/sync-club-brand.mjs --check` verifies the complete canonical kit without altering it. The controls stylesheet uses nine-slice rendering to retain the original 12px glow gutters and rounded corners at different label widths. SVGs remain decoration, not images of text or replacements for semantic controls. Borders and background colors remain usable when an image request fails. Destructive actions keep a distinct red surface.

## Behavior

The tab rail has a boundary, spacing between targets, and a filled selected tab. Tabs wrap at narrow widths instead of squeezing labels together or clipping the final section. Tab and mobile button hit targets are at least 44px tall. Desktop small buttons are 40px tall.

Astryx continues to own button activation, loading/disabled behavior and tab keyboard navigation. Every tab controls an existing panel with an instance-unique ID and an accessible name. Inactive panels remain empty and hidden, so their content does not mount early. The selected panel is keyboard focusable. Focus outlines, reduced motion and system forced colors remain supported.

Buttons expose stable variant and size attributes for styling. Composed JSX labels now produce their actual accessible name instead of the generic name `Action`; explicitly supplied accessible names still take precedence.

## Regression coverage

`VisibleControls.test.tsx` covers styling hooks, activation, loading, composed labels, controlled selection and multiple uniquely associated tab instances.

`UI-visible-controls.spec.ts` covers both themes at 1440px, 390px and 320px; all Settings tabs; target size and separation; loaded artwork; primary/secondary/danger/ghost/outline sizes and states; keyboard focus; disabled/loading behavior; failed-artwork fallback; and forced colors. Its Settings interactions use the isolated local Worker fixture, not production credentials or data.

The existing route/role screenshot matrix intentionally changes with the shared controls. Review those images before accepting updated baselines, then rerun the full browser suite without updating snapshots.

## Verification commands

Run the build before the browser tests. Keep Astro build and diagnostics sequential to avoid conflicting generated files in offloaded build environments.

```sh
pnpm --filter @vibeflare/ui build
pnpm --filter @vibeflare/ui typecheck
pnpm --filter @vibeflare/ui test
VF_E2E_PORT=18989 VF_E2E_SKIP_BUILD=1 pnpm --filter @vibeflare/ui exec playwright test
node tools/sync-club-brand.mjs --check
git diff --check
```

## Deployment safeguards

This is a presentation-only change. Worker source, authentication, database schema and production resource identities are unchanged. Upload a version using the verified live resource configuration, stage it with zero ordinary traffic, verify its HTML and assets against the tested build, and promote only after the staged check passes. Repeat the checks without the version override after promotion. Preserve existing variables, bindings, schedules and Worker URL settings; do not run a remote database migration for this change.
