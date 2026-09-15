# Canonical Spargax identity, owner amendment 2026-09-15

The owner has replaced the suite's logos with the compact ribbon/flame and full
SPARGAX lockup in `alexcodeplace/vibeclub/assets/`. This amendment supersedes the
September 13 VF logo selection and dot silhouette, not the VibeFlare product name,
application behavior, auth state, routes, existing deployment or Club design kit.

Current public assets and the finite dot engine are imported from an exact suite
commit, recorded in their provenance files. The small mark serves compact headers
and browser/home-screen icons. Spacious headers/sidebar use the full light/dark
lockup with a visible VibeFlare product label. Images retain aspect ratio, palette
and orientation. Dark mode changes only the original monochrome lettering.

The existing interaction contract is preserved: local pointer/tap/keyboard Replay,
finite reforming animation, no work at rest, visibility pause, reduced-motion and
forced-color static alternatives, no-JavaScript/canvas-failure fallback, bounded
DPR/paint work and complete removal cleanup. The current sampled shape is 56x56,
with 16 colors from the actual supplied compact mark. No auth state enters the
animation module.

All nine original VF images and the original manifest remain byte-identical.
Retired public derivatives and old sampled data are preserved under
`docs/design/logo/retired-runtime/`, no longer a live-logo authority. Verification
checks that archive separately from the new canonical runtime. The maintenance
command now imports the suite instead of reintroducing the retired identity:
`python3 tools/build-logo-assets.py <canonical-checkout> <approved-commit>`.

The UI build invokes both archive and current runtime checks. Review the unchanged
interaction tests, new identity tests and real light/dark/mobile screenshots before
merging/deploying. Source, native packages and existing web instances need separate
release receipts; this document is not one.

## Private runner availability during rollout

The old `vibeflare-debian1` runner is offline during planned disk maintenance.
The readiness job now selects the dedicated Overdeck-managed
`vibeflare-arc-k3s` scale set. Its same-repository condition and complete check
are unchanged. It does not select another repository's runner or remove a gate.
The full browser gate additionally retains its disposable test-server logs, so a
server crash cannot be mistaken for a logo assertion failure.
