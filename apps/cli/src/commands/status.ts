import { defineCommand } from 'citty';
import { readInstallReceipt, receiptPath } from '../lib/install-state.js';

async function health(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return false;
    const body = await response.json() as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

export default defineCommand({
  meta: { name: 'status', description: 'Show one VibeFlare installation and its owned resources' },
  args: {
    name: { type: 'string', description: 'installation name', default: 'vibeflare' },
    json: { type: 'boolean', description: 'output JSON' },
  },
  async run({ args }) {
    const name = String(args.name ?? 'vibeflare');
    try {
      const receipt = readInstallReceipt(name);
      if (!receipt) throw new Error(`no install receipt for '${name}' at ${receiptPath(name)}`);
      const url = receipt.deployment?.url ?? receipt.browserAuth.origin;
      const live = receipt.status !== 'removed' && Boolean(url) ? await health(url) : false;
      const result = { ...receipt, health: live ? 'healthy' : receipt.status === 'removed' ? 'removed' : 'unreachable' };
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`Installation: ${receipt.installation}`);
      console.log(`State: ${receipt.status}`);
      console.log(`Release: ${receipt.release.installed ?? 'not completed'}`);
      console.log(`URL: ${url || 'not assigned yet'}`);
      console.log(`Health: ${result.health}`);
      for (const [kind, resource] of Object.entries(receipt.resources)) {
        if (!resource) continue;
        console.log(`${kind.toUpperCase()}: ${resource.name}${resource.id ? ` (${resource.id})` : ''} — ${resource.status}`);
      }
      if (receipt.lastError) console.log(`Last error: ${receipt.lastError}`);
    } catch (error) {
      console.error(`status: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  },
});
