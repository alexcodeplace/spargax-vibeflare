import { beforeEach, expect, it } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import { insertUser, upsertModel } from '../src/db/queries';

let owner: Record<string, string>;
let member: Record<string, string>;
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM chat_messages').run();
  await env.DB.prepare('DELETE FROM chats').run();
  for (const role of ['owner', 'user'] as const) {
    await insertUser(env.DB, { id: `chat-test-${role}`, email: null, github_login: null, role, created_at: 1 });
  }
  const headers = async (role: 'owner' | 'user') => ({
    'Content-Type': 'application/json',
    Cookie: `vf_sess=${await sign({ sub: `chat-test-${role}`, role, exp: Math.floor(Date.now() / 1000) + 3600 }, 'test-secret-for-vitest')}`,
  });
  owner = await headers('owner');
  member = await headers('user');
  await upsertModel(env.DB, { name: '@cf/test/chat', task: 'text-generation', description: null, properties: '{}', neurons_input: 1, neurons_output: 1, neurons_flat: null, beta: 0, enabled: 1, synced_at: 1 });
});

async function create(body: unknown, headers = owner) {
  return SELF.fetch('http://x/admin/chats', { method: 'POST', headers, body: JSON.stringify(body) });
}

it('persists an owned conversation before any inference, with a bounded local title', async () => {
  const response = await create({ model: '@cf/test/chat', title: '  Hello\n Workspace  ' });
  expect(response.status).toBe(201);
  const { chat } = await response.json<{ chat: { id: string; title: string } }>();
  expect(chat.title).toBe('Hello Workspace');
  const row = await env.DB.prepare('SELECT user_id FROM chats WHERE id = ?').bind(chat.id).first<{ user_id: string }>();
  expect(row?.user_id).toBe('chat-test-owner');
  const list = await SELF.fetch('http://x/admin/chats', { headers: owner });
  expect(list.headers.get('cache-control')).toBe('private, no-store');
  expect((await list.json<{ chats: unknown[] }>()).chats).toHaveLength(1);
  const counts = await env.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages').first<{ n: number }>();
  expect(counts?.n).toBe(0);
});

it('does not leak or mutate another account\'s Workspace conversation', async () => {
  const response = await create({ model: '@cf/test/chat', title: 'Private title' });
  const { chat } = await response.json<{ chat: { id: string } }>();
  const list = await SELF.fetch('http://x/admin/chats', { headers: member });
  expect((await list.json<{ chats: unknown[] }>()).chats).toHaveLength(0);
  expect((await SELF.fetch(`http://x/admin/chats/${chat.id}/messages`, { headers: member })).status).toBe(404);
  expect((await SELF.fetch(`http://x/admin/chats/${chat.id}`, { method: 'DELETE', headers: member })).status).toBe(404);
});

it('rejects invalid chat creation and unauthenticated requests', async () => {
  for (const body of [null, [], {}, { title: ' ', model: '@cf/test/chat' }, { title: 1, model: '@cf/test/chat' }]) {
    expect((await create(body)).status).toBe(400);
  }
  expect((await create({ title: 'test', model: 'missing-model' })).status).toBe(404);
  expect((await create({ title: 'test', model: '@cf/test/chat' }, {})).status).toBe(401);
});
