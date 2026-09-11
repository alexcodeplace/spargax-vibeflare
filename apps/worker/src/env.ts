export interface Variables {
  userId: string;
  authMethod: 'cf_access' | 'session' | 'apikey';
  apiKey: { id: string; user_id: string; is_admin: number };
  accessClaims: { email: string; sub: string };
}

export interface Env {
  AI: Ai;
  DB: D1Database;
  R2: R2Bucket;
  METRICS: AnalyticsEngineDataset;
  QUOTA: DurableObjectNamespace;
  AUTH_RL: DurableObjectNamespace;
  CRON: DurableObjectNamespace;
  ASSETS: Fetcher;
  RP_NAME: string;
  RP_ID?: string;
  RP_ORIGIN?: string;
  AUTH_MODE?: 'standalone' | 'cf_access';
  CF_ACCESS_TEAM?: string;
  CF_ACCESS_AUD?: string;
  GITHUB_CLIENT_ID?: string;
  SESSION_SECRET?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
}
