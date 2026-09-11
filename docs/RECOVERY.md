# VibeFlare recovery guide

Most VibeFlare recovery starts with one command:

```bash
vf doctor
```

`doctor` is read-only. It checks the local installation receipt, the deployed Worker, API access, and the pieces VibeFlare needs to continue safely.

## Setup stopped partway through

Run the same setup command again. VibeFlare records resources as they are created and reuses resources already owned by that installation instead of treating every retry as a brand-new install.

```bash
vf setup
```

If you used a custom installation name or authentication mode, repeat those same options. Do not manually delete a Worker, D1 database, or R2 bucket just because setup stopped: the receipt is what lets VibeFlare distinguish its own resources from unrelated Cloudflare resources.

## `vf` cannot find the installation

List/check the same name you used during setup:

```bash
vf status --name=YOUR_INSTALLATION_NAME
```

Local ownership receipts live under:

```text
${XDG_STATE_HOME:-~/.local/state}/vibeflare/installations/
```

Do not create a replacement receipt by hand. If the receipt is missing while Cloudflare resources still exist, VibeFlare deliberately refuses to guess that same-named resources belong to it.

## Update failed

Run:

```bash
vf doctor --name=YOUR_INSTALLATION_NAME
vf status --name=YOUR_INSTALLATION_NAME
```

A failed update does not overwrite the last successfully installed release in the receipt. After correcting the reported problem, rerun:

```bash
vf update --name=YOUR_INSTALLATION_NAME
```

The update reuses the recorded D1/R2 resources, applies pending migrations, deploys, checks health, and records the new release only after success.

## Login stopped working after changing domains or auth mode

Passkeys are bound to the configured relying-party/origin. Cloudflare Access mode also has its own identity authority. Do not mix a standalone passkey/GitHub setup with an Access-protected domain and expect both login systems to authenticate the same browser request.

Run `vf doctor`, then use the same authentication mode and origin recorded for the installation. If you intentionally need to change those values, treat it as an installation configuration change and verify login before removing the previous route.

## API key stopped working

Check the deployment first:

```bash
vf status
vf doctor
```

Then create a new API key in the VibeFlare **API Keys** page if the old key was revoked or lost. Plaintext API keys are shown only when created; VibeFlare stores their hash, so it cannot recover an old plaintext key for you.

## Uninstall stopped partway through

Start with preview again:

```bash
vf uninstall --name=YOUR_INSTALLATION_NAME --preview
```

The receipt records completed destructive steps. A retry resumes from that state rather than broad-searching Cloudflare by resource name. Permanent deletion still requires the explicit confirmation value:

```bash
vf uninstall --name=YOUR_INSTALLATION_NAME --confirm=YOUR_INSTALLATION_NAME
```

If VibeFlare refuses because ownership is unknown, do not bypass that guard by editing the receipt. Inspect the Cloudflare resources and recover authoritative ownership information before deleting anything.

## Before manual Cloudflare changes

If a recovery command is blocked, capture these first:

```bash
vf status --name=YOUR_INSTALLATION_NAME
vf doctor --name=YOUR_INSTALLATION_NAME
```

Keep the local install receipt. Manual deletion should be the last resort because it removes the ownership evidence VibeFlare uses for safe updates and uninstall.
