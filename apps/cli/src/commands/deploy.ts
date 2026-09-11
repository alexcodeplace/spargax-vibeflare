import { defineCommand } from 'citty';
import { updateInstallation } from '../lib/lifecycle.js';
import { lifecycleContext } from '../lib/lifecycle-cli.js';

export default defineCommand({
  meta: {
    name: 'deploy',
    description: 'Rebuild and safely redeploy an existing VibeFlare installation',
  },
  args: {
    name: { type: 'string', description: 'installation name', default: 'vibeflare' },
  },
  async run({ args }) {
    const name = String(args.name ?? 'vibeflare');
    try {
      const result = await updateInstallation(lifecycleContext(), name);
      console.log(`Deployed ${name} from release ${result.targetRelease}.`);
      console.log(`URL: ${result.receipt.deployment?.url ?? result.receipt.browserAuth.origin}`);
    } catch (error) {
      console.error(`deploy: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  },
});
