CREATE TABLE IF NOT EXISTS device_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_codes_expiry ON device_codes(expires_at);
