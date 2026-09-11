import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { Env } from '../src/env';
import { insertUser } from '../src/db/queries';
import { createAuthRouter, type AuthDeps } from '../src/routes/auth';

const testEnv = env as unknown as Env;

function withBindings(overrides: Partial<Env> = {}): Env {
  return new Proxy(testEnv, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in overrides) return overrides[prop as keyof Env];
      return Reflect.get(target, prop, receiver);
    },
  });
}

function routerForGitHub(login: string, email: string | null = null) {
  const deps = {
    pollDeviceAuth: async () => ({ status: 'ok', accessToken: 'test-access-token' }),
    fetchUser: async () => ({ login, email, id: 1, name: login, avatar_url: '' }),
    checkRateLimit: async () => ({ locked: false, remaining: 5 }),
    checkAndRecord: async () => ({ locked: false, remaining: 5 }),
    linkAccessOnLogin: async () => {},
  } as unknown as AuthDeps;
  return createAuthRouter(deps);
}

describe('POST /auth/github/device/poll', () => {
  beforeEach(async () => {
    await testEnv.DB.prepare('DELETE FROM auth_credentials').run();
    await testEnv.DB.prepare('DELETE FROM auth_users').run();
  });

  it('returns 403 invite_required and creates no user for an unknown GitHub login', async () => {
    const app = routerForGitHub('newcomer', 'newcomer@example.com');
    const res = await app.request('/github/device/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: 'device-1' }),
    }, withBindings({ GITHUB_CLIENT_ID: 'test-client-id', AUTH_MODE: 'standalone' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: {
        type: 'invite_required',
        message: 'no account for this GitHub login; an invite is required',
      },
    });
    const user = await testEnv.DB.prepare("SELECT id FROM auth_users WHERE github_login = 'newcomer'").first();
    expect(user).toBeNull();
  });

  it('returns ok and issues a session for an existing GitHub account', async () => {
    await insertUser(testEnv.DB, {
      id: 'existing-gh-user',
      email: 'alice@example.com',
      github_login: 'alice',
      role: 'user',
      created_at: Date.now(),
    });

    const app = routerForGitHub('alice', 'alice@example.com');
    const res = await app.request('/github/device/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: 'device-2' }),
    }, withBindings({ GITHUB_CLIENT_ID: 'test-client-id', AUTH_MODE: 'standalone' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(res.headers.get('set-cookie')).toContain('vf_sess=');
  });
});

describe('POST /auth/setup/github/poll', () => {
  beforeEach(async () => {
    await testEnv.DB.prepare('DELETE FROM auth_credentials').run();
    await testEnv.DB.prepare('DELETE FROM auth_users').run();
  });

  it('creates exactly one first owner and issues a session', async () => {
    const app = routerForGitHub('firstowner', 'owner@example.com');
    const bindings = withBindings({ GITHUB_CLIENT_ID: 'test-client-id', AUTH_MODE: 'standalone' });
    const request = () => app.request('/setup/github/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: 'device-first-owner' }),
    }, bindings);

    const first = await request();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ status: 'ok' });
    expect(first.headers.get('set-cookie')).toContain('vf_sess=');

    const second = await request();
    expect(second.status).toBe(403);
    expect(await second.json()).toEqual({
      error: { type: 'forbidden', message: 'setup already complete' },
    });

    const rows = await testEnv.DB.prepare('SELECT github_login, role FROM auth_users').all<{ github_login: string; role: string }>();
    expect(rows.results).toEqual([{ github_login: 'firstowner', role: 'owner' }]);
  });
});
