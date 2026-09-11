ALTER TABLE auth_users ADD COLUMN access_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_access_sub
  ON auth_users(access_sub) WHERE access_sub IS NOT NULL;
