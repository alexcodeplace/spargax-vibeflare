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
  beforeEach(async () => {
    await testEnv.DB.prepare('DELETE FROM auth_credentials').run();
    await testEnv.DB.prepare('DELETE FROM auth_users').run();
    await testEnv.DB.prepare("DELETE FROM settings WHERE key LIKE 'github.oauth_%' OR key = 'github.app_slug'").run();
  });

  it('advertises Device Flow when an env client id overrides zero-config GitHub', async () => {
    const app = authRouter();
    const bindings = withBindings({ AUTH_MODE: 'standalone', GITHUB_CLIENT_ID: 'github-client' });
    const beforeSetup = await app.request('/methods', undefined, bindings);
    expect(beforeSetup.status).toBe(200);
    expect(await beforeSetup.json()).toEqual({
      mode: 'standalone',
      passkey: true,
      github: true,
      github_flow: 'device',
      cf_access: false,
      setup_required: true,
    });

    await testEnv.DB.prepare(
      "INSERT INTO auth_users (id, email, github_login, role, created_at) VALUES ('owner-a', 'owner@example.com', NULL, 'owner', 0)",
    ).run();
    const afterSetup = await app.request('/methods', undefined, bindings);
    expect(afterSetup.status).toBe(200);
    expect(await afterSetup.json()).toEqual({
      mode: 'standalone',
      passkey: true,
      github: true,
      github_flow: 'device',
      cf_access: false,
      setup_required: false,
    });
  });

  it('offers zero-config GitHub bootstrap on a fresh standalone deployment', async () => {
    const app = authRouter();
    const res = await app.request('/methods', undefined, withBindings({ AUTH_MODE: 'standalone', GITHUB_CLIENT_ID: undefined }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      mode: 'standalone',
      passkey: true,
      github: true,
      github_flow: 'bootstrap',
      cf_access: false,
      setup_required: true,
    });
  });

  it('starts a per-origin GitHub App manifest bootstrap without deployment env', async () => {
    const app = authRouter();
    const res = await app.request(
      'https://vibeflare.example.workers.dev/setup/github/bootstrap/start',
      { method: 'POST' },
      withBindings({ AUTH_MODE: 'standalone', GITHUB_CLIENT_ID: undefined }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('vf_gh_manifest_state=');
    const body = await res.json<{ action: string; manifest: string }>();
    expect(body.action).toMatch(/^https:\/\/github\.com\/settings\/apps\/new\?state=/);
    expect(JSON.parse(body.manifest)).toMatchObject({
      redirect_url: 'https://vibeflare.example.workers.dev/auth/setup/github/manifest/callback',
      callback_urls: ['https://vibeflare.example.workers.dev/auth/github/oauth/callback'],
      public: true,
      request_oauth_on_install: false,
      default_permissions: {},
      default_events: [],
    });
  });

  it('advertises web OAuth after a per-deployment GitHub App is stored', async () => {
    await testEnv.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('github.oauth_client_id', 'Iv1.test', 0), ('github.oauth_client_secret', 'secret', 0), ('github.oauth_origin', 'http://localhost', 0)").run();
    await testEnv.DB.prepare("INSERT INTO auth_users (id, email, github_login, role, created_at) VALUES ('owner-a', NULL, 'octocat', 'owner', 0)").run();
    const app = authRouter();
    const res = await app.request('/methods', undefined, withBindings({ AUTH_MODE: 'standalone', GITHUB_CLIENT_ID: undefined }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      mode: 'standalone',
      passkey: true,
      github: true,
      github_flow: 'oauth',
      cf_access: false,
      setup_required: false,
    });
  });

  it('offers a safe GitHub rebind when a reused D1 has credentials for another hostname', async () => {
    await testEnv.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('github.oauth_client_id', 'Iv1.old', 0), ('github.oauth_client_secret', 'secret', 0), ('github.oauth_origin', 'https://old.example.workers.dev', 0)").run();
    await testEnv.DB.prepare("INSERT INTO auth_users (id, email, github_login, role, created_at) VALUES ('owner-a', NULL, 'octocat', 'owner', 0)").run();
    const app = authRouter();
    const methods = await app.request(
      'https://new.example.workers.dev/methods',
      undefined,
      withBindings({ AUTH_MODE: 'standalone', GITHUB_CLIENT_ID: undefined }),
    );
    expect(methods.status).toBe(200);
    expect(await methods.json()).toMatchObject({ github: true, github_flow: 'bootstrap', setup_required: false });

    const bootstrap = await app.request(
      'https://new.example.workers.dev/setup/github/bootstrap/start',
      { method: 'POST' },
      withBindings({ AUTH_MODE: 'standalone', GITHUB_CLIENT_ID: undefined }),
    );
    expect(bootstrap.status).toBe(200);
    const body = await bootstrap.json<{ manifest: string }>();
    expect(JSON.parse(body.manifest)).toMatchObject({
      redirect_url: 'https://new.example.workers.dev/auth/setup/github/manifest/callback',
      callback_urls: ['https://new.example.workers.dev/auth/github/oauth/callback'],
    });
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
    expect(await res.json()).toEqual({
      mode: 'cf_access',
      passkey: false,
      github: false,
      github_flow: 'none',
      cf_access: true,
      setup_required: false,
    });
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
