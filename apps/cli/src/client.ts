import type { Config } from './config.js';

export class ApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export function exitCodeForStatus(status: number): 0 | 1 | 2 | 3 {
  if (status === 401 || status === 403) return 3;
  if (status === 429) return 2;
  return 1;
}

async function req(cfg: Config, method: string, path: string, body?: unknown): Promise<unknown> {
  const url = cfg.base_url.replace(/\/$/, '') + path;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.api_key}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const e = await res.json() as { error?: { message?: string } };
      msg = e.error?.message ?? msg;
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

async function reqBinary(cfg: Config, method: string, path: string, body?: unknown): Promise<ArrayBuffer> {
  const url = cfg.base_url.replace(/\/$/, '') + path;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.api_key}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const e = await res.json() as { error?: { message?: string } };
      msg = e.error?.message ?? msg;
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }
  return res.arrayBuffer();
}

export interface ChatMessage {
  role: string;
  content: string | unknown[];
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  cache?: boolean;
  system_id?: string;
}

export async function chat(cfg: Config, opts: ChatOptions): Promise<unknown> {
  return req(cfg, 'POST', '/v1/chat/completions', { stream: false, ...opts });
}

export async function embed(cfg: Config, model: string, input: string): Promise<unknown> {
  return req(cfg, 'POST', '/v1/embeddings', { model, input });
}

export async function stt(cfg: Config, formData: FormData): Promise<unknown> {
  const url = cfg.base_url.replace(/\/$/, '') + '/v1/audio/transcriptions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.api_key}` },
    body: formData,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json() as { error?: { message?: string } }; msg = e.error?.message ?? msg; } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

export async function tts(cfg: Config, model: string, input: string, voice?: string): Promise<ArrayBuffer> {
  return reqBinary(cfg, 'POST', '/v1/audio/speech', { model, input, voice: voice ?? 'alloy' });
}

/** Download a file URL returned by the gateway; authenticates same-origin URLs. */
export async function download(cfg: Config, url: string): Promise<ArrayBuffer> {
  const sameOrigin = new URL(url).origin === new URL(cfg.base_url).origin;
  const res = await fetch(url, {
    headers: sameOrigin ? { Authorization: `Bearer ${cfg.api_key}` } : {},
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json() as { error?: { message?: string } }; msg = e.error?.message ?? msg; } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }
  return res.arrayBuffer();
}

export async function imgGen(cfg: Config, model: string, prompt: string, n: number, size?: string): Promise<unknown> {
  return req(cfg, 'POST', '/v1/images/generations', { model, prompt, n, size });
}

export async function models(cfg: Config, task?: string): Promise<unknown> {
  const qs = task ? `?task=${encodeURIComponent(task)}` : '';
  return req(cfg, 'GET', `/v1/models${qs}`);
}

export async function usage(cfg: Config): Promise<unknown> {
  return req(cfg, 'GET', '/v1/quota');
}

export const keys = {
  list: (cfg: Config) => req(cfg, 'GET', '/admin/keys'),
  create: (cfg: Config, label: string, isAdmin = false) =>
    req(cfg, 'POST', '/admin/keys', { label, is_admin: isAdmin }),
  revoke: (cfg: Config, id: string) => req(cfg, 'DELETE', `/admin/keys/${id}`),
};

export const cache = {
  list: (cfg: Config) => req(cfg, 'GET', '/admin/cache'),
  clear: (cfg: Config) => req(cfg, 'DELETE', '/admin/cache'),
};
