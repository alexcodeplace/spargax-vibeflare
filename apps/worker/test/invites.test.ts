import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  createInvite,
  redeemInviteAtomic,
  getValidInvite,
  revokeInviteById,
} from '../src/auth/invites';
import { deleteUser, insertUser } from '../src/db/queries';
import { newId } from '../src/util/id';
import { sha256 } from '../src/util/hash';

// migrations applied globally in test/setup.ts beforeAll

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM auth_invites').run();
  await env.DB.prepare('DELETE FROM auth_users').run();
  await insertUser(env.DB, {
    id: 'owner-1',
    email: null,
    github_login: null,
    role: 'owner',
    created_at: Date.now(),
  });
});

const testEnv = env as unknown as { DB: D1Database };

describe('invites', () => {
  it('createInvite returns plaintext token + stores sha256 hash', async () => {
    const created = await createInvite(testEnv as any, {
      createdBy: 'owner-1',
      label: 'test label',
      expiresInSec: 3600,
    });

    expect(created.full).toMatch(/^vfi-/);
    expect(created.full.length).toBe(36); // vfi- (4) + nanoid(32)
    expect(created.prefix).toBe(created.full.slice(0, 8));
    expect(created.label).toBe('test label');
    expect(created.expires_at).toBeGreaterThan(Date.now());

    // DB stores hash, not plaintext
    const expectedHash = await sha256(created.full);
    const row = await env.DB
      .prepare('SELECT * FROM auth_invites WHERE id = ?')
      .bind(created.id)
      .first<{ token_hash: string; prefix: string; label: string }>();
    expect(row).not.toBeNull();
    expect(row!.token_hash).toBe(expectedHash);
    expect(row!.token_hash).not.toBe(created.full);
    expect(row!.prefix).toBe(created.prefix);
    expect(row!.label).toBe('test label');
  });

  it('getValidInvite returns null for unknown token', async () => {
    const result = await getValidInvite(env.DB, 'vfi-' + 'x'.repeat(32));
    expect(result).toBeNull();
  });

  it('getValidInvite returns null for non-vfi token', async () => {
    const result = await getValidInvite(env.DB, 'bad-token');
    expect(result).toBeNull();
  });

  it('getValidInvite returns invite for valid unused token', async () => {
    const created = await createInvite(testEnv as any, {
      createdBy: 'owner-1',
      label: null,
      expiresInSec: 3600,
    });
    const invite = await getValidInvite(env.DB, created.full);
    expect(invite).not.toBeNull();
    expect(invite!.id).toBe(created.id);
  });

  it('redeemInviteAtomic succeeds once then returns consumed', async () => {
    const created = await createInvite(testEnv as any, {
      createdBy: 'owner-1',
      label: null,
      expiresInSec: 3600,
    });

    // Insert user that will "redeem"
    const userId = newId();
    await insertUser(env.DB, {
      id: userId,
      email: 'u@example.com',
      github_login: null,
      role: 'user',
      created_at: Date.now(),
    });

    const first = await redeemInviteAtomic(env.DB, created.full, userId);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.invite.id).toBe(created.id);
    }

    // Second attempt same token
    const second = await redeemInviteAtomic(env.DB, created.full, userId);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('consumed');
    }
  });


  it('deleting an invited user clears only used_by and keeps the invite consumed', async () => {
    const created = await createInvite(testEnv as any, {
      createdBy: 'owner-1',
      label: 'deletion-regression',
      expiresInSec: 3600,
    });
    const userId = newId();
    await insertUser(env.DB, {
      id: userId,
      email: 'delete-me@example.com',
      github_login: null,
      role: 'user',
      created_at: Date.now(),
    });
    expect((await redeemInviteAtomic(env.DB, created.full, userId)).ok).toBe(true);

    await expect(deleteUser(env.DB, userId)).resolves.toBeUndefined();
    expect(await env.DB.prepare('SELECT id FROM auth_users WHERE id = ?').bind(userId).first()).toBeNull();
    const invite = await env.DB
      .prepare('SELECT used_at, used_by FROM auth_invites WHERE id = ?')
      .bind(created.id)
      .first<{ used_at: number | null; used_by: string | null }>();
    expect(invite?.used_at).toBeTypeOf('number');
    expect(invite?.used_by).toBeNull();

    const replay = await redeemInviteAtomic(env.DB, created.full, 'owner-1');
    expect(replay).toEqual({ ok: false, reason: 'consumed' });
  });

  it('redeemInviteAtomic rejects expired token', async () => {
    const created = await createInvite(testEnv as any, {
      createdBy: 'owner-1',
      label: null,
      expiresInSec: -1, // already expired
    });

    const userId = newId();
    await insertUser(env.DB, {
      id: userId,
      email: 'exp@example.com',
      github_login: null,
      role: 'user',
      created_at: Date.now(),
    });

    const result = await redeemInviteAtomic(env.DB, created.full, userId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('expired');
    }
  });

  it('redeemInviteAtomic rejects invalid token prefix', async () => {
    const result = await redeemInviteAtomic(env.DB, 'bad-token', 'any-user');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
    }
  });

  it('revokeInviteById blocks subsequent redeem', async () => {
    const created = await createInvite(testEnv as any, {
      createdBy: 'owner-1',
      label: 'revoke-me',
      expiresInSec: 3600,
    });

    await revokeInviteById(env.DB, created.id);

    // getValidInvite should return null
    const invite = await getValidInvite(env.DB, created.full);
    expect(invite).toBeNull();

    // redeemInviteAtomic should return revoked
    const userId = newId();
    await insertUser(env.DB, {
      id: userId,
      email: 'rev@example.com',
      github_login: null,
      role: 'user',
      created_at: Date.now(),
    });
    const result = await redeemInviteAtomic(env.DB, created.full, userId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('revoked');
    }
  });

  it('concurrent redemptions: exactly one succeeds', async () => {
    const created = await createInvite(testEnv as any, {
      createdBy: 'owner-1',
      label: null,
      expiresInSec: 3600,
    });

    // Insert 4 users
    const userIds = Array.from({ length: 4 }, () => newId());
    await Promise.all(
      userIds.map((id) =>
        insertUser(env.DB, {
          id,
          email: `concurrent-${id}@example.com`,
          github_login: null,
          role: 'user',
          created_at: Date.now(),
        }),
      ),
    );

    // Race all 4 redemptions
    const results = await Promise.all(
      userIds.map((id) => redeemInviteAtomic(env.DB, created.full, id)),
    );

    const successes = results.filter((r) => r.ok);
    expect(successes.length).toBe(1);

    const failures = results.filter((r) => !r.ok);
    expect(failures.length).toBe(3);
    // All failures should be consumed (not expired/revoked)
    for (const f of failures) {
      if (!f.ok) {
        expect(['consumed', 'not_found']).toContain(f.reason);
      }
    }
  });
});
