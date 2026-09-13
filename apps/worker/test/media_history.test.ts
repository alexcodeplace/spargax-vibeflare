import { beforeEach, describe, expect, it } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import worker from '../src/index';
import type { Env } from '../src/env';
import { insertUser, upsertModel } from '../src/db/queries';
import { pruneExpired } from '../src/crons/prune';
import { parseHistoryMetadata } from '@vibeflare/shared';

const image = '@cf/test/history-image', embeddings = '@cf/test/history-embedding', audio = '@cf/test/history-audio';
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII='), c => c.charCodeAt(0));
let calls: string[];
let headers: Record<string, string>;
let otherHeaders: Record<string, string>;
let infer: (model: string, input: Record<string, unknown>) => unknown | Promise<unknown>;
let local: Env;

beforeEach(async () => {
  for (const table of ['chat_messages', 'chats', 'files', 'models', 'audit_events', 'settings', 'auth_users']) await env.DB.prepare(`DELETE FROM ${table}`).run();
  for (const role of ['owner', 'user'] as const) await insertUser(env.DB, { id: `media-${role}`, email: null, github_login: null, role, created_at: 1 });
  for (const [name, task] of [[image, 'text-to-image'], [embeddings, 'text-embeddings'], [audio, 'automatic-speech-recognition']]) {
    await upsertModel(env.DB, { name: name!, task: task!, description: null, properties: '{"paid_required":false}', neurons_input: 0, neurons_output: 0, neurons_flat: 0, beta: 0, enabled: 1, synced_at: Date.now() });
  }
  const auth = async (role: 'owner' | 'user') => ({ 'x-vf-browser': '1', Cookie: `vf_sess=${await sign({ sub: `media-${role}`, role, exp: Math.floor(Date.now() / 1000) + 3600 }, 'test-secret-for-vitest')}` });
  headers = await auth('owner'); otherHeaders = await auth('user'); calls = [];
  infer = async (name, input) => name === image ? png.buffer : name === audio ? { text: 'A saved audio transcript.' } : { data: (input.text as string[]).map(() => [0.1, 0.2, 0.3]) };
  local = new Proxy(env as Env, { get(target, prop, receiver) {
    if (prop === 'AI') return { run: (name: string, input: Record<string, unknown>) => { calls.push(name); return infer(name, input); } };
    return Reflect.get(target, prop, receiver);
  } });
  await env.QUOTA.get(env.QUOTA.idFromName('global')).fetch('https://q/reset', { method: 'POST' });
});

