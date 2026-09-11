import { defineCommand } from 'citty';
import { previewUninstall, uninstallInstallation } from '../lib/lifecycle.js';
import { lifecycleContext } from '../lib/lifecycle-cli.js';

function printPreview(name: string, resources: Array<{ kind: string; name: string; id?: string }>): void {
  console.log(`Uninstall preview for ${name}`);
  if (resources.length === 0) {
    console.log('  Nothing remains to delete.');
    return;
  }
  for (const resource of resources) {
    console.log(`  ${resource.kind}: ${resource.name}${resource.id ? ` (${resource.id})` : ''}`);
  }
  console.log('\nNo deletion was performed.');
  console.log(`To permanently delete this installation and its stored data, run: vf uninstall --name=${name} --confirm=${name}`);
}

export default defineCommand({
  meta: { name: 'uninstall', description: 'Preview or delete only resources owned by one VibeFlare install receipt' },
  args: {
    name: { type: 'string', description: 'installation name', default: 'vibeflare' },
    preview: { type: 'boolean', description: 'show exact owned resources without deleting anything' },
    confirm: { type: 'string', description: 'exact installation name required for permanent deletion' },
  },
  async run({ args }) {
    const name = String(args.name ?? 'vibeflare');
    try {
      if (args.preview || !args.confirm) {
        const preview = previewUninstall({}, name);
        printPreview(name, preview.resources);
        return;
      }
      const result = uninstallInstallation(lifecycleContext(), name, String(args.confirm));
      for (const entry of result.removed) console.log(`Removed: ${entry}`);
      for (const entry of result.failed) console.error(`Failed: ${entry.kind}:${entry.name} — ${entry.error}`);
      console.log(`State: ${result.receipt.status}`);
      if (result.failed.length > 0) process.exit(1);
    } catch (error) {
      console.error(`uninstall: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  },
});
