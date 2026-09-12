# Spargax VibeFlare brand review

## User approval gate

The user requested the Club brand redesign in `~/Projects/spargax-vibeflare/`, then explicitly requested deployment to their existing Vibeflare Worker for review BEFORE merging to main.

- Keep the redesign on `feat/spargax-brand-20260912`.
- Do not merge or push redesign changes to `main` without subsequent user approval.
- Deploy the verified branch build to the user's existing `vibeflare.shrill-moon-94bd.workers.dev` installation. Verify the actual account and existing resource bindings first; never deploy the placeholder D1 configuration.
- Preserve authentication, user data, storage, quota and runtime configuration. This is a presentation-only deployment, not a database migration.
- Record the deployed commit, Cloudflare version, verification and rollback information here once deployed.

## Design contract

Reuse the canonical runtime assets from `/home/user/Projects/spargax/apps/club/public/assets/club` (the requested `app/club` path is actually `apps/club`). Match Club's navy, blue/cyan and polished glass language, with light and dark artwork, rounded surfaces, subtle shadows, hover feedback and restrained effects. Use Poppins for English, Noto Sans Hebrew for Hebrew and Outfit for numerals. Preserve functional navigation and chat behavior. Respect reduced motion, keyboard focus and small viewports; no scroll interception or continuous animation loop.

## Current status

An existing uncommitted brand worktree was found and is being reviewed rather than discarded. Build, typecheck and browser-test processes from the initial implementation were present when resuming; their results must be verified rather than assumed.
