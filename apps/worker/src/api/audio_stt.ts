import { historyTarget, storeHistoryFile, saveHistoryTurn, discardHistoryFiles, type StoredHistoryFile } from './history';
import type { Context } from 'hono';
import type { Env, Variables } from '../env';
import { getModel } from '../db/queries';
import { peekQuota, chargeQuota } from '../quota/client';
import { audit } from '../audit/log';
import { actualNeuronsFromOutput, estimateNeurons } from '../ai/neurons';
import { sttReqToWai, sttOutToOpenAI } from './translator';
import { runner } from '../ai/dispatch';
import { classifyUpstreamError } from '../ai/errors';

type C = Context<{ Bindings: Env; Variables: Variables }>;

const DEFAULT_MODEL = '@cf/openai/whisper';

export async function handle(c: C): Promise<Response> {
  const start = Date.now();
  const env = c.env;
  const userId = c.var.userId;
  const apiKeyId = c.var.apiKey?.id ?? null;

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { type: 'invalid_request', message: 'multipart body required' } }, 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return c.json({ error: { type: 'invalid_request', message: 'file field required' } }, 400);
  }

  const modelName = (formData.get('model') as string | null) ?? DEFAULT_MODEL;
  const responseFormat = (formData.get('response_format') as string | null) ?? 'json';

  const modelRow = await getModel(env.DB, modelName);
  if (!modelRow || modelRow.enabled === 0) {
    return c.json({ error: { type: 'not_found', message: `model '${modelName}' not found` } }, 404);
  }

  const chatId = await historyTarget(c);
  if (chatId instanceof Response) return chatId;

  const quota = await peekQuota(env);
  if (quota.used >= quota.limit) {
    return c.json({ error: { type: 'quota_exceeded', message: 'daily quota exceeded' } }, 429);
  }

  const audio = await file.arrayBuffer();

  if (audio.byteLength > 25 * 1024 * 1024) {
    return c.json({ error: { type: 'payload_too_large', message: 'audio > 25MB' } }, 413);
  }

  const waiInput = sttReqToWai(audio, modelName);
  let out: Record<string, unknown>;
  try {
    out = await runner(env, modelName, waiInput) as Record<string, unknown>;
  } catch (e: unknown) {
    const failure = classifyUpstreamError(e);
    await audit(env, {
      userId, apiKeyId,
      endpoint: '/v1/audio/transcriptions',
      model: modelName, task: modelRow.task,
      status: failure.status, durationMs: Date.now() - start, error: failure.message,
    });
    return c.json({ error: { type: failure.type, message: failure.message } }, failure.status);
  }

  const neurons = actualNeuronsFromOutput(out)
    ?? estimateNeurons(modelRow, Math.ceil(audio.byteLength / 1000), 0);
  await chargeQuota(env, neurons);
  await audit(env, {
    userId, apiKeyId,
    endpoint: '/v1/audio/transcriptions',
    model: modelName, task: modelRow.task,
    status: 200, neurons,
    durationMs: Date.now() - start,
  });

  if (typeof out.text !== 'string') return c.json({ error: { type: 'server_error', message: 'The model returned an invalid transcript.' } }, 502);
  if (chatId) {
    const saved = await storeHistoryFile(env, userId, 'audio', file.name || 'audio.wav', /^audio\/[a-zA-Z0-9.+-]+$/.test(file.type) ? file.type : 'audio/wav', audio);
    try {
      const metadata = { version: 1 as const, task: 'automatic-speech-recognition' as const, files: [saved.file] };
      await saveHistoryTurn(env, userId, chatId, { model: modelName, userText: `Transcribe ${file.name || 'audio'}`, assistantText: out.text, metadata: { ...metadata, files: [] }, userMetadata: metadata, neurons });
    } catch (error) {
      await discardHistoryFiles(env, userId, [saved]);
      throw error;
    }
  }
  const result = sttOutToOpenAI(out, responseFormat);

  if (responseFormat === 'text') {
    return new Response(result as unknown as string, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return c.json(result);
}
