import { describe, expect, it } from 'vitest';
import { sttReqToWai, sttOutToOpenAI, normalizeTranscription } from '../src/api/translator';
import { classifyUpstreamError } from '../src/ai/errors';
import { supportsAudioFile, audioFileProblem, audioContentType, MAX_AUDIO_BYTES } from '@vibeflare/shared';

const bytes = Uint8Array.from([82, 73, 70, 70, 0, 1, 2, 255]);

describe('recorded audio provider contracts', () => {
  it('does not mistake Deepgram Flux live transport for file transcription', () => {
    expect(supportsAudioFile('@cf/deepgram/flux')).toBe(false);
    expect(supportsAudioFile('@cf/deepgram/nova-3')).toBe(true);
    expect(supportsAudioFile('@cf/black-forest-labs/flux-1-schnell')).toBe(true);
    expect(() => sttReqToWai(bytes.buffer, '@cf/deepgram/flux')).toThrow('live audio streaming');
    const error = classifyUpstreamError(new Error('8006: @cf/deepgram/flux only supports websocket connections'));
    expect(error).toMatchObject({ status: 400, type: 'unsupported_transport' });
    expect(error.message).toContain('Whisper or Nova-3');
  });

  it('keeps ordinary Whisper and Whisper Tiny byte-array inputs', () => {
    for (const model of ['@cf/openai/whisper', '@cf/openai/whisper-tiny-en']) {
      expect(sttReqToWai(bytes.buffer, model)).toEqual({ audio: Array.from(bytes) });
    }
  });

  it('sends Turbo base64 and Nova a binary stream with the original content type', async () => {
    expect(sttReqToWai(bytes.buffer, '@cf/openai/whisper-large-v3-turbo')).toEqual({ audio: btoa(String.fromCharCode(...bytes)), task: 'transcribe' });
    const input = sttReqToWai(bytes.buffer, '@cf/deepgram/nova-3', 'audio/mpeg') as { audio: { body: ReadableStream; contentType: string }; detect_language: boolean };
    expect(input.audio.contentType).toBe('audio/mpeg');
    expect(input.detect_language).toBe(true);
    expect(new Uint8Array(await new Response(input.audio.body).arrayBuffer())).toEqual(bytes);
  });

  it('normalizes Nova channel transcripts and Whisper metadata instead of returning empty text', () => {
    const nova = { results: { channels: [{ alternatives: [{ transcript: 'First speaker.' }] }, { alternatives: [{ transcript: 'Second speaker.' }] }] }, metadata: { duration: 7.5 } };
    expect(sttOutToOpenAI(nova)).toEqual({ text: 'First speaker.\nSecond speaker.' });
    expect(sttOutToOpenAI(nova, 'text')).toBe('First speaker.\nSecond speaker.');
    expect(sttOutToOpenAI({ text: 'Hola.', transcription_info: { language: 'es', duration: 2 }, segments: [] }, 'verbose_json'))
      .toEqual({ task: 'transcribe', text: 'Hola.', language: 'es', duration: 2, segments: [] });
    expect(normalizeTranscription({ text: '' }).text).toBe('');
    expect(() => normalizeTranscription({ results: { channels: [] } })).toThrow('invalid transcript');
    expect(() => normalizeTranscription({ results: { channels: [{ alternatives: [{}] }] } })).toThrow('invalid transcript');
  });

  it('validates files before uploading or allocating model work', () => {
    expect(audioContentType({ name: 'recording.MP3', type: '' })).toBe('audio/mpeg');
    expect(audioContentType({ name: 'voice.webm', type: 'video/webm' })).toBe('audio/webm');
    expect(audioFileProblem({ name: 'recording.mp3', type: '', size: 100 })).toBeNull();
    expect(audioFileProblem({ name: 'recording.mp3', type: 'audio/mpeg', size: 0 })).toContain('empty');
    expect(audioFileProblem({ name: 'recording.wav', type: 'audio/wav', size: MAX_AUDIO_BYTES + 1 })).toContain('25 MB');
    expect(audioFileProblem({ name: 'notes.txt', type: 'text/plain', size: 50 })).toContain('audio file');
  });
});
