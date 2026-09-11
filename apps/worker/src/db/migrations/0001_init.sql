CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  email TEXT,
  github_login TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','user')),
  created_at INTEGER NOT NULL
);

CREATE TABLE auth_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_label TEXT,
  transports TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

CREATE TABLE models (
  name TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  description TEXT,
  properties TEXT,
  neurons_input REAL,
  neurons_output REAL,
  neurons_flat REAL,
  beta INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  synced_at INTEGER NOT NULL
);
CREATE INDEX idx_models_task ON models(task);

CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  title TEXT,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_chats_user ON chats(user_id, updated_at DESC);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content TEXT NOT NULL,
  attachments TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  neurons INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_chat_messages_chat ON chat_messages(chat_id, created_at);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_files_expiry ON files(expires_at);

CREATE TABLE prompt_cache (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE response_cache (
  hash TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  response BLOB NOT NULL,
  is_binary INTEGER NOT NULL DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_response_cache_expiry ON response_cache(expires_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  api_key_id TEXT,
  endpoint TEXT NOT NULL,
  model TEXT,
  task TEXT,
  status INTEGER NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  neurons INTEGER,
  duration_ms INTEGER,
  cached INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_user_time ON audit_events(user_id, created_at DESC);
CREATE INDEX idx_audit_time ON audit_events(created_at DESC);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
