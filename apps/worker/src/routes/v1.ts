import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { requireApiKey } from '../auth/apikey';
import { handle as chatHandle } from '../api/chat';
import { handle as embeddingsHandle } from '../api/embeddings';
import { handle as imagesHandle } from '../api/images';
import { handle as sttHandle } from '../api/audio_stt';
import { handle as ttsHandle } from '../api/audio_tts';
import { listHandler as modelsListHandler, getHandler as modelGetHandler } from '../api/models';
import { getFile } from '../files/r2';
import { peekQuota } from '../quota/client';

const v1 = new Hono<{ Bindings: Env; Variables: Variables }>();

// All /v1/* routes require API key
v1.use('*', requireApiKey);

v1.post('/chat/completions', chatHandle);
v1.post('/embeddings', embeddingsHandle);
v1.post('/images/generations', imagesHandle);
v1.post('/audio/transcriptions', sttHandle);
v1.post('/audio/speech', ttsHandle);
v1.get('/models', modelsListHandler);
v1.get('/models/:id{.+}', modelGetHandler);
v1.get('/quota', async (c) => c.json(await peekQuota(c.env)));

v1.get('/files/:id', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  const row = await c.env.DB.prepare(
    'SELECT r2_key, filename, mime FROM files WHERE id = ? AND user_id = ?'
  ).bind(fileId, userId).first<{ r2_key: string; filename: string; mime: string }>();
  if (!row) return c.json({ error: { type: 'not_found', message: 'file not found' } }, 404);
  const obj = await getFile(c.env.R2, row.r2_key);
  if (!obj) return c.json({ error: { type: 'not_found', message: 'file not in storage' } }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': row.mime,
      'Content-Disposition': `inline; filename="${row.filename}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

export default v1;
