# README screenshot provenance

The images in this directory come from the actual Spargax VibeFlare production UI build, served by the isolated local E2E Worker. They are not generated mockups or captures of a production account.

`manifest.json` records the capture time, package version, source commit, exact served-build HTML hashes, route, theme, viewport, PNG checksum, and size for each capture. The source commit identifies the runtime used for the screenshots; later documentation-only commits do not change that UI.

## What the pictures show

| Image | Source | Notes |
| --- | --- | --- |
| `vibeflare-landing.png` | `/chat/`, desktop, dark | Workspace with task tabs, model picker, starter prompts and Club artwork. |
| `vibeflare-settings-models.png` | `/settings/models/`, desktop, dark | Real model-preference interaction, one deselected fixture model, and selected navigation surface. |
| `vibeflare-settings-light.png` | `/settings/cache/`, desktop, light | Cache actions and prompt-template inputs with the shared light control assets. |
| `vibeflare-settings-mobile.png` | `/settings/models/`, 390px, light | Separate wrapped navigation targets and model choices. |
| `vibeflare-chat.png` | `/chat/?chat_id=...`, desktop, dark | A persisted text conversation using the deterministic E2E response. |
| `vibeflare-key-creation.png` | `/keys/`, desktop, dark | Real local key creation. The one-time secret block is masked. |
| `vibeflare-login.png` | `/login/`, desktop, dark | Unauthenticated sign-in UI with the local fixture's passkey option. |
| `vibeflare-status-doctor.png` | CLI output | Actual `vf status` and `vf doctor` output displayed in a terminal-style HTML frame. Uses a synthetic local ownership receipt, not a Cloudflare deployment receipt. |

The small model catalog and accounts are fixtures. The text response is deliberately labelled `Hello from VibeFlare E2E`. No generated image, transcription, embedding, or paid inference result is represented as a live provider result. The capture uses no production credentials and resets its fixture after completion.

## Regenerate

Install this checkout's locked dependencies, then build the UI:

```sh
pnpm install --frozen-lockfile
pnpm --filter @vibeflare/ui build
```

From the repository root, start an isolated test Worker in one terminal. This script creates its own temporary local D1/R2/Durable Object state and removes it when stopped:

```sh
VF_E2E_PORT=18995 VF_E2E_SKIP_BUILD=1 bash apps/ui/scripts/start-e2e.sh
```

In a second terminal, capture the current UI:

```sh
VIBEFLARE_SCREENSHOT_BASE_URL=http://localhost:18995 \
VIBEFLARE_SCREENSHOT_ALLOW_RESET=1 \
pnpm --filter @vibeflare/ui screenshots:release
```

The explicit reset flag is required because capture seeds and clears test data. Use a dedicated fixture, not a local instance containing work you care about. Remote hosts, credentials in URLs, and non-origin URLs are rejected before any request. The script also verifies the E2E-only state endpoint and exact served HTML before resetting data.

The capture checks hydrated UI, theme selection, model-preference saving, mobile bounds, chat persistence, one-time key creation and asset loading. It stages PNGs in a temporary directory and replaces the committed images only after the complete capture succeeds. Source, version and migration names are read from the checkout rather than hard-coded to an older release.

Stop the test Worker after capture, review the PNGs at full size, and commit the images with the manifest. Do not manually repaint the interface or substitute production-looking responses. The masked API-key block is the only intentional concealment in a browser capture; the CLI frame is explicitly labelled as a local fixture.

## Verification

```sh
pnpm --filter @vibeflare/ui test
node tools/verify-readme-screenshots.mjs
git diff --check
```

The verifier checks PNG checksums and signatures, manifest completeness, dimensions, and README image references. Screenshot freshness is evidence about the source build, not proof that a running Cloudflare deployment serves it.
