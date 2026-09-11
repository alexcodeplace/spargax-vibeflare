import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveWranglerBin } from '../src/lib/lifecycle-cli.js';

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflare-wrangler-resolver-'));
  cleanup.push(dir);
  return dir;
}

function touch(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '#!/bin/sh\n');
}

describe('resolveWranglerBin', () => {
  it('prefers an explicit override', () => {
    const root = makeRoot();
    expect(resolveWranglerBin(root, { VIBEFLARE_WRANGLER_BIN: '/custom/wrangler' }, 'linux')).toBe('/custom/wrangler');
  });

  it('uses a root-local Wrangler when present', () => {
    const root = makeRoot();
    const rootWrangler = join(root, 'node_modules', '.bin', 'wrangler');
    const workerWrangler = join(root, 'apps', 'worker', 'node_modules', '.bin', 'wrangler');
    touch(rootWrangler);
    touch(workerWrangler);
    expect(resolveWranglerBin(root, {}, 'linux')).toBe(rootWrangler);
  });

  it('uses the Worker package Wrangler installed by the release archive', () => {
    const root = makeRoot();
    const workerWrangler = join(root, 'apps', 'worker', 'node_modules', '.bin', 'wrangler');
    touch(workerWrangler);
    expect(resolveWranglerBin(root, {}, 'linux')).toBe(workerWrangler);
  });

  it('falls back to PATH only when no project-local Wrangler exists', () => {
    expect(resolveWranglerBin(makeRoot(), {}, 'linux')).toBe('wrangler');
  });
});
