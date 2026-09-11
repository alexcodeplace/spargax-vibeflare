import { describe, expect, it } from 'vitest';
import {
  chatToWai,
  sttReqToWai,
  ttsOutToBinary,
  ttsReqToWai,
  waiStreamToOpenAISSE,
  waiToChat,
} from '../src/api/translator';

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

describe('Workers AI modality translation', () => {
  it('sends vision image data as the uint8 array expected by Workers AI', async () => {
    const result = await chatToWai({
      model: '@cf/vision',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'describe this' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
        ],
      }],
    }, 'image-to-text');

    expect(result).toEqual({ image: [1, 2, 3], prompt: 'describe this' });
  });

  it('uses reasoning text when a reasoning model returns null content', () => {
    const result = waiToChat({
      choices: [{ message: { content: null, reasoning: 'reasoning-model answer' }, finish_reason: 'stop' }],
    }, '@cf/openai/gpt-oss-20b', 'chatcmpl-test');

    expect(result.choices[0]?.message.content).toBe('reasoning-model answer');
  });

  it('maps streamed reasoning deltas to OpenAI content deltas', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"reasoning":"streamed answer"}}]}\n\n'));
        controller.close();
      },
    });

    const body = await new Response(waiStreamToOpenAISSE(source, '@cf/openai/gpt-oss-20b', 'chatcmpl-stream')).text();
    expect(body).toContain('"content":"streamed answer"');
    expect(body).toContain('data: [DONE]');
  });

  it('uses byte arrays for classic Whisper and base64 for turbo/Deepgram STT', () => {
    expect(sttReqToWai(bytes(1, 2, 3), '@cf/openai/whisper')).toEqual({ audio: [1, 2, 3] });
    expect(sttReqToWai(bytes(1, 2, 3), '@cf/openai/whisper-large-v3-turbo')).toEqual({ audio: 'AQID' });
    expect(sttReqToWai(bytes(1, 2, 3), '@cf/deepgram/nova-3')).toEqual({ audio: 'AQID' });
  });

  it('uses Deepgram text input while retaining prompt input for other TTS models', () => {
    expect(ttsReqToWai({ model: '@cf/deepgram/aura-2-en', input: 'hello', voice: 'luna' }))
      .toEqual({ text: 'hello', voice: 'luna' });
    expect(ttsReqToWai({ model: '@cf/myshell-ai/melotts', input: 'hello', speed: 1.1 }))
      .toEqual({ prompt: 'hello', speed: 1.1 });
  });

  it('decodes nested base64 TTS output', async () => {
    expect([...new Uint8Array(await ttsOutToBinary({ audio: 'AQID' }))]).toEqual([1, 2, 3]);
  });

  it('accepts raw streamed TTS output', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });
    expect([...new Uint8Array(await ttsOutToBinary(stream))]).toEqual([4, 5, 6]);
  });
});
