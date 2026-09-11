/**
 * POST /v1/audio/speech
 *
 * Deviation from strict OpenAI spec: if generated audio exceeds 100KB,
 * we store it in R2 and return JSON {url} instead of binary.
 * OpenAI always returns binary; this deviation is needed due to Cloudflare
 * Workers response size limits and cost of streaming large binary payloads.
 */
import type { Context } from 'hono';
import type { Env, Variables } from '../env';
import { nanoid } from 'nanoid';
import { getModel } from '../db/queries';
import { peekQuota, chargeQuota } from '../quota/client';
import { audit } from '../audit/log';
import { estimateNeurons, estimateTokens } from '../ai/neurons';
import { ttsReqToWai, ttsOutToBinary } from './translator';
import { runner } from '../ai/dispatch';
import { classifyUpstreamError } from '../ai/errors';
import { putFile, publicUrl } from '../files/r2';

type C = Context<{ Bindings: Env; Variables: Variables }>;

const INLINE_SIZE_LIMIT = 100 * 1024; // 100KB

export async function handle(c: C): Promise<Response> {
  const start = Date.now();
  const env = c.env;
  const userId = c.var.userId;
  const apiKeyId = c.var.apiKey?.id ?? null;

  let body: {
    model: string;
    input: string;
    voice?: string;
    response_format?: string;
    speed?: number;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { type: 'invalid_request', message: 'invalid JSON' } }, 400);
  }

  if (!body.model || !body.input) {
    return c.json({ error: { type: 'invalid_request', message: 'model and input required' } }, 400);
  }

  const modelRow = await getModel(env.DB, body.model);
  if (!modelRow || modelRow.enabled === 0) {
    return c.json({ error: { type: 'not_found', message: `model '${body.model}' not found` } }, 404);
  }

  const quota = await peekQuota(env);
  if (quota.used >= quota.limit) {
    return c.json({ error: { type: 'quota_exceeded', message: 'daily quota exceeded' } }, 429);
  }

  const waiInput = ttsReqToWai(body);
  let audioBuf: ArrayBuffer;
  try {
    const out = await runner(env, body.model, waiInput);
    audioBuf = await ttsOutToBinary(out);
  } catch (e: unknown) {
    const failure = classifyUpstreamError(e);
    await audit(env, {
      userId, apiKeyId,
      endpoint: '/v1/audio/speech',
      model: body.model, task: modelRow.task,
      status: failure.status, durationMs: Date.now() - start, error: failure.message,
    });
    return c.json({ error: { type: failure.type, message: failure.message } }, failure.status);
  }

  const responseFormat = body.response_format ?? 'mp3';
  const mime = responseFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';

  const neurons = estimateNeurons(modelRow, estimateTokens(body.input), 0);
  await chargeQuota(env, neurons);
  await audit(env, {
    userId, apiKeyId,
    endpoint: '/v1/audio/speech',
    model: body.model, task: modelRow.task,
    status: 200, neurons,
    durationMs: Date.now() - start,
  });

  if (audioBuf.byteLength > INLINE_SIZE_LIMIT) {
    // Store in R2, return URL
    const filename = `${nanoid(8)}.${responseFormat}`;
    const host = new URL(c.req.url).host;
    const { key } = await putFile(env.R2, userId, filename, mime, audioBuf);
    const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
    await env.DB.prepare(
      'INSERT INTO files (id, user_id, r2_key, filename, mime, size, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(nanoid(12), userId, key, filename, mime, audioBuf.byteLength, 'tts', Date.now(), expiresAt).run();
    return c.json({ url: publicUrl(host, key) });
  }

  return new Response(audioBuf, {
    headers: { 'content-type': mime },
  });
}
