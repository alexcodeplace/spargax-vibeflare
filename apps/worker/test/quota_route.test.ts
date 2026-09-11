import { beforeEach, describe, expect, it } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { insertApiKey, insertUser, revokeApiKey } from '../src/db/queries';
import { sha256 } from '../src/util/hash';

const KEY = 'vf-test-quota-route-key';
const USER_ID = 'quota-route-user';
const KEY_ID = 'quota-route-key-id';

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM api_keys').run();
  await env.DB.prepare('DELETE FROM auth_users').run();
  await insertUser(env.DB, {
    id: USER_ID,
    email: 'quota@example.test',
    github_login: null,
    role: 'user',
    created_at: Date.now(),
  });
  await insertApiKey(env.DB, {
    id: KEY_ID,
    user_id: USER_ID,
    key_hash: await sha256(KEY),
    prefix: KEY.slice(0, 8),
    label: 'quota route',
    is_admin: 0,
    created_at: Date.now(),
  });
});

describe('GET /v1/quota', () => {
  it('returns quota for a valid bearer key', async () => {
    const response = await SELF.fetch('http://x/v1/quota', {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { used: number; limit: number; day?: string };
    expect(body.used).toBeGreaterThanOrEqual(0);
    expect(body.limit).toBeGreaterThan(0);
  });

  it('rejects a revoked bearer key', async () => {
    await revokeApiKey(env.DB, KEY_ID, Date.now());
    const response = await SELF.fetch('http://x/v1/quota', {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { type: 'auth', message: 'invalid api key' } });
  });
});
