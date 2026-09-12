import { defineCommand } from 'citty';
import { setupInstallation } from '../lib/lifecycle.js';
import { readInstallReceipt, type InstallReceipt } from '../lib/install-state.js';
import {
  lifecycleContext,
  normalizeOrigin,
  promptText,
  rpIdFromOrigin,
} from '../lib/lifecycle-cli.js';

function optionalArg(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function printSetupComplete(receipt: InstallReceipt): void {
  const url = receipt.browserAuth.origin || receipt.deployment?.url || 'not assigned';
  console.log('\nSetup complete.');
  console.log(`  Installation: ${receipt.installation}`);
  console.log(`  URL: ${url}`);
  console.log(`  Worker: ${receipt.resources.worker?.name}`);
  console.log(`  D1: ${receipt.resources.d1?.name}`);
  console.log(`  R2: ${receipt.resources.r2?.name}`);
  console.log('\nNext:');
  console.log(`  1. Open ${url}/setup and create the first owner.`);
  console.log('  2. Create an API key in API Keys.');
  console.log(`  3. Run: vf login ${url}`);
  console.log('  4. Run: vf doctor');
}

export default defineCommand({
  meta: {
    name: 'setup',
    description: 'Create one owned VibeFlare installation on Cloudflare',
  },
  args: {
    name: { type: 'string', description: 'installation name', default: 'vibeflare' },
    account: { type: 'string', description: 'Cloudflare account id or name when you have more than one' },
    mode: { type: 'string', description: 'browser auth: standalone or cf-access', default: 'standalone' },
    origin: { type: 'string', description: 'public https URL; workers.dev can be auto-detected' },
    'github-client-id': { type: 'string', description: 'optional GitHub OAuth Device Flow client id' },
    'access-team': { type: 'string', description: 'Cloudflare Access team name' },
    'access-aud': { type: 'string', description: 'Cloudflare Access application AUD tag' },
  },
  async run({ args }) {
    try {
      const installation = String(args.name ?? 'vibeflare');
      const existing = readInstallReceipt(installation);
      if (existing?.status === 'installed') {
        printSetupComplete(existing);
        return;
      }

      const modeArg = existing?.browserAuth.mode ?? String(args.mode ?? 'standalone');
      if (modeArg !== 'standalone' && modeArg !== 'cf-access' && modeArg !== 'cf_access') {
        throw new Error('--mode must be standalone or cf-access');
      }
      const mode = modeArg === 'standalone' ? 'standalone' as const : 'cf_access' as const;

      let origin = existing?.browserAuth.origin ?? optionalArg(args.origin);
      if (origin) origin = normalizeOrigin(origin);
      if (mode === 'cf_access' && !origin) {
        origin = normalizeOrigin(await promptText('Custom-domain URL (for example https://ai.example.com): '));
      }
      const rpId = existing?.browserAuth.rpId ?? (origin ? rpIdFromOrigin(origin) : '');

      // Standalone installs need no Worker secrets: session signing self-initializes
      // in D1, the model catalog is public, and GitHub can bootstrap itself.
      // Cloudflare Access still needs its deployment-specific identity values.
      const mayReuseExistingSecrets = Boolean(existing?.resources.worker);
      let secrets: Record<string, string> | undefined;
      if (!mayReuseExistingSecrets) {
        const initialSecrets: Record<string, string> = {};
        const githubClientId = optionalArg(args['github-client-id']) || process.env.VIBEFLARE_GITHUB_CLIENT_ID?.trim() || '';
        if (githubClientId) initialSecrets.GITHUB_CLIENT_ID = githubClientId;
        if (mode === 'cf_access') {
          const team = optionalArg(args['access-team']) || process.env.VIBEFLARE_CF_ACCESS_TEAM?.trim()
            || await promptText('Cloudflare Access team name: ');
          const aud = optionalArg(args['access-aud']) || process.env.VIBEFLARE_CF_ACCESS_AUD?.trim()
            || await promptText('Cloudflare Access AUD tag: ');
          if (!team || !aud) throw new Error('Cloudflare Access team and AUD are required in cf-access mode');
          initialSecrets.CF_ACCESS_TEAM = team;
          initialSecrets.CF_ACCESS_AUD = aud;
        }
        if (Object.keys(initialSecrets).length > 0) secrets = initialSecrets;
      }

      const context = lifecycleContext();
      const receipt = await setupInstallation(context, {
        installation,
        ...(optionalArg(args.account) ? { accountId: optionalArg(args.account) } : {}),
        mode,
        origin,
        rpId,
        ...(secrets ? { secrets } : {}),
      });

      printSetupComplete(receipt);
    } catch (error) {
      console.error(`setup: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  },
});
