import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { Env } from '../src/env';
import {
  buildGithubAppManifest,
  getGithubWebConfig,
  saveGithubWebConfig,
} from '../src/auth/github_web';

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await testEnv.DB.prepare(
    "DELETE FROM settings WHERE key LIKE 'github.oauth_%' OR key = 'github.app_slug'",
  ).run();
});

describe('zero-config GitHub web auth', () => {
  it('builds a least-privilege manifest bound to the current VibeFlare origin', () => {
    const manifest = buildGithubAppManifest('https://vf.example.workers.dev', 'VibeFlare abc123');
    expect(manifest).toEqual({
      name: 'VibeFlare abc123',
      url: 'https://github.com/alexcodeplace/spargax-vibeflare',
      description: 'GitHub sign-in for this self-hosted VibeFlare deployment.',
      redirect_url: 'https://vf.example.workers.dev/auth/setup/github/manifest/callback',
      callback_urls: ['https://vf.example.workers.dev/auth/github/oauth/callback'],
      public: true,
      request_oauth_on_install: false,
      default_permissions: {},
      default_events: [],
    });
  });

  it('persists the generated client credentials in D1 for subsequent logins', async () => {
    expect(await getGithubWebConfig(testEnv, 'https://vf.example.workers.dev')).toBeNull();
    await saveGithubWebConfig(testEnv, {
      clientId: 'Iv1.zero-config',
      clientSecret: 'secret-value',
      appSlug: 'vibeflare-instance',
      origin: 'https://vf.example.workers.dev',
    });
    expect(await getGithubWebConfig(testEnv, 'https://vf.example.workers.dev')).toEqual({
      clientId: 'Iv1.zero-config',
      clientSecret: 'secret-value',
      appSlug: 'vibeflare-instance',
      origin: 'https://vf.example.workers.dev',
    });
    expect(await getGithubWebConfig(testEnv, 'https://other.example.workers.dev')).toBeNull();
  });
});
