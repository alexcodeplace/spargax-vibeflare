# Spargax interactive dot mark

Public design-only implementation shared by Club and VibeFlare. The supplied
Spargax logo is sampled by `scripts/brand/build-logo-assets.py`; generated
`spargax-dots.json` is copied exactly, not edited by a consumer. `physics.ts` is a
bounded pure spring step. `element.ts` registers a page-local custom element with
finite RAF scheduling and complete observer/listener cleanup. No auth state or
private app logic is included.

The interaction engine is adapted from `alexcodeplace/vibeflare` revision
`d9471be`, `apps/ui/src/lib/flare-{dots,element}.ts`, under its MIT license.
See `LICENSE` for that license. Runtime appearance must follow BRAND-05.

Required children: a canvas, a `[data-dot-replay]` button (initially hidden) and
a `[data-dot-hint]` span. Supply translated `data-hint-rest`, `data-hint-pointer`,
and `data-hint-touch` attributes. Provide a static SVG fallback independently;
never make authentication depend on canvas initialization. `getDiagnostics()`
exposes only animation metrics for acceptance, not account or input contents.
