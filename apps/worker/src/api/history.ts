import type { Context } from 'hono';
import type { Env, Variables } from '../env';
import type { HistoryFile, HistoryMetadata } from '@vibeflare/shared';
import { newId } from '../util/id';
import { putFile } from '../files/r2';

type C = Context<{ Bindings: Env; Variables: Variables }>;

/** Validate before inference: a caller must never append to another user's chat.
 * Media history is opt-in via chat_id, preserving ordinary API response shapes.
 */
export async function historyTarget(c: C): Promise<string | Response | null> {
  const id = c.req.query('chat_id');
  if (id === undefined) return null;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return c.json({ error: { type: 'invalid_request', message: 'Invalid chat_id' } }, 400);
  const chat = await c.env.DB.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').bind(id, c.var.userId).first();
  if (!chat) return c.json({ error: { type: 'not_found', message: 'Chat not found' } }, 404);
  return id;
}

export interface StoredHistoryFile { file: HistoryFile; key: string }

export async function storeHistoryFile(env: Env, userId: string, kind: HistoryFile['kind'], filename: string, mime: string, bytes: ArrayBuffer): Promise<StoredHistoryFile> {
  const name = filename.replace(/[\x00-\x1f\x7f"\\/]/g, '_').slice(0, 160) || 'result';
  const file = { id: newId(), name, kind, mime };
  const { key } = await putFile(env.R2, userId, name, mime, bytes);
  try {
    await env.DB.prepare('INSERT INTO files (id, user_id, r2_key, filename, mime, size, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(file.id, userId, key, name, mime, bytes.byteLength, 'chat-history', Date.now(), Date.now() + 14 * 86400_000).run();
  } catch (error) {
    await env.R2.delete(key);
    throw error;
  }
  return { file, key };
}

/** Compensate files from a failed request; never touch unrelated user uploads. */
export async function discardHistoryFiles(env: Env, userId: string, files: StoredHistoryFile[]): Promise<void> {
  for (const { file, key } of files) {
    try {
      await env.R2.delete(key);
      await env.DB.prepare('DELETE FROM files WHERE id = ? AND user_id = ? AND purpose = ?').bind(file.id, userId, 'chat-history').run();
    } catch (error) { console.error('Failed to remove an uncommitted history attachment', error); }
  }
}

/** Commit both messages and the history ordering timestamp atomically. The
 * ownership check is repeated inside the batch so deletion during generation
 * cannot recreate a deleted conversation or leave half of a result behind.
 */
export async function saveHistoryTurn(env: Env, userId: string, chatId: string, input: { model: string; userText: string; assistantText: string; metadata: HistoryMetadata; userMetadata?: HistoryMetadata; tokensIn?: number; tokensOut?: number; neurons: number }): Promise<void> {
  const now = Date.now();
  const insert = (role: string, text: string, metadata: HistoryMetadata | undefined, tokensIn: number | null, tokensOut: number | null, neurons: number | null, time: number) => env.DB.prepare(
    `INSERT INTO chat_messages (id, chat_id, role, content, attachments, tokens_in, tokens_out, neurons, created_at)
     SELECT ?, id, ?, ?, ?, ?, ?, ?, ? FROM chats WHERE id = ? AND user_id = ?`
  ).bind(newId(), role, text, metadata ? JSON.stringify(metadata) : null, tokensIn, tokensOut, neurons, time, chatId, userId);
  const results = await env.DB.batch([
    env.DB.prepare('UPDATE chats SET updated_at = ?, model = ? WHERE id = ? AND user_id = ?').bind(now, input.model, chatId, userId),
    insert('user', input.userText, input.userMetadata, input.tokensIn ?? null, null, null, now),
    insert('assistant', input.assistantText, input.metadata, null, input.tokensOut ?? null, input.neurons, now + 1),
  ]);
  if (results.some(result => result.meta.changes !== 1)) throw new Error('The conversation was deleted before its result could be saved.');
}
