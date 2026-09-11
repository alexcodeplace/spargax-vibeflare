import type { Env } from '../env';
import { getSetting, setSetting } from '../db/queries';

const CLIENT_ID_KEY = 'github.oauth_client_id';
const CLIENT_SECRET_KEY = 'github.oauth_client_secret';
const APP_SLUG_KEY = 'github.app_slug';

export interface GithubWebConfig {
  clientId: string;
  clientSecret: string;
  appSlug: string | null;
}

export interface GithubManifestConversion {
  client_id: string;
  client_secret: string;
  slug?: string;
  owner?: {
    login?: string;
    id?: number;
    avatar_url?: string;
  };
}

export async function getGithubWebConfig(env: Env): Promise<GithubWebConfig | null> {
  const [clientId, clientSecret, appSlug] = await Promise.all([
    getSetting(env.DB, CLIENT_ID_KEY),
    getSetting(env.DB, CLIENT_SECRET_KEY),
    getSetting(env.DB, APP_SLUG_KEY),
  ]);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, appSlug };
}

export async function saveGithubWebConfig(
  env: Env,
  config: { clientId: string; clientSecret: string; appSlug?: string | null },
): Promise<void> {
  const now = Date.now();
  await setSetting(env.DB, CLIENT_ID_KEY, config.clientId, now);
  await setSetting(env.DB, CLIENT_SECRET_KEY, config.clientSecret, now);
  if (config.appSlug) {
    await setSetting(env.DB, APP_SLUG_KEY, config.appSlug, now);
  }
}

export function buildGithubAppManifest(origin: string, name: string) {
  return {
    name,
    url: 'https://github.com/alexcodeplace/spargax-vibeflare',
    description: 'GitHub sign-in for this self-hosted VibeFlare deployment.',
    redirect_url: `${origin}/auth/setup/github/manifest/callback`,
    callback_urls: [`${origin}/auth/github/oauth/callback`],
    public: true,
    request_oauth_on_install: false,
    default_permissions: {},
    default_events: [],
  };
}

export async function convertGithubAppManifest(code: string): Promise<GithubManifestConversion> {
  const res = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'vibeflare',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub app manifest conversion failed (${res.status})`);
  }
  return res.json<GithubManifestConversion>();
}

export async function exchangeGithubOAuthCode(
  config: GithubWebConfig,
  code: string,
  redirectUri: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'vibeflare',
    },
    body,
  });
  const data = await res.json<{ access_token?: string; error?: string; error_description?: string }>();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? `GitHub OAuth exchange failed (${res.status})`);
  }
  return data.access_token;
}

export const GITHUB_PRIVATE_SETTING_KEYS = [
  'github.oauth_client_secret',
  'github.oauth_client_id',
  'github.app_slug',
] as const;
