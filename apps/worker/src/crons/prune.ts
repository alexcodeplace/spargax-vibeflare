import type { Env } from '../env';

export async function pruneExpired(env: Env): Promise<{ files: number; chats: number; cache: number; devices: number }> {
  const now = Date.now();

  // Delete expired files: remove R2 object then D1 row
  const expired = await env.DB.prepare(
    'SELECT id, r2_key FROM files WHERE expires_at < ?'
  ).bind(now).all<{ id: string; r2_key: string }>();
  for (const row of expired.results) {
    await env.R2.delete(row.r2_key);
    await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(row.id).run();
  }

  // Delete chats older than 14 days
  const cutoff = now - 14 * 24 * 60 * 60 * 1000;
  const chats = await env.DB.prepare(
    'DELETE FROM chats WHERE updated_at < ?'
  ).bind(cutoff).run();

  // Delete expired response_cache rows
  const cache = await env.DB.prepare(
    'DELETE FROM response_cache WHERE expires_at < ?'
  ).bind(now).run();

  const devices = await env.DB.prepare(
    'DELETE FROM device_codes WHERE expires_at < ?'
  ).bind(Math.floor(Date.now() / 1000)).run();

  return {
    files: expired.results.length,
    chats: chats.meta.changes ?? 0,
    cache: cache.meta.changes ?? 0,
    devices: devices.meta.changes ?? 0,
  };
}
