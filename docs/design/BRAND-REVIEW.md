# Spargax VibeFlare brand review

## User approval gate

The user requested the Club brand redesign and deployment to their existing Vibeflare Worker for review **before merging to main**.

- Current review candidate: `feat/spargax-brand-preview-20260913`.
- Do not merge or push the redesign to `main` without subsequent user approval.
- Target: `vibeflare.shrill-moon-94bd.workers.dev`.
- Preserve authentication, user data, storage, quota, schedules, resource bindings and runtime configuration. This is a presentation-only deployment, not a database migration.

## Design contract

Reuse the canonical runtime assets from `/home/user/Projects/spargax/apps/club/public/assets/club` (the requested `app/club` path is actually `apps/club`). Match Club's navy, blue/cyan and polished glass language, with light and dark artwork, rounded surfaces, subtle shadows, hover feedback and restrained effects. Use Poppins for English, Noto Sans Hebrew for Hebrew and Outfit for numerals. Preserve functional navigation and chat behavior. Respect reduced motion, keyboard focus and small viewports; no scroll interception or continuous animation loop.

## Candidate provenance

The candidate combines the committed primary redesign (`7c25eb0`), the reviewed restricted-storage theme fix and font license notices (`ad06cc1`), and the primary worktree's preserved final UI/hydration/Workspace/auth changes. The original worktrees were not reset, discarded or committed over. The current production/main base is `5894d0a` (v0.9.3), and is already an ancestor of this candidate. There are no Worker or shared-runtime changes relative to that base.

The final follow-up adds deterministic first-render behavior across independently hydrated chat roots, keyboard-operable collapsible Recent chats under Workspace, visible branded login actions, and matching regression coverage. A type-unsafe assertion in the new theme test was also corrected without weakening the assertion.

## Verified on 2026-09-13

- Asset integrity: all 128 Club files match the canonical manifest byte-for-byte (539,556 bytes).
- UI unit tests: 28 passed across six files, including four shared-cache hydration regression cases and six theme continuity cases.
- Astro diagnostics: 0 errors, 0 warnings; two existing GitHub icon deprecation hints.
- Island hydration audit: passed.
- Production UI build: all 11 routes generated successfully.
- Worker TypeScript: passed, with no Worker source changes.
- Complete browser suite: 68 passed; 0 failed, flaky or skipped. No snapshot updating was used during this verification.
- Browser coverage includes desktop/mobile route and permission matrices; rendered font families and theme tokens; light/dark asset loading; reduced motion and restricted browser storage; focus trapping and navigation; paid-model filtering; collapsible Workspace history; passkey flows; local Worker streaming chat, invitations, API keys, analytics and private file lifecycle.
- Desktop dark and mobile light screenshots were visually reviewed. Browser screenshots are under `apps/ui/test-results/brand-*.png`.

Logs and machine-readable browser results are in the worktree's ignored `.internal/qa/` directory. Tests use an isolated local D1/R2/DO fixture on port 18983, not the production database. No production inference is part of this verification.

The legacy `notices:check` command could not reopen its old ephemeral pnpm v11 package index after the VM restart (shared-store SQLite error; an empty native store has no package indexes). The candidate has no dependency or license-inventory changes relative to `ad06cc1`; the requested self-hosted fonts and their license texts are present. This environmental check failure is not counted among the passing checks above.

## Deployment preflight

The user-provided account token was accepted by Wrangler for the account owning `shrill-moon-94bd`. Its value is not included in source, command arguments, receipts or chat. The live account and Worker bindings were checked against the previously verified v0.9.3 configuration.

Pre-review live version: `28dff9c7-bcfc-45d1-977e-22bbd4a531f6` (v0.9.3). Preserve this version for rollback. The final deployment/version identifiers and live verification will be appended after deployment.
