import type { Env } from '../env';

export async function pruneExpired(env: Env): Promise<{ files: number; chats: number; cache: number; devices: number }> {
  const now = Date.now();

  // Retain attachments referenced by active history. Unreferenced files and
  // inactive conversations keep the existing 14-day retention policy.
  const expired = await env.DB.prepare(
    `SELECT f.id, f.r2_key FROM files f WHERE f.expires_at < ? AND NOT EXISTS (
       SELECT 1 FROM chat_messages cm JOIN chats c ON c.id = cm.chat_id,
       json_each(CASE WHEN json_valid(cm.attachments) THEN cm.attachments ELSE '{}' END, '$.files') attachment
       WHERE f.purpose = 'chat-history' AND c.user_id = f.user_id AND c.updated_at >= ?
         AND json_extract(CASE WHEN attachment.type = 'object' THEN attachment.value ELSE '{}' END, '$.id') = f.id
     )`
  ).bind(now, now - 14 * 86400_000).all<{ id: string; r2_key: string }>();
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
