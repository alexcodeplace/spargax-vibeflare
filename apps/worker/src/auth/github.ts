import type { Env } from '../env';
import { getSetting } from '../db/queries';
import { nanoid } from '../util/id';

// ── Device Flow ───────────────────────────────────────────────────────────────

export interface DeviceStartResult {
  device_id: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export type PollResult =
  | { status: 'pending' }
  | { status: 'slow_down'; interval: number }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'ok'; accessToken: string };

export async function startDeviceAuth(env: Env): Promise<DeviceStartResult> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      scope: 'read:user user:email',
    }),
  });

  const data = await res.json<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  }>();

  const device_id = nanoid(21);
  const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in ?? 900);
  await env.DB.prepare('INSERT INTO device_codes (id, code, expires_at) VALUES (?, ?, ?)')
    .bind(device_id, data.device_code, expiresAt)
    .run();

  return {
    device_id,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    expires_in: data.expires_in,
    interval: data.interval,
  };
}

export async function pollDeviceAuth(env: Env, device_id: string): Promise<PollResult> {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT code FROM device_codes WHERE id = ? AND expires_at > ?')
    .bind(device_id, now)
    .first<{ code: string }>();
  if (!row) {
    await env.DB.prepare('DELETE FROM device_codes WHERE id = ? AND expires_at <= ?')
      .bind(device_id, now)
      .run();
    return { status: 'expired' };
  }
  const device_code = row.code;

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = await res.json<{
    access_token?: string;
    error?: string;
    interval?: number;
  }>();

  if (data.access_token) {
    await env.DB.prepare('DELETE FROM device_codes WHERE id = ?').bind(device_id).run();
    return { status: 'ok', accessToken: data.access_token };
  }
  if (data.error === 'authorization_pending') return { status: 'pending' };
  if (data.error === 'slow_down') return { status: 'slow_down', interval: data.interval ?? 10 };
  if (data.error === 'expired_token') {
    await env.DB.prepare('DELETE FROM device_codes WHERE id = ?').bind(device_id).run();
    return { status: 'expired' };
  }
  await env.DB.prepare('DELETE FROM device_codes WHERE id = ?').bind(device_id).run();
  return { status: 'denied' };
}

// ── User fetch ────────────────────────────────────────────────────────────────

export async function fetchUser(token: string): Promise<{
  login: string;
  email: string | null;
  id: number;
  name: string | null;
  avatar_url: string;
}> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'vibeflare',
    },
  });
  return res.json();
}

// ── Allow-list ────────────────────────────────────────────────────────────────

export async function isAllowed(env: Env, login: string): Promise<boolean> {
  const raw = await getSetting(env.DB, 'github.allowed_logins');
  // No allow-list configured → open access (owner can restrict via settings)
  if (!raw || raw.trim() === '') return true;
  return raw.split(',').map((s) => s.trim()).includes(login);
}
