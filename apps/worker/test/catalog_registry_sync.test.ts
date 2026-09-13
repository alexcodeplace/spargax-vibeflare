import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { syncModels } from '../src/crons/sync_models';
import { getModel, upsertModel, markModelPaidRequired } from '../src/db/queries';
import { modelRequiresPaid } from '../src/models/access';

const base = { task: 'text-generation', description: null, properties: '{}', neurons_input: null, neurons_output: null, neurons_flat: null, beta: 0, enabled: 1, synced_at: 1 };
const record = (name: string, properties: unknown[] = []) => ({ name, task: { name: 'Text Generation' }, properties, deprecated: false });
beforeEach(async () => { await env.DB.prepare('DELETE FROM models').run(); });
afterEach(() => { vi.unstubAllGlobals(); });

function mockRegistry(rows: unknown[]) {
  const fetcher = vi.fn(async (input: string | Request | URL) =>
    String(input).includes('/pricing/') ? new Response('temporarily unavailable', { status: 503 }) : Response.json({ models: rows }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('structured catalog persistence', () => {
  it('retires stale HTML rows and saves explicit access/source without pricing', async () => {
    await upsertModel(env.DB, { ...base, name: '@cf/microsoft/phi-2', properties: '{"paid_required":false}' });
    await upsertModel(env.DB, { ...base, name: '@cf/google/embeddinggemma-300m' });
    const fetcher = mockRegistry([record('@cf/google/embeddinggemma-300m')]);
    const run = vi.fn(() => { throw new Error('Metadata refresh must not run inference'); });
    const result = await syncModels({ DB: env.DB, AI: { run } } as never);
    expect(result.count).toBe(1);
    expect((await getModel(env.DB, '@cf/microsoft/phi-2'))?.enabled).toBe(0);
    const active = await getModel(env.DB, '@cf/google/embeddinggemma-300m');
    expect(modelRequiresPaid(active!)).toBe(false);
    const props = JSON.parse(active!.properties!);
    expect(props.source).toBe('cloudflare-model-registry');
    expect(props.access_source).toBe('https://ai-cloudflare-com.pages.dev/api/models');
    expect(props.access_checked_at).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps real-request paid restrictions when refreshed metadata lacks that flag', async () => {
    await upsertModel(env.DB, { ...base, name: '@cf/test/restricted' });
    await markModelPaidRequired(env.DB, '@cf/test/restricted', '5035', Date.now());
    mockRegistry([record('@cf/test/restricted')]);
    await syncModels({ DB: env.DB } as never);
    expect(modelRequiresPaid((await getModel(env.DB, '@cf/test/restricted'))!)).toBe(true);
  });

  it('leaves previous rows intact when any incoming record is malformed', async () => {
    await upsertModel(env.DB, { ...base, name: '@cf/test/previous', properties: '{"paid_required":true}' });
    mockRegistry([record('@cf/test/new'), { name: '@cf/test/broken' }]);
    await expect(syncModels({ DB: env.DB } as never)).rejects.toThrow('invalid model record');
    expect(await getModel(env.DB, '@cf/test/new')).toBeNull();
    expect((await getModel(env.DB, '@cf/test/previous'))?.enabled).toBe(1);
  });
});
