import { describe, expect, it } from 'vitest';
import { resolveScreenshotTarget } from '../scripts/screenshot-target.mjs';

describe('README screenshot target safety', () => {
  it.each(['http://localhost:18995', 'http://127.0.0.1:18995/', 'http://[::1]:18995'])('accepts an explicitly approved loopback fixture: %s', (url) => {
    expect(resolveScreenshotTarget(url, '1')).toBe(new URL(url).origin);
  });

  it.each([
    'https://vibeflare.example.com',
    'https://vibeflare.shrill-moon-94bd.workers.dev',
    'http://localhost.example.com:18995',
    'http://localhost:18995/settings',
    'http://localhost:18995/?target=prod',
    'http://localhost:18995/#fixture',
    'http://username:password@localhost:18995',
    'file:///tmp/vibeflare',
  ])('rejects remote sites and non-origin URLs before any reset: %s', (url) => {
    expect(() => resolveScreenshotTarget(url, '1')).toThrow(/loopback/);
  });

  it.each([undefined, '', '0', 'true'])('requires explicit permission to reset local test data: %s', (allowReset) => {
    expect(() => resolveScreenshotTarget('http://localhost:18995', allowReset)).toThrow(/ALLOW_RESET=1/);
  });
});
