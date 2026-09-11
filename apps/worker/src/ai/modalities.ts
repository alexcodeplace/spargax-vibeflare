// Maps Workers AI task names to OpenAI API endpoint slugs
export const TASK_TO_OPENAI_ENDPOINT: Record<string, string> = {
  'text-generation': '/v1/chat/completions',
  'text-to-image': '/v1/images/generations',
  'image-to-text': '/v1/chat/completions',
  'speech-recognition': '/v1/audio/transcriptions',
  'text-to-speech': '/v1/audio/speech',
  'text-embeddings': '/v1/embeddings',
  'translation': '/v1/translations',
  'summarization': '/v1/chat/completions',
  'question-answering': '/v1/chat/completions',
};

// Subset of Workers AI task names relevant to this service
export type WaiTask =
  | 'text-generation'
  | 'text-to-image'
  | 'image-to-text'
  | 'speech-recognition'
  | 'text-to-speech'
  | 'text-embeddings'
  | 'translation'
  | 'summarization'
  | 'question-answering';

export interface WaiInput {
  [key: string]: unknown;
}
