# Changelog

All notable VibeFlare changes are documented here.

## Unreleased

- Zero-config installs now load Cloudflare's full public Workers AI catalog with a 24-hour lazy refresh, an explicit Refresh models action, known-good models ranked first, and Llama 3.2 3B as the default text model.
- Workers AI usage now records `usage.neurons` returned by Cloudflare, and the header shows the live neuron count against the 10,000-neuron daily free allocation instead of only a rounded percentage.
## 0.9.2 - 2026-09-11

- **Use GitHub** now works with zero deployment environment variables by bootstrapping a per-deployment GitHub App through GitHub's App Manifest flow; generated OAuth credentials stay private in D1.
- Existing `GITHUB_CLIENT_ID` / `--github-client-id` Device Flow configuration remains an explicit advanced override.

## 0.9.1 - 2026-09-11

- Route brand-new standalone deployments to `/setup` instead of the returning-user sign-in screen.
- Expose first-run setup state through the public auth-methods probe and cover the root-to-setup flow in browser acceptance.

## 0.9.0 - 2026-09-11

Initial standalone public release.

### What members get

- One-click **Deploy to Cloudflare** installation from the repository README, with automatic D1, R2, Workers AI, Durable Object, migration, UI-build, and Worker deployment setup.
- Guided `vf setup` for a VibeFlare-owned Worker, D1 database, and R2 bucket.
- Passkey-first standalone browser login, optional GitHub Device Flow, and a separate Cloudflare Access mode.
- Browser chat plus an OpenAI-compatible `/v1` API.
- API-key creation and revocation, model discovery, usage/audit views, chat history, and private files.
- `vf status`, `vf doctor`, and receipt-based `vf update`.
- Preview-first, ownership-receipt-based uninstall that refuses ambiguous deletion.

### Release hardening

- The deploy-button path requires no pre-generated session secret or Cloudflare model-catalog API token: session signing self-initializes in D1, WebAuthn derives its relying-party origin from the request URL, and a known-good Workers AI model is available immediately.
- Root deploy-button Wrangler configuration is validated with a Wrangler dry-run on every release gate.
- Browser authentication modes are mutually exclusive so Cloudflare Access cannot compete with passkey/GitHub login.
- `vf doctor` now checks quota through the bearer-key `/v1/quota` API, so a valid CLI key can verify server, API auth, and quota end-to-end.
- Unauthorized browser chat paths return to the real `/login` page instead of a nonexistent auth page.
- Install/update/uninstall use durable ownership receipts and preserve retry state on partial failure.
- Clean release installs resolve their project-local Wrangler correctly even when pnpm places it under the Worker package.
- Fresh workers.dev deployments tolerate bounded propagation delay before setup declares health failure.
- Migration history is checkpointed immediately after application so later deploy/health failures cannot erase schema evidence.
- Deleting an invited user preserves the invite's consumed state while safely releasing its historical user reference.
- D1 migrations use a unique ordered `0001`–`0007` filename sequence.
- First model access automatically initializes a brand-new Workers AI catalog; members no longer need to find and run a manual sync after setup.
- First-run catalog readiness is committed only after a complete sync, so concurrent page loads cannot observe a partial model list or choose the wrong default model.
- Browser chat prefers a live-proven text model instead of trusting arbitrary catalog order.
- Workers AI reasoning, vision, speech-to-text, and text-to-speech payload differences are normalized across supported model families.
- Setup generates deployment-specific Wrangler configuration instead of requiring account IDs in tracked source.
- Dependency upgrades remove known production audit vulnerabilities while preserving the approved UI screenshots.
- The release gate covers build, generated Wrangler validation, production dependency audit, unit/integration tests, user journeys, and the deterministic desktop/mobile UI matrix.
- pnpm uses a three-day strict dependency release-age gate and an explicit dependency build-script allowlist.

### Compatibility

- Node.js 22.12 or newer.
- Bun is required to build the standalone `vf` command.
- Cloudflare Wrangler is installed project-locally from the locked dependency graph.
