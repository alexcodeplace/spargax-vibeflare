# Interactive VibeFlare dot logo

## User-approved direction

Replace the unrelated workflow-panels illustration and decorative play icon on the authentication screens with the supplied orange/red/gold VibeFlare logo, represented as an interactive grid of dots. Keep it lightweight and visually verify the effect before deploying. This applies consistently to login, signup and setup, without modifying their authentication behavior.

## Implementation contract

`FlareLogo.astro` renders the dot silhouette on the server. `flare-dots.ts` contains the compact sampled geometry and deterministic spring simulation. `flare-element.ts` adds a progressively enhanced, page-local Canvas 2D custom element. No new dependency, WebGL context, remote asset, AI call, full-screen filter, document-level pointer listener or continuous animation loop is required.

The warm silhouette was sampled from the user-provided logo PNG, SHA-256 `3d445a99a7799190e5c8faea355aac88dd04b0fff53b898e7a51019aeb66edae`, excluding its dark app-icon frame. It uses 607 colored dots in a 3,080-dot grid. The same coordinates/colors form the no-JavaScript SVG fallback and interactive canvas. This is a brand effect, not a playable video.

Pointer motion gently pushes nearby dots with a small tangential drift. A click, touch or keyboard-operable Replay button triggers a short outward ripple. Dots reform the logo after the pointer leaves; a stationary pointer settles without a permanent render loop. The entrance ripple is finite and occurs only when the artwork first enters view.

Reduced motion leaves a static logo and hides the replay control. Forced colors renders the static silhouette using system colors. Missing JavaScript or unavailable Canvas 2D preserves the SVG fallback. Touch uses `pan-y` so the effect cannot trap vertical scrolling. Hidden/offscreen artwork cancels pending animation; disconnection on Astro navigation removes observers and event listeners.

The canvas caps its backing store at 900×570 and device-pixel ratio at 1.5. Paths are batched by eight logo colors plus the background, without per-dot shadows. Sustained expensive paints lower the target from 60 to 30 fps. Idle execution must stop completely. Diagnostics expose only non-sensitive animation counters and timing, for reproducible browser verification.

## Acceptance

- The old workflow-panel illustration and caption/play treatment are absent from the auth story.
- Both light/dark and desktop/mobile layouts retain readable branding and functional sign-in controls.
- Real pointer movement changes rendered pixels, the shape reforms, and the frame counter stops at rest.
- Keyboard replay, touch ripple, reduced-motion, no-JavaScript, no-canvas, hidden/offscreen pause and DOM cleanup are tested.
- Real-browser before/interaction/after screenshots are visually inspected, with bounded-paint measurements under normal and 4× CPU throttling.
- The renamed repository's real GitHub PR gate must finish successfully before merge; runtime state alone is not a CI pass.
- Deployment must preserve existing Worker bindings, secrets and data, and the normal live URL must serve the tested build.

## Measured verification — 2026-09-13

All nine focused browser checks passed against the final supplied-symbol geometry: pointer response/reformation at desktop/mobile widths in both themes, keyboard replay, touch scrolling, reduced motion, forced colors, no-JavaScript/no-canvas fallbacks, hidden/disconnected suspension and CPU-throttled behavior. The final geometry has607 colored logo dots within the3,080-point grid. Frame counters stopped at rest, with no pending animation frame.

Observed canvas-paint p95 was2.3–2.8ms in the local desktop/mobile runs and3.6ms with4× CPU throttling. These are canvas paint measurements, not whole-application latency claims. The emitted interactive module is8,328bytes,2,925bytes gzip. No new runtime dependency was added. The renderer and logo deformation were also visually inspected in a headed browser using the VM display and real pointer movement.

The zero-traffic Cloudflare version`e8aee05e-64fe-434d-b9b4-2fc871cf1565` passed same-host staged verification: exact HTML/assets, all seven runtime logo derivatives, both themes at1440/390px, and actual rendered pointer interaction returning to rest. Production promotion is guarded by both GitHub jobs passing for the exact PR head, followed by the same checks without a version override. Final CI and deployment receipts are recorded in PR#6 and the private VM release archive; a staged pass alone is not a production release claim.

## Canonical logo integration

The subsequent user-provided nine-file logo pack is now the source of truth in`docs/design/logo/`. The transparent VF symbol supplies the interactive silhouette and app icons; the transparent image wordmark replaces typed branding in both Astro and React navigation. Runtime derivatives are optimized, hash-verified and separate from the unchanged originals.
