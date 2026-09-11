import { beforeEach, describe, expect, it } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import type { Env } from '../src/env';
import { createInvite } from '../src/auth/invites';
import { createAuthInviteRouter, type InviteDeps } from '../src/routes/auth.invite';

const testEnv = env as unknown as Env;

function withBindings(overrides: Partial<Env> = {}): Env {
  return new Proxy(testEnv, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in overrides) return overrides[prop as keyof Env];
      return Reflect.get(target, prop, receiver);
    },
  });
}

function injectedRouter(overrides: Partial<InviteDeps> = {}) {
  const deps = {
    verifyAccessJWT: async () => null,
    verifyRegistrationOnly: async () => ({ ok: false, status: 400, message: 'not mocked' }),
    startDeviceAuth: async () => ({
      device_id: 'test-device', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5,
    }),
    pollDeviceAuth: async () => ({ status: 'pending' }),
    fetchUser: async () => ({ login: 'nobody', email: null, id: 1, name: 'Nobody', avatar_url: '' }),
    ...overrides,
  } as unknown as InviteDeps;
  return createAuthInviteRouter(deps);
}

async function resetAuthTables() {
  await testEnv.DB.prepare('DELETE FROM auth_credentials').run();
  await testEnv.DB.prepare('DELETE FROM auth_invites').run();
  await testEnv.DB.prepare('DELETE FROM auth_users').run();
}

async function freshInvite(): Promise<{ token: string; cookie: string }> {
  await testEnv.DB.prepare(
    "INSERT INTO auth_users (id, email, github_login, role, created_at) VALUES ('owner-1', 'owner@example.com', NULL, 'owner', 0) ON CONFLICT DO NOTHING",
  ).run();
  const inv = await createInvite(testEnv, {
    createdBy: 'owner-1',
    label: 'test invite',
    expiresInSec: 3600,
  });
  return { token: inv.full, cookie: `vf_invite=${encodeURIComponent(inv.full)}` };
}

describe('invite stash and validation', () => {
  beforeEach(resetAuthTables);

  it('redirects to login when stash has no token', async () => {
    const res = await SELF.fetch('https://example.com/auth/invite/stash', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/login?reason=invite_required');
  });

  it('stashes token in a cookie and redirects to signup', async () => {
    const res = await SELF.fetch('https://example.com/auth/invite/stash?token=vfi-abc123', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/signup');
    expect(res.headers.get('set-cookie')).toContain('vf_invite=');
  });

  it('rejects validation without a cookie', async () => {
    const res = await SELF.fetch('https://example.com/auth/invite/validate', { method: 'POST' });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: { type: string } }>()).error.type).toBe('invalid_request');
  });

  it('rejects an invalid invite and clears it', async () => {
    const res = await SELF.fetch('https://example.com/auth/invite/validate', {
      method: 'POST',
      headers: { cookie: 'vf_invite=vfi-doesnotexist' },
    });
    expect(res.status).toBe(410);
    expect((await res.json<{ error: { type: string } }>()).error.type).toBe('invite_consumed');
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('accepts a live invite', async () => {
    const { cookie } = await freshInvite();
    const res = await SELF.fetch('https://example.com/auth/invite/validate', { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(200);
    expect((await res.json<{ ok: boolean }>()).ok).toBe(true);
  });
});

describe('passkey invite redemption', () => {
  beforeEach(resetAuthTables);

  const verifiedPasskey = {
    ok: true as const,
    data: {
      credential: {
        id: 'credential-new-user',
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ['internal'],
      },
    },
  };

  it('atomically consumes the invite and creates a user plus credential', async () => {
    const { cookie } = await freshInvite();
    const app = injectedRouter({ verifyRegistrationOnly: async () => verifiedPasskey });
    const res = await app.request('/redeem/passkey/finish', {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'invited-user', label: 'Laptop', response: { id: 'credential-new-user' } }),
    }, withBindings({ AUTH_MODE: 'standalone' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('set-cookie')).toContain('vf_sess=');

    const user = await testEnv.DB.prepare('SELECT role FROM auth_users WHERE id = ?').bind('invited-user').first<{ role: string }>();
    const credential = await testEnv.DB.prepare('SELECT device_label FROM auth_credentials WHERE user_id = ?').bind('invited-user').first<{ device_label: string }>();
    const invite = await testEnv.DB.prepare('SELECT used_by FROM auth_invites').first<{ used_by: string }>();
    expect(user?.role).toBe('user');
    expect(credential?.device_label).toBe('Laptop');
    expect(invite?.used_by).toBe('invited-user');
  });

  it('rejects replay without creating a second user', async () => {
    const { cookie } = await freshInvite();
    const app = injectedRouter({ verifyRegistrationOnly: async () => verifiedPasskey });
    const redeem = (userId: string) => app.request('/redeem/passkey/finish', {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, response: { id: 'credential-new-user' } }),
    }, withBindings({ AUTH_MODE: 'standalone' }));

    expect((await redeem('first-user')).status).toBe(200);
    expect((await redeem('replay-user')).status).toBe(410);
    const replay = await testEnv.DB.prepare("SELECT id FROM auth_users WHERE id = 'replay-user'").first();
    expect(replay).toBeNull();
  });

  it('blocks passkey redemption in Cloudflare Access mode', async () => {
    const { cookie } = await freshInvite();
    const app = injectedRouter({ verifyRegistrationOnly: async () => verifiedPasskey });
    const res = await app.request('/redeem/passkey/finish', {
      method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'x', response: {} }),
    }, withBindings({ AUTH_MODE: 'cf_access' }));
    expect(res.status).toBe(409);
    expect((await res.json<{ error: { type: string } }>()).error.type).toBe('auth_mode');
  });
});