async function request(path: string, body?: unknown, auth = headers, method?: string) {
  const ctx = createExecutionContext();
  const form = body instanceof FormData;
  const response = await worker.fetch(new Request(`http://example.test${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { ...auth, ...(!form && body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : form ? body as FormData : JSON.stringify(body),
  }), local, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
async function chat(model: string, title = 'Saved media conversation') {
  const response = await request('/admin/chats', { model, title });
  expect(response.status).toBe(201);
  return (await response.json<{ chat: { id: string } }>()).chat.id;
}
async function detail(id: string) {
  const response = await request(`/admin/chats/${id}/messages`);
  expect(response.status).toBe(200);
  return response.json<{ chat: { task: string }; messages: Array<{ role: string; content: string; attachments: string | null }> }>();
}
function audioForm() { const form = new FormData(); form.append('model', audio); form.append('file', new File([new Uint8Array([82, 73, 70, 70])], 'meeting.wav', { type: 'audio/wav' })); return form; }
async function count(table: 'files' | 'chats' | 'chat_messages') { return (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n; }

describe('durable browser media history', () => {
  it('persists small inline image outputs as owned attachments and reopens them without inference', async () => {
    const id = await chat(image, 'A tiny sunset');
    const response = await request(`/v1/images/generations?chat_id=${id}`, { model: image, prompt: 'A tiny sunset', n: 2 });
    expect(response.status).toBe(200);
    const data = await response.json<{ data: { url: string }[] }>(); expect(data.data).toHaveLength(2);
    const history = await detail(id); expect(history.chat.task).toBe('text-to-image');
    expect(history.messages.map(m => m.role)).toEqual(['user', 'assistant']); expect(history.messages[0]?.content).toBe('A tiny sunset');
    const metadata = parseHistoryMetadata(history.messages[1]?.attachments)!; expect(metadata.files).toHaveLength(2);
    for (const file of metadata.files) {
      const result = await request(`/admin/files/${file.id}/thumbnail`); expect(result.status).toBe(200);
      expect(new Uint8Array(await result.arrayBuffer())).toEqual(png);
      expect(result.headers.get('cache-control')).toBe('private, no-store');
      expect((await request(`/admin/files/${file.id}/thumbnail`, undefined, otherHeaders)).status).toBe(404);
      const row = await env.DB.prepare('SELECT r2_key FROM files WHERE id = ?').bind(file.id).first<{ r2_key: string }>();
      expect((await request(`/files/${encodeURIComponent(row!.r2_key)}`, undefined, otherHeaders)).status).toBe(404);
      expect((await request(`/files/${encodeURIComponent(row!.r2_key)}`)).status).toBe(200);
    }
    expect((await request(`/admin/chats/${id}/messages`, undefined, otherHeaders)).status).toBe(404);
    expect((await (await request('/admin/chats', undefined, otherHeaders)).json<{ chats: unknown[] }>()).chats).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it('keeps original API behavior without chat_id and honors explicit base64 with history', async () => {
    const unsaved = await request('/v1/images/generations', { model: image, prompt: 'API only' });
    expect((await unsaved.json<{ data: { b64_json: string }[] }>()).data[0]?.b64_json).toBeTruthy();
    expect(await count('chats')).toBe(0); expect(await count('files')).toBe(0);
    const id = await chat(image);
    const saved = await request(`/v1/images/generations?chat_id=${id}`, { model: image, prompt: 'Saved API image', response_format: 'b64_json' });
    expect((await saved.json<{ data: { b64_json: string }[] }>()).data[0]?.b64_json).toBeTruthy();
    expect(parseHistoryMetadata((await detail(id)).messages[1]?.attachments)?.files).toHaveLength(1);
  });

  it('saves complete embedding vectors separately from the compact history summary', async () => {
    const id = await chat(embeddings, 'Two embedded sentences');
    const response = await request(`/v1/embeddings?chat_id=${id}`, { model: embeddings, input: ['First sentence', 'Second sentence'] });
    expect(response.status).toBe(200); const output = await response.json();
    const history = await detail(id); expect(history.messages[0]?.content).toBe('First sentence\nSecond sentence');
    const metadata = parseHistoryMetadata(history.messages[1]?.attachments)!;
    expect(metadata).toMatchObject({ task: 'text-embeddings', count: 2, dimensions: 3 });
    const stored = await request(`/admin/files/${metadata.files[0]!.id}/download`); expect(await stored.json()).toEqual(output);
  });

  it.each(['json', 'text'])('saves the original audio and transcript with %s responses', async format => {
    const id = await chat(audio, 'Meeting transcript');
    const form = audioForm(); form.append('response_format', format);
    const response = await request(`/v1/audio/transcriptions?chat_id=${id}`, form); expect(response.status).toBe(200);
    const history = await detail(id); expect(history.messages[1]?.content).toBe('A saved audio transcript.');
    expect(parseHistoryMetadata(history.messages[1]?.attachments)?.task).toBe('automatic-speech-recognition');
    const files = parseHistoryMetadata(history.messages[0]?.attachments)!.files;
    expect(files[0]?.kind).toBe('audio'); expect((await request(`/admin/files/${files[0]!.id}/download`)).status).toBe(200);
    expect(calls).toEqual([audio]);
  });

  it.each(['image', 'embeddings', 'audio'])('rejects foreign and nonexistent %s chats before inference', async kind => {
    const id = await chat(image);
    for (const target of [id, 'does-not-exist']) {
      const path = kind === 'image' ? '/v1/images/generations' : kind === 'embeddings' ? '/v1/embeddings' : '/v1/audio/transcriptions';
      const body = kind === 'image' ? { model: image, prompt: 'Do not run' } : kind === 'embeddings' ? { model: embeddings, input: 'Do not run' } : audioForm();
      expect((await request(`${path}?chat_id=${target}`, body, otherHeaders)).status).toBe(404);
    }
    expect(calls).toEqual([]); expect(await count('files')).toBe(0); expect(await count('chat_messages')).toBe(0);
  });

  it('does not leave partial image output or orphan files when a multi-image generation fails', async () => {
    const id = await chat(image);
    infer = () => { if (calls.length === 2) throw new Error('provider unavailable'); return png.buffer; };
    expect((await request(`/v1/images/generations?chat_id=${id}`, { model: image, prompt: 'two images', n: 2 })).status).toBe(500);
    expect((await detail(id)).messages).toEqual([]); expect(await count('files')).toBe(0);
  });

  it('does not recreate a conversation deleted while generation was running', async () => {
    const id = await chat(image);
    infer = async () => { await env.DB.prepare('DELETE FROM chats WHERE id = ?').bind(id).run(); return png.buffer; };
    expect((await request(`/v1/images/generations?chat_id=${id}`, { model: image, prompt: 'Deleted while waiting' })).status).toBe(500);
    expect(await count('chats')).toBe(0); expect(await count('chat_messages')).toBe(0); expect(await count('files')).toBe(0);
  });

  it('retains attachments of active conversations, then prunes unreferenced expired files', async () => {
    const id = await chat(image);
    await request(`/v1/images/generations?chat_id=${id}`, { model: image, prompt: 'Keep with active chat' });
    await env.DB.prepare('UPDATE files SET expires_at = 1').run();
    expect((await pruneExpired(local)).files).toBe(0); expect(await count('files')).toBe(1);
    expect((await request(`/admin/chats/${id}`, undefined, headers, 'DELETE')).status).toBe(200);
    expect((await pruneExpired(local)).files).toBe(1); expect(await count('files')).toBe(0);
  });

  it('rejects malformed requests without consuming inference', async () => {
    for (const body of [null, { model: image, prompt: 'x', n: 100 }, { model: image, prompt: {} }]) expect((await request('/v1/images/generations', body)).status).toBe(400);
    for (const body of [null, { model: embeddings, input: [] }, { model: embeddings, input: ['x', 42] }]) expect((await request('/v1/embeddings', body)).status).toBe(400);
    const form = new FormData(); form.append('file', 'not a file'); expect((await request('/v1/audio/transcriptions', form)).status).toBe(400);
    expect(calls).toEqual([]);
  });
  it('rejects live-only Flux file requests before inference or history writes', async () => {
    const form = audioForm(); form.set('model', '@cf/deepgram/flux');
    const response = await request('/v1/audio/transcriptions', form);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { type: 'unsupported_transport', message: expect.stringContaining('Whisper or Nova-3') } });
    expect(calls).toEqual([]); expect(await count('files')).toBe(0); expect(await count('chats')).toBe(0);
  });

  it('round-trips Nova-3 actual request and response shapes into saved history', async () => {
    const name = '@cf/deepgram/nova-3';
    await upsertModel(env.DB, { name, task: 'automatic-speech-recognition', description: null, properties: '{"paid_required":false}', neurons_input: 0, neurons_output: 0, neurons_flat: 0, beta: 0, enabled: 1, synced_at: Date.now() });
    infer = async (model, input) => {
      expect(model).toBe(name);
      const upload = input.audio as { body: ReadableStream; contentType: string };
      expect(upload.contentType).toBe('audio/wav');
      expect(new Uint8Array(await new Response(upload.body).arrayBuffer())).toEqual(new Uint8Array([82, 73, 70, 70]));
      return { results: { channels: [{ alternatives: [{ transcript: 'Nova uploaded-file transcript.' }] }] } };
    };
    const id = await chat(name, 'Nova recording');
    const form = audioForm(); form.set('model', name);
    const response = await request(`/v1/audio/transcriptions?chat_id=${id}`, form);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: 'Nova uploaded-file transcript.' });
    expect((await detail(id)).messages[1]?.content).toBe('Nova uploaded-file transcript.');
  });

});
