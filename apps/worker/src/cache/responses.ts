import type { Env } from '../env';
import { sha256 } from '../util/hash';

export interface CachedEntry {
  response: string;
  isBinary: boolean;
}

function normalizeBody(body: Record<string, unknown>): string {
  const { model, messages, temperature, top_p, max_tokens } = body as {
    model?: string;
    messages?: unknown;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
  return JSON.stringify({ model, messages, temperature, top_p, max_tokens });
}

export async function lookup(
  env: Env,
  model: string,
  body: Record<string, unknown>
): Promise<CachedEntry | null> {
  const raw = normalizeBody({ ...body, model });
  const hash = await sha256(raw);
  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT response, is_binary FROM response_cache WHERE hash = ? AND expires_at > ?'
  )
    .bind(hash, now)
    .first<{ response: string; is_binary: number }>();
  if (!row) return null;
  // increment hit_count
  await env.DB.prepare('UPDATE response_cache SET hit_count = hit_count + 1 WHERE hash = ?')
    .bind(hash)
    .run();
  return { response: row.response, isBinary: row.is_binary === 1 };
}

export async function store(
  env: Env,
  model: string,
  body: Record<string, unknown>,
  response: string,
  isBinary = false,
  ttlDays = 7
): Promise<void> {
  const raw = normalizeBody({ ...body, model });
  const hash = await sha256(raw);
  const now = Date.now();
  const expiresAt = now + ttlDays * 24 * 60 * 60 * 1000;
  await env.DB.prepare(
    `INSERT INTO response_cache (hash, model, response, is_binary, hit_count, created_at, expires_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(hash) DO UPDATE SET response = excluded.response, expires_at = excluded.expires_at`
  )
    .bind(hash, model, response, isBinary ? 1 : 0, now, expiresAt)
    .run();
}
