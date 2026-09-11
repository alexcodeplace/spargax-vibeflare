import { defineCommand } from 'citty';
import { updateInstallation } from '../lib/lifecycle.js';
import { lifecycleContext } from '../lib/lifecycle-cli.js';

export default defineCommand({
  meta: { name: 'update', description: 'Apply migrations and deploy this VibeFlare release without recreating data' },
  args: {
    name: { type: 'string', description: 'installation name', default: 'vibeflare' },
  },
  async run({ args }) {
    const name = String(args.name ?? 'vibeflare');
    try {
      const result = await updateInstallation(lifecycleContext(), name);
      console.log(`Updated ${name}: ${result.sourceRelease} → ${result.targetRelease}`);
      console.log(`Migrations applied: ${result.migrationsApplied.length ? result.migrationsApplied.join(', ') : 'none'}`);
      console.log(`URL: ${result.receipt.deployment?.url ?? result.receipt.browserAuth.origin}`);
    } catch (error) {
      console.error(`update: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  },
});
