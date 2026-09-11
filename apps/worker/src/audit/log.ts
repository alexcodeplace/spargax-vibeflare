import type { Env } from '../env';
import { insertAuditEvent } from '../db/queries';
import { recordModelHealth } from '../ai/health';
import { nanoid } from 'nanoid';

export interface AuditInput {
  userId: string | null;
  apiKeyId: string | null;
  endpoint: string;
  model?: string;
  task?: string;
  status: number;
  tokensIn?: number;
  tokensOut?: number;
  neurons?: number;
  durationMs: number;
  cached?: boolean;
  error?: string;
}

export async function audit(env: Env, input: AuditInput): Promise<void> {
  const now = Date.now();
  const id = nanoid(12);
  await insertAuditEvent(env.DB, {
    id,
    created_at: now,
    user_id: input.userId,
    api_key_id: input.apiKeyId,
    endpoint: input.endpoint,
    model: input.model,
    task: input.task,
    status: input.status,
    tokens_in: input.tokensIn,
    tokens_out: input.tokensOut,
    neurons: input.neurons,
    duration_ms: input.durationMs,
    cached: input.cached,
    error: input.error,
  });
  // Liveness bookkeeping must never turn a served request — or an already-failing
  // one being audited from a catch block — into an unhandled exception.
  try {
    await recordModelHealth(env, input);
  } catch (e) {
    console.error('[health] recordModelHealth failed:', e);
  }
  env.METRICS?.writeDataPoint({
    blobs: [
      input.endpoint,
      input.model ?? '',
      input.task ?? '',
      input.userId ?? '',
      input.cached ? '1' : '0',
    ],
    doubles: [
      input.status,
      input.tokensIn ?? 0,
      input.tokensOut ?? 0,
      input.neurons ?? 0,
      input.durationMs,
    ],
    indexes: [input.userId ?? 'anon'],
  });
}
