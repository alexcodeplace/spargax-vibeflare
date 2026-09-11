import type { Env } from '../env';
import type { Invite } from '@vibeflare/shared';
import { newId, nanoid } from '../util/id';
import { sha256 } from '../util/hash';
import { insertInvite, revokeInvite as revokeInviteRow, getInviteByHash } from '../db/queries';
import type { Context } from 'hono';

const INVITE_COOKIE = 'vf_invite';
const INVITE_COOKIE_TTL_SEC = 10 * 60;

export interface CreatedInvite {
  id: string;
  full: string;
  prefix: string;
  label: string | null;
  expires_at: number;
}

export async function createInvite(
  env: Env,
  opts: { createdBy: string; label: string | null; expiresInSec: number },
): Promise<CreatedInvite> {
  const body = nanoid(32);
  const full = `vfi-${body}`;
  const prefix = full.slice(0, 8);
  const token_hash = await sha256(full);
  const id = newId();
  const now = Date.now();
  const expires_at = now + opts.expiresInSec * 1000;
  await insertInvite(env.DB, {
    id,
    token_hash,
    prefix,
    label: opts.label,
    created_by: opts.createdBy,
    created_at: now,
    expires_at,
  });
  return { id, full, prefix, label: opts.label, expires_at };
}

export async function getValidInvite(db: D1Database, fullToken: string): Promise<Invite | null> {
  if (!fullToken.startsWith('vfi-')) return null;
  const hash = await sha256(fullToken);
  const row = await getInviteByHash(db, hash);
  if (!row) return null;
  if (row.used_at || row.revoked_at) return null;
  if (row.expires_at <= Date.now()) return null;
  return row;
}

/**
 * Atomically claims a live invite for an already-created user.
 *
 * The user must exist before this call because auth_invites.used_by has a foreign-key
 * reference. The conditional UPDATE is the race gate: only one concurrent redeemer
 * can observe a returned row. Callers that create a provisional user immediately
 * before this function must delete that provisional user when this returns !ok.
 */
export async function redeemInviteAtomic(
  db: D1Database,
  fullToken: string,
  usedByUserId: string,
): Promise<
  | { ok: true; invite: { id: string } }
  | { ok: false; reason: 'not_found' | 'consumed' | 'expired' | 'revoked' | 'invalid' }
> {
  if (!fullToken.startsWith('vfi-')) return { ok: false, reason: 'invalid' };
  const hash = await sha256(fullToken);
  const now = Date.now();
  const result = await db
    .prepare(
      `UPDATE auth_invites SET used_at = ?1, used_by = ?2
       WHERE token_hash = ?3 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?1
       RETURNING id`,
    )
    .bind(now, usedByUserId, hash)
    .all<{ id: string }>();
  const consumeRow = result.results?.[0];
  if (!consumeRow) {
    const row = await getInviteByHash(db, hash);
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.revoked_at) return { ok: false, reason: 'revoked' };
    if (row.used_at) return { ok: false, reason: 'consumed' };
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, invite: { id: consumeRow.id } };
}

export async function revokeInviteById(db: D1Database, id: string): Promise<void> {
  await revokeInviteRow(db, id, Date.now());
}

export function setInviteCookie(c: Context, token: string): void {
  c.header(
    'Set-Cookie',
    `${INVITE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${INVITE_COOKIE_TTL_SEC}`,
  );
}

export function clearInviteCookie(c: Context): void {
  c.header(
    'Set-Cookie',
    `${INVITE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  );
}

export function readInviteCookie(c: Context): string | null {
  const header = c.req.header('cookie') ?? '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${INVITE_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
