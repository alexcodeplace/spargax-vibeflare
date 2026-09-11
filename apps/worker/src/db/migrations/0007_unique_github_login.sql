CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_github_login
  ON auth_users(github_login) WHERE github_login IS NOT NULL;
