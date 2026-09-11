import type { Env } from '../env';

export type BrowserAuthMode = 'standalone' | 'cf_access';

/**
 * Browser authentication is deliberately single-owner: either VibeFlare sessions
 * (passkey/GitHub) or Cloudflare Access. Mixing both creates redirect loops and
 * ambiguous identity ownership. AUTH_MODE is authoritative when set; the fallback
 * preserves older deployments that already configured both Access secrets.
 */
export function getBrowserAuthMode(env: Env): BrowserAuthMode {
  if (env.AUTH_MODE === 'standalone' || env.AUTH_MODE === 'cf_access') return env.AUTH_MODE;
  return env.CF_ACCESS_TEAM && env.CF_ACCESS_AUD ? 'cf_access' : 'standalone';
}

export function isStandaloneAuth(env: Env): boolean {
  return getBrowserAuthMode(env) === 'standalone';
}
