import { beforeEach, describe, expect, it } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import { deleteUser, getModel, getSetting, insertUser, setSetting, upsertModel } from '../src/db/queries';
import { hiddenModels, modelVisibilityPrefix } from '../src/models/preferences';
import { MODEL_CATALOG_READY_KEY, MODEL_CATALOG_READY_VALUE, MODEL_CATALOG_SYNCED_AT_KEY } from '../src/models/catalog';

const one = '@cf/test/one';
const two = '@cf/test/two';
const paid = '@cf/test/paid';
const base = { task: 'text-generation', description: null, neurons_input: 1, neurons_output: 1, neurons_flat: null, beta: 0, enabled: 1, synced_at: 1 };
let owner: Record<string, string>;
let member: Record<string, string>;

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM models').run();
  await env.DB.prepare('DELETE FROM settings').run();
  for (const role of ['owner', 'user'] as const) {
    await insertUser(env.DB, { id: `visibility-${role}`, email: null, github_login: null, role, created_at: Date.now() });
  }
  const headers = async (role: 'owner' | 'user') => ({
    Cookie: `vf_sess=${await sign({ sub: `visibility-${role}`, role, exp: Math.floor(Date.now() / 1000) + 3600 }, 'test-secret-for-vitest')}`,
    'Content-Type': 'application/json',
  });
  owner = await headers('owner'); member = await headers('user');
  for (const name of [one, two, paid]) await upsertModel(env.DB, { ...base, name, properties: JSON.stringify({ paid_required: name === paid }) });
  await setSetting(env.DB, MODEL_CATALOG_READY_KEY, MODEL_CATALOG_READY_VALUE, Date.now());
  await setSetting(env.DB, MODEL_CATALOG_SYNCED_AT_KEY, String(Date.now()), Date.now());
});

const patch = (body: unknown, headers = owner) => SELF.fetch('https://x/admin/models/visibility', { method: 'PATCH', headers, body: JSON.stringify(body) });
async function models(path = '/admin/models', headers = owner) {
  const res = await SELF.fetch(`https://x${path}`, { headers });
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('private, no-store');
  return res.json<{ models: { name: string; visible?: boolean }[] }>();
}

describe('personal model visibility', () => {
  it('shows available models by default and hides unchecked models only from chat', async () => {
    expect((await models()).models.map(m => m.name)).toEqual([one, two]);
    expect((await patch({ name: one, visible: false })).status).toBe(200);
    expect((await models()).models.map(m => m.name)).toEqual([two]);
    expect((await getModel(env.DB, one))?.enabled).toBe(1);
    expect((await models('/admin/models/preferences')).models).toContainEqual(expect.objectContaining({ name: one, visible: false }));
    const api = await SELF.fetch('https://x/v1/models', { headers: { ...owner, 'x-vf-browser': '1' } });
    expect((await api.json<{ data: { id: string }[] }>()).data.some(m => m.id === one)).toBe(true);
  });

  it('can restore a hidden model without losing its checkbox', async () => {
    await patch({ name: one, visible: false });
    expect((await patch({ name: one, visible: true })).status).toBe(200);
    expect((await models()).models.map(m => m.name)).toEqual([one, two]);
    expect((await hiddenModels(env.DB, 'visibility-owner')).size).toBe(0);
  });

  it('preserves manual choices through catalog syncs and paid-policy changes', async () => {
    await patch({ name: one, visible: false });
    await upsertModel(env.DB, { ...base, name: one, synced_at: 5, properties: '{"paid_required":false}' });
    await setSetting(env.DB, 'models.exclude_paid', '0', Date.now());
    expect((await models()).models.map(m => m.name)).toEqual([paid, two]);
    await patch({ name: paid, visible: false });
    await setSetting(env.DB, 'models.exclude_paid', '1', Date.now());
    await setSetting(env.DB, 'models.exclude_paid', '0', Date.now());
    expect((await models('/admin/models/preferences')).models).toContainEqual(expect.objectContaining({ name: paid, visible: false }));
  });

  it('keeps each account isolated and lets a member manage their own picker', async () => {
    await patch({ name: one, visible: false });
    expect((await models('/admin/models', member)).models.map(m => m.name)).toEqual([one, two]);
    expect((await patch({ name: two, visible: false }, member)).status).toBe(200);
    expect((await models('/admin/models', member)).models.map(m => m.name)).toEqual([one]);
    expect((await models()).models.map(m => m.name)).toEqual([two]);
  });

  it('saves concurrent per-model edits without a whole-list overwrite', async () => {
    const saved = await Promise.all([patch({ name: one, visible: false }), patch({ name: two, visible: false })]);
    expect(saved.map(r => r.status)).toEqual([200, 200]);
    expect((await models()).models).toEqual([]);
    expect((await models('/admin/models/preferences')).models).toHaveLength(2);
  });

  it('rejects invalid bodies, unknown models and requests without a session', async () => {
    for (const body of [null, [], {}, { name: one, visible: 'false' }, { name: 2, visible: true }, { name: one, visible: false, userId: 'visibility-user' }]) {
      expect((await patch(body)).status).toBe(400);
    }
    expect((await patch({ name: '@cf/test/missing', visible: false })).status).toBe(404);
    expect((await patch({ name: one, visible: false }, {})).status).toBe(401);
    expect((await hiddenModels(env.DB, 'visibility-owner')).size).toBe(0);
  });

  it('does not bypass the Exclude paid policy', async () => {
    expect((await patch({ name: paid, visible: true })).status).toBe(403);
    expect((await models('/admin/models/preferences')).models.some(m => m.name === paid)).toBe(false);
  });

  it('does not expose or allow cross-user writes through the generic settings API', async () => {
    await patch({ name: one, visible: false });
    const key = modelVisibilityPrefix('visibility-owner') + encodeURIComponent(one);
    const response = await SELF.fetch('https://x/admin/settings', { headers: member });
    const data = await response.json<{ settings: Record<string, string> }>();
    expect(Object.keys(data.settings).some(k => k.startsWith('system.model_visibility:'))).toBe(false);
    await SELF.fetch('https://x/admin/settings', { method: 'PUT', headers: member, body: JSON.stringify({ [key]: '1' }) });
    expect(await getSetting(env.DB, key)).toBe('0');
  });

  it('removes only the deleted user\'s private preferences', async () => {
    await patch({ name: one, visible: false });
    await patch({ name: two, visible: false }, member);
    await deleteUser(env.DB, 'visibility-user');
    expect((await hiddenModels(env.DB, 'visibility-user')).size).toBe(0);
    expect(await hiddenModels(env.DB, 'visibility-owner')).toEqual(new Set([one]));
  });
});
