// Workers AI task input/output shapes

export interface TextGenerationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TextGenerationInput {
  prompt?: string;
  messages?: TextGenerationMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  seed?: number;
  repetition_penalty?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  raw?: boolean;
  lora?: string;
}

export interface TextGenerationOutput {
  response: string;
  tool_calls?: Array<{ name: string; arguments: unknown }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface TextEmbeddingsInput {
  text: string | string[];
}

export interface TextEmbeddingsOutput {
  shape: number[];
  data: number[][];
}

export interface TextToImageInput {
  prompt: string;
  negative_prompt?: string;
  height?: number;
  width?: number;
  num_steps?: number;
  guidance?: number;
  seed?: number;
  image?: number[];
  mask?: number[];
  strength?: number;
}

// Output is raw image bytes (ArrayBuffer / ReadableStream)
export type TextToImageOutput = ReadableStream | ArrayBuffer;

export interface AutomaticSpeechRecognitionInput {
  audio: number[];
  language?: string;
  task?: 'transcribe' | 'translate';
  vad_filter?: boolean;
  initial_prompt?: string;
}

export interface AutomaticSpeechRecognitionOutput {
  text: string;
  word_count?: number;
  words?: Array<{ word: string; start: number; end: number }>;
  vtt?: string;
}

export interface TextToSpeechInput {
  prompt: string;
}

// Output is raw audio bytes
export type TextToSpeechOutput = ReadableStream | ArrayBuffer;

export interface ImageToTextInput {
  image: number[];
  prompt?: string;
  max_tokens?: number;
}

export interface ImageToTextOutput {
  description: string;
}
