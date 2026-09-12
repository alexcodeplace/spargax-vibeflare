import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  previewUninstall,
  resourceNames,
  setupInstallation,
  uninstallInstallation,
  updateInstallation,
  type LifecycleContext,
} from '../src/lib/lifecycle.js';
import { generatedWranglerPath, readInstallReceipt, receiptPath } from '../src/lib/install-state.js';
import type { CloudflareIdentity, DeploymentResult, LifecycleProvider } from '../src/lib/wrangler-provider.js';

const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const cleanup: string[] = [];

function stateEnv() {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflare-lifecycle-test-'));
  cleanup.push(dir);
  return { ...process.env, VIBEFLARE_STATE_DIR: dir };
}

afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

class FakeProvider implements LifecycleProvider {
  accounts = [{ id: 'acct-1', name: 'Primary' }];
  existingWorkers = new Set<string>();
  existingD1 = new Set<string>();
  existingR2 = new Set<string>();
  calls: string[] = [];
  fail = new Set<string>();
  nextVersion = 1;
  migrationNames = ['0002_auth_invites.sql', '0006_model_health.sql'];
  appData = { users: ['owner'], keys: ['vf-key'], chats: ['chat-1'], files: ['file-1'] };

  private maybeFail(action: string): void {
    if (this.fail.has(action)) throw new Error(`denied:${action}`);
  }

  identity(): CloudflareIdentity {
    this.calls.push('identity');
    this.maybeFail('identity');
    return { accounts: this.accounts };
  }

  workerExists(name: string, accountId: string): boolean {
    this.calls.push(`workerExists:${accountId}:${name}`);
    this.maybeFail('workerExists');
    return this.existingWorkers.has(name);
  }

  d1Exists(name: string, accountId: string): boolean {
    this.calls.push(`d1Exists:${accountId}:${name}`);
    this.maybeFail('d1Exists');
    return this.existingD1.has(name);
  }

  createD1(name: string, accountId: string): { id: string } {
    this.calls.push(`createD1:${accountId}:${name}`);
    this.maybeFail('createD1');
    if (this.existingD1.has(name)) throw new Error(`already exists:${name}`);
    this.existingD1.add(name);
    return { id: '11111111-1111-4111-8111-111111111111' };
  }

  createR2(name: string, accountId: string): void {
    this.calls.push(`createR2:${accountId}:${name}`);
    this.maybeFail('createR2');
    if (this.existingR2.has(name)) throw new Error(`already exists:${name}`);
    this.existingR2.add(name);
  }

  buildUi(): void {
    this.calls.push('buildUi');
    this.maybeFail('buildUi');
  }

  deploy(_configPath: string, _repoRoot: string, secrets?: Record<string, string>): DeploymentResult {
    this.calls.push(`deploy:${Object.keys(secrets ?? {}).sort().join(',')}`);
    this.maybeFail('deploy');
    const workerName = [...this.calls].reverse().find((entry: string) => entry.startsWith('workerExists:'))?.split(':')[2] ?? 'vf-test';
    this.existingWorkers.add(workerName);
    return {
      url: `https://${workerName}.example.workers.dev`,
      versionId: `22222222-2222-4222-8222-${String(this.nextVersion++).padStart(12, '0')}`,
    };
  }

  applyMigrations(_configPath: string, databaseName: string): string[] {
    this.calls.push(`migrate:${databaseName}`);
    this.maybeFail('migrate');
    return [...this.migrationNames];
  }

  async health(url: string): Promise<{ ok: boolean; version?: string }> {
    this.calls.push(`health:${url}`);
    this.maybeFail('health');
    return { ok: true, version: 'test' };
  }

  deleteWorker(name: string, accountId: string): void {
    this.calls.push(`deleteWorker:${accountId}:${name}`);
    this.maybeFail('deleteWorker');
    this.existingWorkers.delete(name);
  }

  purgeR2(_configPath: string, databaseName: string, bucketName: string): number {
    this.calls.push(`purgeR2:${databaseName}:${bucketName}`);
    this.maybeFail('purgeR2');
    return this.appData.files.length;
  }

