export type AuthMethod = 'cf_access' | 'passkey' | 'github_oauth';

export interface User {
  id: string;
  email: string | null;
  github_login: string | null;
  access_sub: string | null;
  role: 'owner' | 'user';
  created_at: number;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  prefix: string;
  label: string;
  is_admin: number;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

export interface Credential {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: ArrayBuffer;
  counter: number;
  device_label: string | null;
  transports: string | null;
  created_at: number;
  last_used_at: number | null;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string | null;
  model: string;
  created_at: number;
  updated_at: number;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  attachments: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  neurons: number | null;
  created_at: number;
}

export interface ModelInfo {
  name: string;
  task: string;
  description: string | null;
  properties: string | null;
  neurons_input: number | null;
  neurons_output: number | null;
  neurons_flat: number | null;
  beta: number;
  enabled: number;
  synced_at: number;
  probed_at: number | null;
  probe_error: string | null;
  fail_streak: number;
}

export interface FileRecord {
  id: string;
  user_id: string;
  r2_key: string;
  filename: string;
  mime: string;
  size: number;
  purpose: string;
  created_at: number;
  expires_at: number;
}

export interface AuditEvent {
  id: string;
  user_id: string | null;
  api_key_id: string | null;
  endpoint: string;
  model: string | null;
  task: string | null;
  status: number;
  tokens_in: number | null;
  tokens_out: number | null;
  neurons: number | null;
  duration_ms: number | null;
  cached: number;
  error: string | null;
  created_at: number;
}

export interface QuotaSnapshot {
  userId: string;
  date: string;
  neurons_used: number;
  neurons_limit: number;
}

export interface Invite {
  id: string;
  token_hash: string;
  prefix: string;
  label: string | null;
  created_by: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  used_by: string | null;
  revoked_at: number | null;
}
