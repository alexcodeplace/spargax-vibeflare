import type { Env } from '../env';
import { countModels, getSetting, setSetting, upsertModel } from '../db/queries';
import { syncModels } from '../crons/sync_models';

export type ModelSync = typeof syncModels;
export const MODEL_CATALOG_READY_KEY = 'system.model_catalog_ready';

let initializationInFlight: Promise<{ initialized: boolean; count: number }> | null = null;

function hasRemoteCatalogCredentials(env: Env): boolean {
  return Boolean(env.CF_ACCOUNT_ID?.trim() && env.CF_API_TOKEN?.trim());
}

async function seedBuiltInCatalog(env: Env): Promise<{ count: number; delisted: number; rearmed: number }> {
  await upsertModel(env.DB, {
    name: '@cf/meta/llama-3.2-3b-instruct',
    task: 'text-generation',
    description: 'Reliable built-in Workers AI chat model for zero-config deployments.',
    properties: '[]',
    neurons_input: null,
    neurons_output: null,
    neurons_flat: null,
    beta: 0,
    enabled: 1,
    synced_at: Date.now(),
  });
  return { count: 1, delisted: 0, rearmed: 0 };
}

async function isReady(env: Env): Promise<boolean> {
  return (await getSetting(env.DB, MODEL_CATALOG_READY_KEY)) === '1';
}

async function syncAndMarkReady(env: Env, sync: ModelSync): Promise<{ result: Awaited<ReturnType<ModelSync>>; count: number }> {
  const useRemoteSync = sync !== syncModels || hasRemoteCatalogCredentials(env);
  const result = useRemoteSync ? await sync(env) : await seedBuiltInCatalog(env);
  const count = await countModels(env.DB);
  if (count === 0) throw new Error('Cloudflare model discovery returned no models');
  await setSetting(env.DB, MODEL_CATALOG_READY_KEY, '1', Date.now());
  return { result, count };
}

/** Force a complete catalog refresh and durably mark the catalog ready only after success. */
export async function refreshModelCatalog(env: Env, sync: ModelSync = syncModels): Promise<Awaited<ReturnType<ModelSync>>> {
  const { result } = await syncAndMarkReady(env, sync);
  return result;
}

/**
 * Populate a new installation on first model access.
 *
 * The durable ready marker is deliberately separate from row count. A sync
 * writes model rows page-by-page, so a concurrent request can observe rows
 * before reconciliation has completed. Without this marker that request could
 * return a partial alphabetic catalog and lock Chat onto the wrong default.
 */
export async function ensureModelCatalog(
  env: Env,
  sync: ModelSync = syncModels,
): Promise<{ initialized: boolean; count: number }> {
  if (await isReady(env)) {
    return { initialized: false, count: await countModels(env.DB) };
  }

  if (!initializationInFlight) {
    initializationInFlight = (async () => {
      // Recheck after winning the local single-flight in case another request
      // completed while this request was waiting on D1.
      if (await isReady(env)) {
        return { initialized: false, count: await countModels(env.DB) };
      }
      const { count } = await syncAndMarkReady(env, sync);
      return { initialized: true, count };
    })().finally(() => {
      initializationInFlight = null;
    });
  }

  return initializationInFlight;
}
