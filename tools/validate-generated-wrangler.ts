import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { newInstallReceipt } from '../apps/cli/src/lib/install-state.ts';
import { renderGeneratedWrangler, writeGeneratedWrangler } from '../apps/cli/src/lib/generated-wrangler.ts';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const template = join(repoRoot, 'apps/worker/wrangler.toml');
const before = readFileSync(template, 'utf8');
const temp = mkdtempSync(join(tmpdir(), 'vibeflare-wrangler-gate-'));

try {
  for (const mode of ['standalone', 'cf_access'] as const) {
    const installation = mode === 'standalone' ? 'vf-release-gate' : 'vf-custom-release-gate';
    const host = mode === 'standalone' ? 'vf-release-gate.example.workers.dev' : 'ai.example.com';
    const receipt = newInstallReceipt({
      installation,
      accountId: '00000000000000000000000000000000',
      mode,
      origin: `https://${host}`,
      rpId: host,
    });
    receipt.resources.worker = { name: installation, status: 'owned' };
    receipt.resources.d1 = {
      name: `${installation}-db`,
      id: '11111111-1111-4111-8111-111111111111',
      status: 'owned',
    };
    receipt.resources.r2 = { name: `${installation}-files`, status: 'owned' };

    const config = join(temp, `${mode}.toml`);
    writeGeneratedWrangler(config, renderGeneratedWrangler(template, receipt, repoRoot));
    const result = spawnSync('pnpm', [
      '--filter', '@vibeflare/worker', 'exec', 'wrangler', 'deploy',
      '--config', config,
      '--dry-run',
      '--outdir', join(temp, `out-${mode}`),
    ], { cwd: repoRoot, encoding: 'utf8' });
    if (result.status !== 0) {
      process.stderr.write(result.stdout ?? '');
      process.stderr.write(result.stderr ?? '');
      throw new Error(`Wrangler dry-run rejected generated ${mode} config`);
    }
    process.stdout.write(`✓ generated ${mode} Wrangler config\n`);
  }

  if (readFileSync(template, 'utf8') !== before) {
    throw new Error('generated-config validation mutated the canonical Wrangler template');
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
