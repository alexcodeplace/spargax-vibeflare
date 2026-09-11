import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getUserByAccessSub, linkAccessSub } from '../src/db/queries';

async function seed(id: string, accessSub: string | null = null) {
  await env.DB.prepare(
    "INSERT INTO auth_users (id, email, github_login, access_sub, role, created_at) VALUES (?, NULL, ?, ?, 'owner', 0)",
  )
    .bind(id, id, accessSub)
    .run();
}

describe('cf access account linking', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM auth_users').run();
  });

  it('links a verified access sub to an unlinked user and resolves it back', async () => {
    await seed('u1');
    await linkAccessSub(env.DB, 'u1', 'access-sub-1');
    const user = await getUserByAccessSub(env.DB, 'access-sub-1');
    expect(user?.id).toBe('u1');
  });

  it('does not relink a user that already has an access identity', async () => {
    await seed('u1', 'access-sub-1');
    await linkAccessSub(env.DB, 'u1', 'access-sub-2');
    expect(await getUserByAccessSub(env.DB, 'access-sub-2')).toBeNull();
    expect((await getUserByAccessSub(env.DB, 'access-sub-1'))?.id).toBe('u1');
  });

  it('does not attach one access sub to two users', async () => {
    await seed('u1', 'access-sub-1');
    await seed('u2');
    await linkAccessSub(env.DB, 'u2', 'access-sub-1');
    expect((await getUserByAccessSub(env.DB, 'access-sub-1'))?.id).toBe('u1');
  });
});
