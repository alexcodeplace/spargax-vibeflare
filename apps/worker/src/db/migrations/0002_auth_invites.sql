CREATE TABLE auth_invites (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  prefix       TEXT NOT NULL,
  label        TEXT,
  created_by   TEXT NOT NULL REFERENCES auth_users(id),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  used_at      INTEGER,
  used_by      TEXT REFERENCES auth_users(id),
  revoked_at   INTEGER
);
CREATE INDEX idx_invites_token_hash ON auth_invites(token_hash);
CREATE INDEX idx_invites_created_by ON auth_invites(created_by);
