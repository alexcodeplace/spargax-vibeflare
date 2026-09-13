/** Metadata stored in the existing chat_messages.attachments column.
 * Message text stays readable by older clients; media is an owned file, never
 * an expiring browser blob URL or an inline multi-megabyte image in D1.
 */
export type HistoryTask = 'text-to-image' | 'text-embeddings' | 'automatic-speech-recognition' | 'text-to-speech';
export interface HistoryFile {
  id: string;
  name: string;
  kind: 'image' | 'audio' | 'embeddings';
  mime: string;
}
export interface HistoryMetadata {
  version: 1;
  task: HistoryTask;
  files: HistoryFile[];
  dimensions?: number;
  count?: number;
}

export function parseHistoryMetadata(value: unknown): HistoryMetadata | null {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    if (!data || data.version !== 1 || !['text-to-image', 'text-embeddings', 'automatic-speech-recognition', 'text-to-speech'].includes(data.task) || !Array.isArray(data.files)) return null;
    if (!data.files.every((file: HistoryFile) => file && typeof file.id === 'string' && /^[A-Za-z0-9_-]+$/.test(file.id) && typeof file.name === 'string' && typeof file.mime === 'string' && ['image', 'audio', 'embeddings'].includes(file.kind))) return null;
    if (data.dimensions !== undefined && (!Number.isSafeInteger(data.dimensions) || data.dimensions < 0)) return null;
    if (data.count !== undefined && (!Number.isSafeInteger(data.count) || data.count < 0)) return null;
    return data as HistoryMetadata;
  } catch { return null; }
}
