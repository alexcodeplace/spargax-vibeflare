import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { ensureModelCatalog, MODEL_CATALOG_READY_KEY } from '../src/models/catalog';
import { countModels, getSetting, setModelEnabled, upsertModel } from '../src/db/queries';

const model = {
  name: '@cf/test/bootstrap', task: 'text-generation', description: null, properties: '[]',
  neurons_input: null, neurons_output: null, neurons_flat: null, beta: 0, enabled: 1, synced_at: 1,
};
const preferred = { ...model, name: '@cf/meta/llama-3.2-3b-instruct', synced_at: 2 };

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM models').run();
  await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(MODEL_CATALOG_READY_KEY).run();
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
    expect(await getSetting(env.DB, MODEL_CATALOG_READY_KEY)).toBe('1');
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