  deleteD1(name: string, accountId: string): void {
    this.calls.push(`deleteD1:${accountId}:${name}`);
    this.maybeFail('deleteD1');
    this.existingD1.delete(name);
  }

  deleteR2(name: string, accountId: string): void {
    this.calls.push(`deleteR2:${accountId}:${name}`);
    this.maybeFail('deleteR2');
    this.existingR2.delete(name);
  }
}

function ctx(provider: FakeProvider, env: NodeJS.ProcessEnv): LifecycleContext {
  return { provider, repoRoot, env, now: () => '2026-09-10T09:30:00.000Z' };
}

const setupInput = {
  installation: 'vf-test',
  mode: 'standalone' as const,
  origin: 'https://vf-test.example.workers.dev',
  rpId: 'vf-test.example.workers.dev',
};

describe('UJ-008 install, diagnose, and update lifecycle', () => {
  it('H1 creates one owned installation, never mutates the canonical Wrangler template, and setup is idempotent', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    const canonical = join(repoRoot, 'apps/worker/wrangler.toml');
    const before = readFileSync(canonical, 'utf8');

    const receipt = await setupInstallation(ctx(provider, env), setupInput);

    expect(receipt.status).toBe('installed');
    expect(receipt.accountId).toBe('acct-1');
    expect(receipt.resources).toEqual({
      worker: { name: 'vf-test', status: 'owned' },
      d1: { name: 'vf-test-db', id: '11111111-1111-4111-8111-111111111111', status: 'owned' },
      r2: { name: 'vf-test-files', status: 'owned' },
    });
    expect(readFileSync(canonical, 'utf8')).toBe(before);
    expect(readFileSync(generatedWranglerPath('vf-test', env), 'utf8')).toContain('name = "vf-test"');
    expect(readFileSync(receiptPath('vf-test', env), 'utf8')).toContain('"schemaVersion": "vibeflare-install/v1"');

    expect(receipt.migrationsApplied).toEqual(['0002_auth_invites.sql', '0006_model_health.sql']);

    const mutationCalls = provider.calls.filter((call) => /^(create|deploy:|buildUi)/.test(call));
    expect(mutationCalls).toEqual([
      'createD1:acct-1:vf-test-db',
      'createR2:acct-1:vf-test-files',
      'buildUi',
      'deploy:',
    ]);

    provider.calls = [];
    const repeated = await setupInstallation(ctx(provider, env), setupInput);
    expect(repeated).toEqual(receipt);
    expect(provider.calls).toEqual([]);
  });

  it('discovers the workers.dev origin from first deploy and redeploys with the final WebAuthn RP', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    const receipt = await setupInstallation(ctx(provider, env), { ...setupInput, origin: '', rpId: '' });

    expect(receipt.browserAuth).toEqual({
      mode: 'standalone',
      origin: 'https://vf-test.example.workers.dev',
      rpId: 'vf-test.example.workers.dev',
    });
    expect(provider.calls.filter((call) => call.startsWith('deploy:'))).toHaveLength(2);
    const generated = readFileSync(generatedWranglerPath('vf-test', env), 'utf8');
    expect(generated).toContain('RP_ID = "vf-test.example.workers.dev"');
    expect(generated).toContain('RP_ORIGIN = "https://vf-test.example.workers.dev"');
  });

  it('requires a known https origin before custom-domain provisioning starts', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    await expect(setupInstallation(ctx(provider, env), {
      ...setupInput,
      mode: 'cf_access',
      origin: '',
      rpId: '',
    })).rejects.toThrow('custom-domain setup requires --origin');
    expect(provider.calls).toEqual([]);
    expect(readInstallReceipt('vf-test', env)).toBeNull();
  });

  it('A1 fails before provisioning when Cloudflare identity is unavailable', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    provider.fail.add('identity');

    await expect(setupInstallation(ctx(provider, env), setupInput)).rejects.toThrow('denied:identity');
    expect(readInstallReceipt('vf-test', env)).toBeNull();
    expect(provider.calls).toEqual(['identity']);
  });

  it('P1 records already-created owned resources and resumes without duplication after a permission failure', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    provider.fail.add('createR2');

    await expect(setupInstallation(ctx(provider, env), setupInput)).rejects.toThrow('denied:createR2');
    const partial = readInstallReceipt('vf-test', env)!;
    expect(partial.status).toBe('provisioning');
    expect(partial.resources.d1?.status).toBe('owned');
    expect(partial.resources.r2).toBeUndefined();
    expect(partial.resources.worker).toBeUndefined();

    provider.fail.delete('createR2');
    provider.calls = [];
    const recovered = await setupInstallation(ctx(provider, env), setupInput);
    expect(recovered.status).toBe('installed');
    expect(provider.calls).not.toContain('createD1:acct-1:vf-test-db');
    expect(provider.calls).toContain('createR2:acct-1:vf-test-files');
  });

  it('resumes a partial deployed Worker without replacing its existing secrets', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    provider.fail.add('health');

    await expect(setupInstallation(ctx(provider, env), setupInput)).rejects.toThrow('denied:health');
    const partial = readInstallReceipt('vf-test', env)!;
    expect(partial.status).toBe('provisioning');
    expect(partial.resources.worker?.status).toBe('owned');
    expect(partial.migrationsApplied).toEqual(['0002_auth_invites.sql', '0006_model_health.sql']);
    expect(provider.existingWorkers.has('vf-test')).toBe(true);

    provider.fail.delete('health');
    provider.calls = [];
    const recovered = await setupInstallation(ctx(provider, env), { ...setupInput, secrets: undefined });
    expect(recovered.status).toBe('installed');
    expect(provider.calls).toContain('deploy:');
    expect(provider.calls.some((call) => call.includes('SESSION_SECRET'))).toBe(false);
  });

  it('never adopts a same-named Worker that appears before a resumed install can claim it', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    provider.fail.add('createR2');
    await expect(setupInstallation(ctx(provider, env), setupInput)).rejects.toThrow();

    provider.fail.delete('createR2');
    provider.existingWorkers.add('vf-test');
    await expect(setupInstallation(ctx(provider, env), setupInput)).rejects.toThrow('not owned by this installation');
    expect(readInstallReceipt('vf-test', env)!.resources.worker).toBeUndefined();
  });

  it('does not let setup revive an installation with an unfinished uninstall', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    await setupInstallation(ctx(provider, env), setupInput);
    provider.fail.add('purgeR2');
    uninstallInstallation(ctx(provider, env), 'vf-test', 'vf-test');

    provider.calls = [];
    await expect(setupInstallation(ctx(provider, env), setupInput)).rejects.toThrow('unfinished uninstall');
    expect(provider.calls).toEqual([]);
  });

  it('H2 updates in place, applies migrations, and preserves existing application state', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    await setupInstallation(ctx(provider, env), setupInput);
    provider.calls = [];
    const beforeData = structuredClone(provider.appData);

    const result = await updateInstallation(ctx(provider, env), 'vf-test');

    expect(result.receipt.status).toBe('installed');
    expect(result.receipt.release.installed).toBe('0.9.2');
    expect(result.migrationsApplied).toEqual(['0002_auth_invites.sql', '0006_model_health.sql']);
    expect(provider.calls.some((call) => call.startsWith('createD1:'))).toBe(false);
    expect(provider.calls.some((call) => call.startsWith('createR2:'))).toBe(false);
    expect(provider.appData).toEqual(beforeData);
  });

  it('records a failed update without falsely advancing the installed release', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    await setupInstallation(ctx(provider, env), setupInput);
    const before = readInstallReceipt('vf-test', env)!;
    provider.migrationNames = ['0007_post_setup.sql'];
    provider.fail.add('health');

    await expect(updateInstallation(ctx(provider, env), 'vf-test')).rejects.toThrow('denied:health');
    const failed = readInstallReceipt('vf-test', env)!;
    expect(failed.status).toBe('update-failed');
    expect(failed.release.installed).toBe(before.release.installed);
    expect(failed.migrationsApplied).toEqual(['0002_auth_invites.sql', '0006_model_health.sql', '0007_post_setup.sql']);
    expect(failed.lastError).toContain('denied:health');
  });
});

