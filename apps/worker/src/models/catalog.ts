import type { Env } from '../env';
import { countModels, getSetting, setSetting, upsertModel } from '../db/queries';
import { syncModels } from '../crons/sync_models';

export type ModelSync = typeof syncModels;
export const MODEL_CATALOG_READY_KEY = 'system.model_catalog_ready';
export const MODEL_CATALOG_READY_VALUE = '2';
export const MODEL_CATALOG_SYNCED_AT_KEY = 'system.model_catalog_synced_at';
export const MODEL_CATALOG_REFRESH_MS = 24 * 60 * 60 * 1000;

// Emergency fallback only. Normal zero-config operation always reads the full
// public Cloudflare catalog. These models keep first-run usable if Cloudflare's
// documentation endpoint is temporarily unavailable.
const FALLBACK_MODELS = [
  ['@cf/meta/llama-3.2-3b-instruct', 'text-generation', 'Known-good VibeFlare default chat model.'],
  ['@cf/black-forest-labs/flux-1-schnell', 'text-to-image', 'Known-good VibeFlare fallback image model.'],
] as const;

let refreshInFlight: Promise<{ initialized: boolean; count: number }> | null = null;

async function seedFallbackCatalog(env: Env): Promise<number> {
  const syncedAt = Date.now();
  for (const [name, task, description] of FALLBACK_MODELS) {
    await upsertModel(env.DB, {
      name,
      task,
      description,
      properties: JSON.stringify({ source: 'vibeflare-emergency-fallback' }),
      neurons_input: null,
      neurons_output: null,
      neurons_flat: null,
      beta: 0,
      enabled: 1,
      synced_at: syncedAt,
    });
  }
  return countModels(env.DB);
}

async function isReady(env: Env): Promise<boolean> {
  return (await getSetting(env.DB, MODEL_CATALOG_READY_KEY)) === MODEL_CATALOG_READY_VALUE;
}

async function isFresh(env: Env, now = Date.now()): Promise<boolean> {
  const value = await getSetting(env.DB, MODEL_CATALOG_SYNCED_AT_KEY);
  if (!value) return false;
  const syncedAt = Number(value);
  return Number.isFinite(syncedAt) && now - syncedAt < MODEL_CATALOG_REFRESH_MS;
}

async function syncAndMarkReady(
  env: Env,
  sync: ModelSync,
): Promise<{ result: Awaited<ReturnType<ModelSync>>; count: number }> {
  const result = await sync(env);
  const count = await countModels(env.DB);
  if (count === 0) throw new Error('Cloudflare model discovery returned no models');
  const now = Date.now();
  await setSetting(env.DB, MODEL_CATALOG_READY_KEY, MODEL_CATALOG_READY_VALUE, now);
  await setSetting(env.DB, MODEL_CATALOG_SYNCED_AT_KEY, String(now), now);
  return { result, count };
}

/** Force a complete catalog refresh, used by the explicit Refresh models action. */
export async function refreshModelCatalog(
  env: Env,
  sync: ModelSync = syncModels,
): Promise<Awaited<ReturnType<ModelSync>>> {
  const { result } = await syncAndMarkReady(env, sync);
  return result;
}

/**
 * Lazily populate/refresh the model catalog when it is actually requested.
 * Successful catalog data is refreshed at most once every 24 hours. If the
 * public Cloudflare catalog is temporarily unavailable, existing rows continue
 * to work; on a brand-new install a tiny known-good fallback keeps setup usable
 * and the next model-list request retries the public catalog.
 */
export async function ensureModelCatalog(
  env: Env,
  sync: ModelSync = syncModels,
): Promise<{ initialized: boolean; count: number }> {
  const ready = await isReady(env);
  if (ready && await isFresh(env)) {
    return { initialized: false, count: await countModels(env.DB) };
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const wasReady = await isReady(env);
      if (wasReady && await isFresh(env)) {
        return { initialized: false, count: await countModels(env.DB) };
      }
      try {
        const { count } = await syncAndMarkReady(env, sync);
        return { initialized: !wasReady, count };
      } catch (error) {
        const existing = await countModels(env.DB);
        if (existing > 0) {
          // Do not turn a transient docs outage into a product outage. Leave the
          // sync timestamp stale so the next lazy load retries automatically.
          return { initialized: false, count: existing };
        }
        if (sync !== syncModels) throw error;
        const count = await seedFallbackCatalog(env);
        await setSetting(env.DB, MODEL_CATALOG_READY_KEY, MODEL_CATALOG_READY_VALUE, Date.now());
        return { initialized: true, count };
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}
