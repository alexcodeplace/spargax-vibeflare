import type { Env } from '../env';
import { recordModelSuccess, recordModelFailure } from '../db/queries';
import { isUpstreamQuotaError } from './errors';

/** Consecutive upstream failures on real traffic before a model is taken out of the catalog. */
const FAILURE_THRESHOLD = 3;

export interface ModelHealthSignal {
  model?: string;
  status: number;
  cached?: boolean;
  error?: string;
}

/**
 * Derives model liveness from a request that was actually served, so no synthetic
 * inference is needed. Client errors and cache hits carry no evidence either way.
 */
export async function recordModelHealth(env: Env, signal: ModelHealthSignal): Promise<void> {
  if (!signal.model || signal.cached) return;

  const now = Date.now();
  if (signal.status < 400) {
    await recordModelSuccess(env.DB, signal.model, now);
    return;
  }
  if (signal.status < 500) return;

  const message = signal.error ?? `status ${signal.status}`;
  // A spent neuron allocation says nothing about the model.
  if (isUpstreamQuotaError(message)) return;

  await recordModelFailure(env.DB, signal.model, message, now, FAILURE_THRESHOLD);
}
