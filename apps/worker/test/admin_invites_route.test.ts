import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { SELF } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import { insertUser } from '../src/db/queries';

// SESSION_SECRET from wrangler.toml [vars]
const SECRET = 'test-secret-for-vitest';
const now = Math.floor(Date.now() / 1000);

async function makeSession(userId: string, role: 'owner' | 'user' = 'owner'): Promise<string> {
  return sign({ sub: userId, role, iat: now, exp: now + 3600 }, SECRET);
}

async function seedOwner(id = 'inv-owner-1') {
  await insertUser(env.DB, {
    id,
    email: 'owner@example.com',
    github_login: null,
    role: 'owner',
    created_at: Date.now(),
  });
  return id;
}

async function seedUser(id = 'inv-user-1') {
  await insertUser(env.DB, {
    id,
    email: 'user@example.com',
    github_login: null,
    role: 'user',
    created_at: Date.now(),
  });
  return id;
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM auth_invites').run();
  await env.DB.prepare('DELETE FROM auth_users').run();
});

describe('/admin/invites', () => {
  it('rejects non-owner POST with 403', async () => {
    const userId = await seedUser('inv-nonowner-post');
    const token = await makeSession(userId, 'user');

    const res = await SELF.fetch('http://x/admin/invites', {
      method: 'POST',
      headers: {
        Cookie: `vf_sess=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'test' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { type: string } };
    expect(body.error.type).toBe('forbidden');
  });

  it('owner POST creates invite, returns full token + prefix', async () => {
    const userId = await seedOwner('inv-owner-post');
    const token = await makeSession(userId, 'owner');

    const res = await SELF.fetch('http://x/admin/invites', {
      method: 'POST',
      headers: {
        Cookie: `vf_sess=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'beta tester', expires_in_sec: 86400 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as {
      id: string;
      full: string;
      prefix: string;
      label: string | null;
      expires_at: number;
    };
    expect(body.full).toMatch(/^vfi-/);
    expect(body.prefix).toBe(body.full.slice(0, 8));
    expect(body.label).toBe('beta tester');
    expect(body.expires_at).toBeGreaterThan(Date.now());
  });

  it('owner POST with invalid expires_in_sec falls back to 7d default', async () => {
    const userId = await seedOwner('inv-owner-post-default');
    const token = await makeSession(userId, 'owner');

    const res = await SELF.fetch('http://x/admin/invites', {
      method: 'POST',
      headers: {
        Cookie: `vf_sess=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expires_in_sec: 9999 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { expires_at: number };
    const sevenDaysMs = 604800 * 1000;
    expect(body.expires_at).toBeGreaterThanOrEqual(Date.now() + sevenDaysMs - 5000);
  });

  it('owner GET lists invites without token_hash', async () => {
    const userId = await seedOwner('inv-owner-get');
    const token = await makeSession(userId, 'owner');

    // Create one invite first
    await SELF.fetch('http://x/admin/invites', {
      method: 'POST',
      headers: {
        Cookie: `vf_sess=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'list test' }),
    });

    const res = await SELF.fetch('http://x/admin/invites', {
      headers: { Cookie: `vf_sess=${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { invites: Record<string, unknown>[] };
    expect(Array.isArray(body.invites)).toBe(true);
    expect(body.invites.length).toBeGreaterThan(0);
    // token_hash must not be present
    for (const inv of body.invites) {
      expect('token_hash' in inv).toBe(false);
    }
  });

  it('owner DELETE marks revoked_at', async () => {
    const userId = await seedOwner('inv-owner-del');
    const token = await makeSession(userId, 'owner');

    // Create invite
    const createRes = await SELF.fetch('http://x/admin/invites', {
      method: 'POST',
      headers: {
        Cookie: `vf_sess=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const created = await createRes.json() as { id: string };

    const delRes = await SELF.fetch(`http://x/admin/invites/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: `vf_sess=${token}` },
    });
    expect(delRes.status).toBe(200);
    const body = await delRes.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // Verify revoked_at set in DB
    const row = await env.DB.prepare(
      'SELECT revoked_at FROM auth_invites WHERE id = ?'
    ).bind(created.id).first<{ revoked_at: number | null }>();
    expect(row?.revoked_at).not.toBeNull();
  });

  it('owner DELETE on unknown id returns 404', async () => {
    const userId = await seedOwner('inv-owner-del-404');
    const token = await makeSession(userId, 'owner');

    const res = await SELF.fetch('http://x/admin/invites/nonexistent-id', {
      method: 'DELETE',
      headers: { Cookie: `vf_sess=${token}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { type: string } };
    expect(body.error.type).toBe('not_found');
  });

  it('rejects non-owner GET with 403', async () => {
    const userId = await seedUser('inv-nonowner-get');
    const token = await makeSession(userId, 'user');

    const res = await SELF.fetch('http://x/admin/invites', {
      headers: { Cookie: `vf_sess=${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('returns 401 without session', async () => {
    const res = await SELF.fetch('http://x/admin/invites');
    expect(res.status).toBe(401);
  });
});
