import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { ensureModelCatalog, MODEL_CATALOG_READY_KEY, MODEL_CATALOG_READY_VALUE, MODEL_CATALOG_REFRESH_MS, MODEL_CATALOG_SYNCED_AT_KEY } from '../src/models/catalog';
import { countModels, getSetting, setModelEnabled, setSetting, upsertModel } from '../src/db/queries';

const model = {
  name: '@cf/test/bootstrap', task: 'text-generation', description: null, properties: '[]',
  neurons_input: null, neurons_output: null, neurons_flat: null, beta: 0, enabled: 1, synced_at: 1,
};
const preferred = { ...model, name: '@cf/meta/llama-3.2-3b-instruct', synced_at: 2 };

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM models').run();
  await env.DB.prepare('DELETE FROM settings WHERE key IN (?, ?)').bind(MODEL_CATALOG_READY_KEY, MODEL_CATALOG_SYNCED_AT_KEY).run();
});

describe('ensureModelCatalog', () => {
  it('syncs exactly once when a brand-new catalog is empty', async () => {
    const sync = vi.fn(async () => {
      await upsertModel(env.DB, model);
      return { count: 1, delisted: 0, rearmed: 0 };
    });
    await expect(ensureModelCatalog(env as never, sync as never)).resolves.toEqual({ initialized: true, count: 1 });
    await expect(ensureModelCatalog(env as never, sync as never)).resolves.toEqual({ initialized: false, count: 1 });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(await getSetting(env.DB, MODEL_CATALOG_READY_KEY)).toBe('2');
  });

  it('refreshes lazily after the 24-hour catalog TTL expires', async () => {
    const initial = vi.fn(async () => {
      await upsertModel(env.DB, model);
      return { count: 1, delisted: 0, rearmed: 0 };
    });
    await ensureModelCatalog(env as never, initial as never);
    await setSetting(env.DB, MODEL_CATALOG_SYNCED_AT_KEY, String(Date.now() - MODEL_CATALOG_REFRESH_MS - 1), Date.now());

    const refresh = vi.fn(async () => {
      await upsertModel(env.DB, preferred);
      return { count: 2, delisted: 0, rearmed: 0 };
    });
    await expect(ensureModelCatalog(env as never, refresh as never)).resolves.toEqual({ initialized: false, count: 2 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes old HTML-derived catalogs immediately, regardless of their 24-hour timestamp', async () => {
    await upsertModel(env.DB, model);
    await setSetting(env.DB, MODEL_CATALOG_READY_KEY, '1', Date.now());
    await setSetting(env.DB, MODEL_CATALOG_SYNCED_AT_KEY, String(Date.now()), Date.now());
    const sync = vi.fn(async () => ({ count: 1, delisted: 0, rearmed: 0 }));
    await ensureModelCatalog(env as never, sync);
    expect(sync).toHaveBeenCalledOnce();
    expect(await getSetting(env.DB, MODEL_CATALOG_READY_KEY)).toBe(MODEL_CATALOG_READY_VALUE);
  });

  it('retains the last verified catalog if a refresh fails', async () => {
    await upsertModel(env.DB, preferred);
    await setSetting(env.DB, MODEL_CATALOG_READY_KEY, MODEL_CATALOG_READY_VALUE, Date.now());
    const sync = vi.fn(async () => { throw new Error('registry offline'); });
    await expect(ensureModelCatalog(env as never, sync)).resolves.toEqual({ initialized: false, count: 1 });
    expect(await countModels(env.DB)).toBe(1);
  });

  it('does not mistake partially inserted rows for a completed catalog', async () => {
    await upsertModel(env.DB, model); // simulates page-one rows visible during another sync
    const sync = vi.fn(async () => {
      await upsertModel(env.DB, preferred);
      return { count: 2, delisted: 0, rearmed: 0 };
    });
    await expect(ensureModelCatalog(env as never, sync as never)).resolves.toEqual({ initialized: true, count: 2 });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(await countModels(env.DB)).toBe(2);
  });

  it('collapses concurrent first-access requests into one local sync', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const sync = vi.fn(async () => {
      await gate;
      await upsertModel(env.DB, preferred);
      return { count: 1, delisted: 0, rearmed: 0 };
    });
    const first = ensureModelCatalog(env as never, sync as never);
    const second = ensureModelCatalog(env as never, sync as never);
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { initialized: true, count: 1 }, { initialized: true, count: 1 },
    ]);
  });

  it('does not resync an initialized catalog merely because all models are disabled', async () => {
    const initial = vi.fn(async () => {
      await upsertModel(env.DB, model);
      return { count: 1, delisted: 0, rearmed: 0 };
    });
    await ensureModelCatalog(env as never, initial as never);
    await setModelEnabled(env.DB, model.name, 0);
    const sync = vi.fn();
    await expect(ensureModelCatalog(env as never, sync as never)).resolves.toEqual({ initialized: false, count: 1 });
    expect(sync).not.toHaveBeenCalled();
  });

  it('fails without a ready marker when discovery returns no rows', async () => {
    const sync = vi.fn(async () => ({ count: 0, delisted: 0, rearmed: 0 }));
    await expect(ensureModelCatalog(env as never, sync as never)).rejects.toThrow('returned no models');
    expect(await countModels(env.DB)).toBe(0);
    expect(await getSetting(env.DB, MODEL_CATALOG_READY_KEY)).toBeNull();
  });
});