describe('GitHub invite redemption', () => {
  beforeEach(resetAuthTables);

  it('creates the invited user and consumes the invite', async () => {
    const { cookie } = await freshInvite();
    const app = injectedRouter({
      pollDeviceAuth: async () => ({ status: 'ok', accessToken: 'test-token' }),
      fetchUser: async () => ({ login: 'invitee-gh', email: 'invitee@example.com', id: 2, name: 'Invitee', avatar_url: '' }),
    });
    const res = await app.request('/redeem/github/poll', {
      method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: 'device' }),
    }, withBindings({ AUTH_MODE: 'standalone', GITHUB_CLIENT_ID: 'client' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    const row = await testEnv.DB.prepare("SELECT role FROM auth_users WHERE github_login = 'invitee-gh'").first<{ role: string }>();
    expect(row?.role).toBe('user');
  });

  it('does not consume the invite when the GitHub account already exists', async () => {
    await testEnv.DB.prepare(
      "INSERT INTO auth_users (id, email, github_login, role, created_at) VALUES ('existing', 'e@example.com', 'existinglogin', 'user', 0)",
    ).run();
    const { cookie } = await freshInvite();
    const app = injectedRouter({
      pollDeviceAuth: async () => ({ status: 'ok', accessToken: 'test-token' }),
      fetchUser: async () => ({ login: 'existinglogin', email: 'e@example.com', id: 3, name: 'Existing', avatar_url: '' }),
    });
    const res = await app.request('/redeem/github/poll', {
      method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: 'device' }),
    }, withBindings({ AUTH_MODE: 'standalone', GITHUB_CLIENT_ID: 'client' }));

    expect(res.status).toBe(409);
    const invite = await testEnv.DB.prepare('SELECT used_at FROM auth_invites').first<{ used_at: number | null }>();
    expect(invite?.used_at).toBeNull();
  });
});

describe('Cloudflare Access invite redemption', () => {
  beforeEach(resetAuthTables);

  const validAccess = async () => ({ sub: 'cf-access-user-1', email: 'access@example.com' });

  it('rejects invalid Access identity without consuming the invite', async () => {
    const { cookie } = await freshInvite();
    const app = injectedRouter({ verifyAccessJWT: async () => null });
    const res = await app.request('/redeem/access', {
      method: 'POST', headers: { cookie, 'cf-access-jwt-assertion': 'invalid' },
    }, withBindings({ AUTH_MODE: 'cf_access', CF_ACCESS_TEAM: 'team', CF_ACCESS_AUD: 'aud' }));
    expect(res.status).toBe(401);
    const invite = await testEnv.DB.prepare('SELECT used_at FROM auth_invites').first<{ used_at: number | null }>();
    expect(invite?.used_at).toBeNull();
  });

  it('consumes invite and creates the Access-bound user', async () => {
    const { cookie } = await freshInvite();
    const app = injectedRouter({ verifyAccessJWT: validAccess as InviteDeps['verifyAccessJWT'] });
    const res = await app.request('/redeem/access', {
      method: 'POST', headers: { cookie, 'cf-access-jwt-assertion': 'valid' },
    }, withBindings({ AUTH_MODE: 'cf_access', CF_ACCESS_TEAM: 'team', CF_ACCESS_AUD: 'aud' }));

    expect(res.status).toBe(200);
    const user = await testEnv.DB.prepare('SELECT email, role, access_sub FROM auth_users WHERE id = ?').bind('cf-access-user-1').first<{ email: string; role: string; access_sub: string }>();
    expect(user).toEqual({ email: 'access@example.com', role: 'user', access_sub: 'cf-access-user-1' });
  });

  it('returns 409 for an already registered Access identity and keeps invite valid', async () => {
    await testEnv.DB.prepare(
      "INSERT INTO auth_users (id, email, github_login, access_sub, role, created_at) VALUES ('existing-access', 'access@example.com', NULL, 'cf-access-user-1', 'user', 0)",
    ).run();
    const { cookie } = await freshInvite();
    const app = injectedRouter({ verifyAccessJWT: validAccess as InviteDeps['verifyAccessJWT'] });
    const res = await app.request('/redeem/access', {
      method: 'POST', headers: { cookie, 'cf-access-jwt-assertion': 'valid' },
    }, withBindings({ AUTH_MODE: 'cf_access', CF_ACCESS_TEAM: 'team', CF_ACCESS_AUD: 'aud' }));

    expect(res.status).toBe(409);
    const invite = await testEnv.DB.prepare('SELECT used_at FROM auth_invites').first<{ used_at: number | null }>();
    expect(invite?.used_at).toBeNull();
  });

  it('blocks Access redemption in standalone mode', async () => {
    const { cookie } = await freshInvite();
    const app = injectedRouter({ verifyAccessJWT: validAccess as InviteDeps['verifyAccessJWT'] });
    const res = await app.request('/redeem/access', { method: 'POST', headers: { cookie } }, withBindings({ AUTH_MODE: 'standalone' }));
    expect(res.status).toBe(409);
    expect((await res.json<{ error: { type: string } }>()).error.type).toBe('auth_mode');
  });
});
