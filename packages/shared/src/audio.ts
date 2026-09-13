/** Upload transcription is not a streaming voice session.
 * Provider contract: https://developers.cloudflare.com/changelog/post/2025-10-02-deepgram-flux/
 * Keep this restriction separate from billing and the user's selected models.
 */
export const LIVE_AUDIO_MODEL = '@cf/deepgram/flux';
export const LIVE_AUDIO_MESSAGE = 'This model needs live audio streaming. For an uploaded file, choose Whisper or Nova-3.';
export function supportsAudioFile(model: string): boolean {
  return model !== LIVE_AUDIO_MODEL;
}

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const AUDIO_FILE_ACCEPT = '.mp3,.wav,.m4a,.mp4,.ogg,.oga,.webm,.flac,audio/*';
const AUDIO_MIMES: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'audio/mp4',
  ogg: 'audio/ogg', oga: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac',
};
export function audioContentType(file: { name: string; type: string }): string | null {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  if (AUDIO_MIMES[extension]) return AUDIO_MIMES[extension]!;
  return /^audio\/[a-zA-Z0-9.+-]+$/.test(file.type) ? file.type : null;
}
export function audioFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (file.size === 0) return 'This file is empty. Choose an audio recording.';
  if (file.size > MAX_AUDIO_BYTES) return 'Choose an audio file smaller than 25 MB.';
  if (!audioContentType(file)) return 'Choose an audio file, such as MP3, WAV, M4A, OGG, WebM or FLAC.';
  return null;
}
