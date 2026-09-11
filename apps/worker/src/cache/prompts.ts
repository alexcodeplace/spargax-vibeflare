import type { Env } from '../env';
import { nanoid } from 'nanoid';

export interface PromptRecord {
  id: string;
  user_id: string;
  label: string;
  content: string;
  created_at: number;
}

export async function createPrompt(
  env: Env,
  userId: string,
  label: string,
  content: string
): Promise<PromptRecord> {
  const id = nanoid(12);
  const created_at = Date.now();
  await env.DB.prepare(
    'INSERT INTO prompt_cache (id, user_id, label, content, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, userId, label, content, created_at)
    .run();
  return { id, user_id: userId, label, content, created_at };
}

export async function getPrompt(
  env: Env,
  userId: string,
  id: string
): Promise<PromptRecord | null> {
  return env.DB.prepare(
    'SELECT * FROM prompt_cache WHERE id = ? AND user_id = ?'
  )
    .bind(id, userId)
    .first<PromptRecord>();
}

export async function listPrompts(
  env: Env,
  userId: string
): Promise<PromptRecord[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM prompt_cache WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(userId)
    .all<PromptRecord>();
  return result.results;
}

export async function deletePrompt(
  env: Env,
  userId: string,
  id: string
): Promise<boolean> {
  const result = await env.DB.prepare(
    'DELETE FROM prompt_cache WHERE id = ? AND user_id = ?'
  )
    .bind(id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Resolve system_id: look up prompt and prepend as system message. */
export async function resolveSystemPrompt(
  env: Env,
  userId: string,
  systemId: string,
  messages: { role: string; content: string }[]
): Promise<{ role: string; content: string }[]> {
  const prompt = await getPrompt(env, userId, systemId);
  if (!prompt) return messages;
  // Prepend system message (replace existing system message if any)
  const without = messages.filter((m) => m.role !== 'system');
  return [{ role: 'system', content: prompt.content }, ...without];
}
