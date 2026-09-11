import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { upsertModel, setModelEnabled, getModel } from '../src/db/queries';

const base = {
  task: 'text-to-image',
  description: null,
  properties: '[]',
  neurons_input: null,
  neurons_output: null,
  neurons_flat: null,
  beta: 0,
  enabled: 1,
  synced_at: Date.now(),
};

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM models').run();
});

describe('upsertModel', () => {
  it('new model inserted with enabled=1', async () => {
    await upsertModel(env.DB, { name: '@cf/test/new', ...base });
    const row = await getModel(env.DB, '@cf/test/new');
    expect(row?.enabled).toBe(1);
  });

  it('re-sync does NOT reset enabled=0 back to 1', async () => {
    await upsertModel(env.DB, { name: '@cf/test/broken', ...base });
    await setModelEnabled(env.DB, '@cf/test/broken', 0);

    // Simulate sync re-running (enabled: 1 in payload)
    await upsertModel(env.DB, { name: '@cf/test/broken', ...base, synced_at: base.synced_at + 1 });

    const row = await getModel(env.DB, '@cf/test/broken');
    expect(row?.enabled).toBe(0);
  });

  it('re-sync updates other fields (task, description, synced_at)', async () => {
    await upsertModel(env.DB, { name: '@cf/test/update', ...base, description: 'old' });
    await upsertModel(env.DB, { name: '@cf/test/update', ...base, description: 'new', synced_at: base.synced_at + 1 });
    const row = await getModel(env.DB, '@cf/test/update');
    expect(row?.description).toBe('new');
  });
});
