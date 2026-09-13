import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WranglerProvider } from '../src/lib/wrangler-provider.js';

const cleanup: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.FAKE_WRANGLER_MODE;
  delete process.env.FAKE_WRANGLER_LOG;
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeWrangler(): { path: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflare-wrangler-provider-'));
  cleanup.push(dir);
  const path = join(dir, 'wrangler');
  const log = join(dir, 'calls.log');
  writeFileSync(path, `#!/usr/bin/env bash
set -euo pipefail
printf 'account=%s args=%s\\n' "\${CLOUDFLARE_ACCOUNT_ID:-}" "$*" >> "\${FAKE_WRANGLER_LOG}"
case "\${FAKE_WRANGLER_MODE:-empty}" in
  empty) printf '[]\\n' ;;
  found) printf '[{"id":"deployment-1"}]\\n' ;;
  missing) printf 'Could not find Worker script\\n' >&2; exit 1 ;;
  auth) printf 'Authentication failed: token is not authorized\\n' >&2; exit 1 ;;
  *) exit 9 ;;
esac
`, { mode: 0o755 });
  chmodSync(path, 0o755);
  process.env.FAKE_WRANGLER_LOG = log;
  return { path, log };
}

describe('WranglerProvider ownership lookup', () => {
  it('scopes Worker lookup to the selected Cloudflare account', () => {
    const fake = fakeWrangler();
    process.env.FAKE_WRANGLER_MODE = 'empty';
    expect(new WranglerProvider(fake.path).workerExists('vf-test', 'acct-42')).toBe(false);
    expect(readFileSync(fake.log, 'utf8')).toContain('account=acct-42 args=deployments list --name vf-test --json');
  });

  it('treats only an explicit missing-worker result as absence', () => {
    const fake = fakeWrangler();
    const provider = new WranglerProvider(fake.path);
    process.env.FAKE_WRANGLER_MODE = 'missing';
    expect(provider.workerExists('vf-test', 'acct-1')).toBe(false);
  });

  it('fails closed when Wrangler cannot verify existence because authentication failed', () => {
    const fake = fakeWrangler();
    const provider = new WranglerProvider(fake.path);
    process.env.FAKE_WRANGLER_MODE = 'auth';
    expect(() => provider.workerExists('vf-test', 'acct-1')).toThrow('cannot verify whether Worker');
  });

  it('refuses Worker deletion before invoking Wrangler in a non-interactive process', () => {
    const fake = fakeWrangler();
    process.env.FAKE_WRANGLER_MODE = 'empty';
    const provider = new WranglerProvider(fake.path);
    expect(() => provider.deleteWorker('vf-test', 'acct-1')).toThrow('refusing non-interactive Worker deletion');
    expect(() => readFileSync(fake.log, 'utf8')).toThrow();
  });

  it('reports an existing Worker when Wrangler returns deployments', () => {
    const fake = fakeWrangler();
    process.env.FAKE_WRANGLER_MODE = 'found';
    expect(new WranglerProvider(fake.path).workerExists('vf-test', 'acct-1')).toBe(true);
  });
});


describe('WranglerProvider deployment health', () => {
  it('retries transient propagation failures until the Worker reports healthy', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('not ready', { status: 404 }))
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, version: '0.9.6' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = new WranglerProvider('/unused/wrangler').health('https://vf.example.workers.dev');
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(resultPromise).resolves.toEqual({ ok: true, version: '0.9.6' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
