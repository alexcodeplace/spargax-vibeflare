import { sign, verify } from 'hono/jwt';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { Env, Variables } from '../env';
import { getSetting } from '../db/queries';

const COOKIE = 'vf_sess';
const TTL_SEC = 7 * 24 * 60 * 60;

const SESSION_SECRET_SETTING = 'system.session_secret';

export async function resolveSessionSecret(env: Env): Promise<string> {
  const configured = env.SESSION_SECRET?.trim();
  if (configured) return configured;

  const existing = await getSetting(env.DB, SESSION_SECRET_SETTING);
  if (existing) return existing;

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const generated = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  await env.DB
    .prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .bind(SESSION_SECRET_SETTING, generated, Date.now())
    .run();
  const stored = await getSetting(env.DB, SESSION_SECRET_SETTING);
  if (!stored) throw new Error('failed to initialize session signing key');
  return stored;
}

export interface Session {
  sub: string;
  role: 'owner' | 'user';
  iat: number;
  exp: number;
}

export async function issueSession(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  userId: string,
  role: 'owner' | 'user',
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
    { sub: userId, role, iat: now, exp: now + TTL_SEC },
    await resolveSessionSecret(c.env),
  );
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: TTL_SEC,
  });
}

export async function readSession(
  c: Context<{ Bindings: Env; Variables: Variables }>,
): Promise<Session | null> {
  const t = getCookie(c, COOKIE);
  if (!t) return null;
  try {
    return (await verify(t, await resolveSessionSecret(c.env), 'HS256')) as unknown as Session;
  } catch {
    return null;
  }
}

export function clearSession(c: Context<{ Bindings: Env; Variables: Variables }>): void {
  deleteCookie(c, COOKIE, { path: '/' });
}
