import { historyTarget, storeHistoryFile, saveHistoryTurn, discardHistoryFiles, type StoredHistoryFile } from './history';
import type { Context } from 'hono';
import type { Env, Variables } from '../env';
import { getModel } from '../db/queries';
import { peekQuota, chargeQuota } from '../quota/client';
import { audit } from '../audit/log';
import { actualNeuronsFromOutput, estimateNeurons } from '../ai/neurons';
import { embedToWai, embedToOpenAI } from './translator';
import { runner } from '../ai/dispatch';
import { classifyUpstreamError } from '../ai/errors';

type C = Context<{ Bindings: Env; Variables: Variables }>;

const CHUNK_SIZE = 100;

export async function handle(c: C): Promise<Response> {
  const start = Date.now();
  const env = c.env;
  const userId = c.var.userId;
  const apiKeyId = c.var.apiKey?.id ?? null;

  let body: { model: string; input: string | string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { type: 'invalid_request', message: 'invalid JSON' } }, 400);
  }

  if (!body || typeof body.model !== 'string' || !(typeof body.input === 'string' ? body.input.trim() : Array.isArray(body.input) && body.input.length > 0 && body.input.every(text => typeof text === 'string' && text.trim()))) {
    return c.json({ error: { type: 'invalid_request', message: 'model and input required' } }, 400);
  }

  const modelRow = await getModel(env.DB, body.model);
  if (!modelRow || modelRow.enabled === 0) {
    return c.json({ error: { type: 'not_found', message: `model '${body.model}' not found` } }, 404);
  }

  const chatId = await historyTarget(c);
  if (chatId instanceof Response) return chatId;

  const quota = await peekQuota(env);
  if (quota.used >= quota.limit) {
    return c.json({ error: { type: 'quota_exceeded', message: 'daily quota exceeded' } }, 429);
  }

  const inputs = Array.isArray(body.input) ? body.input : [body.input];

  // Chunk large batches
  const chunks: string[][] = [];
  for (let i = 0; i < inputs.length; i += CHUNK_SIZE) {
    chunks.push(inputs.slice(i, i + CHUNK_SIZE));
  }

  const allData: { object: string; index: number; embedding: number[] }[] = [];
  let totalTokens = 0;
  let measuredNeurons = 0;
  let hasMeasuredNeurons = true;

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]!;
    const waiInput = embedToWai({ model: body.model, input: chunk });
    let out: Record<string, unknown>;
    try {
      out = await runner(env, body.model, waiInput) as Record<string, unknown>;
    } catch (e: unknown) {
      const failure = classifyUpstreamError(e);
      await audit(env, {
        userId, apiKeyId,
        endpoint: '/v1/embeddings',
        model: body.model, task: modelRow.task,
        status: failure.status, durationMs: Date.now() - start, error: failure.message,
      });
      return c.json({ error: { type: failure.type, message: failure.message } }, failure.status);
    }
    const measured = actualNeuronsFromOutput(out);
    if (measured == null) hasMeasuredNeurons = false;
    else measuredNeurons += measured;
    const partial = embedToOpenAI(out, body.model, ci * CHUNK_SIZE) as {
      data: { object: string; index: number; embedding: number[] }[];
    };
    if (partial.data.length !== chunk.length || !partial.data.every(row => Array.isArray(row.embedding) && row.embedding.length > 0 && row.embedding.every(Number.isFinite))) {
      return c.json({ error: { type: 'server_error', message: 'The model returned invalid embeddings.' } }, 502);
    }
    allData.push(...partial.data);
    totalTokens += chunk.reduce((s, t) => s + Math.ceil(t.length / 4), 0);
  }

  const neurons = hasMeasuredNeurons ? measuredNeurons : estimateNeurons(modelRow, totalTokens, 0);
  await chargeQuota(env, neurons);
  await audit(env, {
    userId, apiKeyId,
    endpoint: '/v1/embeddings',
    model: body.model, task: modelRow.task,
    status: 200,
    tokensIn: totalTokens, tokensOut: 0, neurons,
    durationMs: Date.now() - start,
  });

  const result = {
    object: 'list',
    model: body.model,
    data: allData,
    usage: { prompt_tokens: totalTokens, total_tokens: totalTokens },
  };
  if (chatId) {
    const saved = await storeHistoryFile(env, userId, 'embeddings', 'embeddings.json', 'application/json', new TextEncoder().encode(JSON.stringify(result)).buffer);
    try {
      await saveHistoryTurn(env, userId, chatId, { model: body.model, userText: inputs.join('\n'), assistantText: `${allData.length} embedding${allData.length === 1 ? '' : 's'} · ${allData[0]?.embedding.length ?? 0} dimensions`, metadata: { version: 1, task: 'text-embeddings', files: [saved.file], count: allData.length, dimensions: allData[0]?.embedding.length ?? 0 }, tokensIn: totalTokens, tokensOut: 0, neurons });
    } catch (error) {
      await discardHistoryFiles(env, userId, [saved]);
      throw error;
    }
  }
  return c.json(result);
}
