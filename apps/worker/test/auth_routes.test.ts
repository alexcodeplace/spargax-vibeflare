import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { Env } from '../src/env';
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

function authRouter(overrides: Partial<AuthDeps> = {}) {
  return createAuthRouter({
    startRegistration: async () => ({ challenge: 'unused' }),
    finishRegistration: async () => ({ ok: false, status: 400, message: 'unused' }),
    startAuthentication: async () => ({ challenge: 'challenge', challengeId: 'challenge-id' }),
    finishAuthentication: async () => null,
    linkAccessOnLogin: async () => {},
    checkRateLimit: async () => ({ locked: false, remaining: 5 }),
    checkAndRecord: async () => ({ locked: false, remaining: 5 }),
    startDeviceAuth: async () => ({ device_id: 'd', user_code: 'u', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 }),
    pollDeviceAuth: async () => ({ status: 'pending' }),
    fetchUser: async () => ({ login: 'u', email: null, id: 1, name: 'U', avatar_url: '' }),
    ...overrides,
  } as unknown as AuthDeps);
}

describe('/auth/session public browser identity probe', () => {
  it('returns 200 with null user when no browser identity exists', async () => {
    const app = authRouter();
    const res = await app.request('/session', undefined, withBindings({ AUTH_MODE: 'standalone' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null, authMethod: null });
  });
});

describe('/auth/methods single-owner browser authentication', () => {
  it('advertises only app session methods in standalone mode', async () => {
    const app = authRouter();
    const res = await app.request('/methods', undefined, withBindings({ AUTH_MODE: 'standalone', GITHUB_CLIENT_ID: 'github-client' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'standalone', passkey: true, github: true, cf_access: false });
  });

  it('advertises only Cloudflare Access in cf_access mode', async () => {
    const app = authRouter();
    const res = await app.request('/methods', undefined, withBindings({
      AUTH_MODE: 'cf_access',
      GITHUB_CLIENT_ID: 'github-client',
      CF_ACCESS_TEAM: 'team',
      CF_ACCESS_AUD: 'aud',
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'cf_access', passkey: false, github: false, cf_access: true });
  });

  it('blocks passkey and GitHub app login endpoints in cf_access mode', async () => {
    const app = authRouter();
    const bindings = withBindings({ AUTH_MODE: 'cf_access', GITHUB_CLIENT_ID: 'github-client' });
    const passkey = await app.request('/passkey/start', { method: 'POST' }, bindings);
    const github = await app.request('/github/device/start', { method: 'POST' }, bindings);
    expect(passkey.status).toBe(409);
    expect(github.status).toBe(409);
    expect((await passkey.json<{ error: { type: string } }>()).error.type).toBe('auth_mode');
    expect((await github.json<{ error: { type: string } }>()).error.type).toBe('auth_mode');
  });
});

describe('passkey login response contract', () => {
  beforeEach(async () => {
    await testEnv.DB.prepare('DELETE FROM auth_credentials').run();
    await testEnv.DB.prepare('DELETE FROM auth_users').run();
    await testEnv.DB.prepare(
      "INSERT INTO auth_users (id, email, github_login, role, created_at) VALUES ('member-a', 'a@example.com', NULL, 'user', 0)",
    ).run();
  });

  it('invalid passkey verification returns 401 without a session', async () => {
    const app = authRouter({ finishAuthentication: async () => null });
    const res = await app.request('/passkey/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: 'challenge-id', response: { id: 'invalid' } }),
    }, withBindings({ AUTH_MODE: 'standalone' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { type: 'auth', message: 'authentication failed' } });
    expect(res.headers.get('set-cookie')).toBeNull();
    const users = await testEnv.DB.prepare('SELECT id FROM auth_users').all<{ id: string }>();
    expect(users.results.map((u) => u.id)).toEqual(['member-a']);
  });

  it('accepted passkey verification issues one app session for the existing user', async () => {
    const app = authRouter({ finishAuthentication: async () => ({ userId: 'member-a', role: 'user' }) });
    const res = await app.request('/passkey/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: 'challenge-id', response: { id: 'valid' } }),
    }, withBindings({ AUTH_MODE: 'standalone' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('set-cookie')).toContain('vf_sess=');
    const users = await testEnv.DB.prepare('SELECT id FROM auth_users').all<{ id: string }>();
    expect(users.results.map((u) => u.id)).toEqual(['member-a']);
  });
});
