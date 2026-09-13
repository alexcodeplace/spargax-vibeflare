import type { Env } from '../env';
import { getSetting, setSetting } from '../db/queries';

const CLIENT_ID_KEY = 'github.oauth_client_id';
const CLIENT_SECRET_KEY = 'github.oauth_client_secret';
const APP_SLUG_KEY = 'github.app_slug';
const ORIGIN_KEY = 'github.oauth_origin';

function originKey(origin: string, field: 'client_id' | 'client_secret' | 'app_slug'): string {
  return `github.oauth.${encodeURIComponent(origin)}.${field}`;
}

export interface GithubWebConfig {
  clientId: string;
  clientSecret: string;
  appSlug: string | null;
  origin: string;
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

export async function getGithubWebConfig(env: Env, origin: string): Promise<GithubWebConfig | null> {
  const [clientId, clientSecret, appSlug] = await Promise.all([
    getSetting(env.DB, originKey(origin, 'client_id')),
    getSetting(env.DB, originKey(origin, 'client_secret')),
    getSetting(env.DB, originKey(origin, 'app_slug')),
  ]);
  if (clientId && clientSecret) return { clientId, clientSecret, appSlug, origin };

  // Legacy v0.9.2 installs stored one global GitHub App. Only reuse it when its
  // registered origin is known to match the current request origin. Never guess:
  // a reused D1 can otherwise pair one Worker's client id with another Worker's
  // callback URL and GitHub correctly rejects the redirect_uri.
  const [legacyClientId, legacyClientSecret, legacyAppSlug, legacyOrigin] = await Promise.all([
    getSetting(env.DB, CLIENT_ID_KEY),
    getSetting(env.DB, CLIENT_SECRET_KEY),
    getSetting(env.DB, APP_SLUG_KEY),
    getSetting(env.DB, ORIGIN_KEY),
  ]);
  if (!legacyClientId || !legacyClientSecret || legacyOrigin !== origin) return null;
  return { clientId: legacyClientId, clientSecret: legacyClientSecret, appSlug: legacyAppSlug, origin };
}

export async function saveGithubWebConfig(
  env: Env,
  config: { clientId: string; clientSecret: string; appSlug?: string | null; origin: string },
): Promise<void> {
  const now = Date.now();
  await setSetting(env.DB, originKey(config.origin, 'client_id'), config.clientId, now);
  await setSetting(env.DB, originKey(config.origin, 'client_secret'), config.clientSecret, now);
  if (config.appSlug) {
    await setSetting(env.DB, originKey(config.origin, 'app_slug'), config.appSlug, now);
  }
}

export async function hasGithubOwner(env: Env): Promise<boolean> {
  const owner = await env.DB.prepare("SELECT github_login FROM auth_users WHERE role = 'owner' ORDER BY created_at LIMIT 1")
    .first<{ github_login: string | null }>();
  return Boolean(owner?.github_login?.trim());
}

export async function githubOwnerMatches(env: Env, login: string): Promise<{ id: string; role: 'owner' } | null> {
  const owner = await env.DB.prepare("SELECT id, github_login FROM auth_users WHERE role = 'owner' ORDER BY created_at LIMIT 1")
    .first<{ id: string; github_login: string | null }>();
  if (!owner?.github_login || owner.github_login.toLowerCase() !== login.trim().toLowerCase()) return null;
  return { id: owner.id, role: 'owner' };
}

export function buildGithubAppManifest(origin: string, name: string) {
  return {
    name,
    url: 'https://github.com/alexcodeplace/vibeflare',
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
  'github.oauth_origin',
] as const;

export function isPrivateGithubSettingKey(key: string): boolean {
  return GITHUB_PRIVATE_SETTING_KEYS.includes(key as (typeof GITHUB_PRIVATE_SETTING_KEYS)[number])
    || key.startsWith('github.oauth.');
}
