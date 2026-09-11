import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse, stringify } from 'smol-toml';
import type { InstallReceipt } from './install-state.js';

export function renderGeneratedWrangler(templatePath: string, receipt: InstallReceipt, repoRoot: string): string {
  const parsed = parse(readFileSync(templatePath, 'utf8')) as Record<string, any>;
  const worker = receipt.resources.worker?.name ?? receipt.installation;
  const d1 = receipt.resources.d1;
  const r2 = receipt.resources.r2;
  if (!d1?.id || d1.status === 'removed') throw new Error('cannot generate Wrangler config without an owned D1 id');
  if (!r2 || r2.status === 'removed') throw new Error('cannot generate Wrangler config without an owned R2 bucket');

  parsed.name = worker;
  parsed.account_id = receipt.accountId;
  parsed.main = resolve(repoRoot, 'apps/worker/src/index.ts');
  parsed.vars = {
    RP_NAME: 'VibeFlare',
    CF_ACCOUNT_ID: receipt.accountId,
    AUTH_MODE: receipt.browserAuth.mode,
    ...(receipt.browserAuth.rpId ? { RP_ID: receipt.browserAuth.rpId } : {}),
    ...(receipt.browserAuth.origin ? { RP_ORIGIN: receipt.browserAuth.origin } : {}),
  };
  parsed.d1_databases = [{
    binding: 'DB',
    database_name: d1.name,
    database_id: d1.id,
    migrations_dir: resolve(repoRoot, 'apps/worker/src/db/migrations'),
  }];
  parsed.r2_buckets = [{ binding: 'R2', bucket_name: r2.name }];
  parsed.assets = {
    ...(parsed.assets ?? {}),
    binding: 'ASSETS',
    directory: resolve(repoRoot, 'apps/ui/dist'),
  };
  if (receipt.browserAuth.mode === 'cf_access') {
    parsed.workers_dev = false;
    parsed.routes = [{ pattern: new URL(receipt.browserAuth.origin).host, custom_domain: true }];
  } else {
    parsed.workers_dev = true;
    delete parsed.routes;
  }
  return stringify(parsed);
}

export function writeGeneratedWrangler(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, path);
}