describe('UJ-009 receipt-authoritative uninstall', () => {
  it('preview performs no mutation and names only exact receipt-owned resources', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    await setupInstallation(ctx(provider, env), setupInput);
    provider.existingWorkers.add('vf-test-unrelated');
    provider.existingD1.add('vf-test-other-db');
    provider.existingR2.add('vf-test-files-copy');
    provider.calls = [];

    expect(previewUninstall({ env }, 'vf-test')).toEqual({
      installation: 'vf-test',
      resources: [
        { kind: 'worker', name: 'vf-test' },
        { kind: 'r2', name: 'vf-test-files' },
        { kind: 'd1', name: 'vf-test-db', id: '11111111-1111-4111-8111-111111111111' },
      ],
    });
    expect(provider.calls).toEqual([]);
  });

  it('refuses deletion when ownership receipt is missing or confirmation does not exactly match', () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    expect(() => previewUninstall({ env }, 'vf-test')).toThrow('ownership unknown');
    expect(() => uninstallInstallation(ctx(provider, env), 'vf-test', 'vf-test')).toThrow('ownership unknown');
    expect(provider.calls).toEqual([]);
  });

  it('H2 deletes only receipt-owned resources and leaves unrelated same-prefix resources untouched', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    await setupInstallation(ctx(provider, env), setupInput);
    provider.existingWorkers.add('vf-test-unrelated');
    provider.existingD1.add('vf-test-other-db');
    provider.existingR2.add('vf-test-files-copy');
    provider.calls = [];

    expect(() => uninstallInstallation(ctx(provider, env), 'vf-test', 'wrong')).toThrow('confirmation mismatch');
    expect(provider.calls).toEqual([]);

    const result = uninstallInstallation(ctx(provider, env), 'vf-test', 'vf-test');
    expect(result.failed).toEqual([]);
    expect(result.receipt.status).toBe('removed');
    expect(result.removed).toEqual(['worker:vf-test', 'r2:vf-test-files', 'd1:vf-test-db']);
    expect(provider.existingWorkers.has('vf-test-unrelated')).toBe(true);
    expect(provider.existingD1.has('vf-test-other-db')).toBe(true);
    expect(provider.existingR2.has('vf-test-files-copy')).toBe(true);
    expect(provider.calls).toEqual([
      'identity',
      'deleteWorker:acct-1:vf-test',
      'purgeR2:vf-test-db:vf-test-files',
      'deleteR2:acct-1:vf-test-files',
      'deleteD1:acct-1:vf-test-db',
    ]);
  });

  it('P1 records partial deletion and retries only resources still present in the receipt', async () => {
    const env = stateEnv();
    const provider = new FakeProvider();
    await setupInstallation(ctx(provider, env), setupInput);
    provider.calls = [];
    provider.fail.add('purgeR2');

    const first = uninstallInstallation(ctx(provider, env), 'vf-test', 'vf-test');
    expect(first.receipt.status).toBe('uninstall-incomplete');
    expect(first.receipt.resources.worker?.status).toBe('removed');
    expect(first.receipt.resources.r2?.status).toBe('delete-failed');
    expect(first.receipt.resources.d1?.status).toBe('owned');
    expect(first.failed).toHaveLength(1);

    provider.fail.delete('purgeR2');
    provider.calls = [];
    const retry = uninstallInstallation(ctx(provider, env), 'vf-test', 'vf-test');
    expect(retry.receipt.status).toBe('removed');
    expect(provider.calls).toEqual([
      'identity',
      'purgeR2:vf-test-db:vf-test-files',
      'deleteR2:acct-1:vf-test-files',
      'deleteD1:acct-1:vf-test-db',
    ]);
  });
});

it('resource names are deterministic and installation-scoped', () => {
  expect(resourceNames('my-gateway')).toEqual({
    worker: 'my-gateway',
    d1: 'my-gateway-db',
    r2: 'my-gateway-files',
  });
});
