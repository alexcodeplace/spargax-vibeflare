import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { requireOwner } from '../auth/middleware';
import { createInvite, revokeInviteById } from '../auth/invites';
import { listInvites, getInviteById } from '../db/queries';

const adminInvites = new Hono<{ Bindings: Env; Variables: Variables }>();

adminInvites.use('*', (c, next) => requireOwner(c, next));

const ALLOWED_EXPIRY_SEC = new Set([3600, 86400, 604800, 2592000]); // 1h/24h/7d/30d
const DEFAULT_EXPIRY_SEC = 604800;

// ── POST /admin/invites ───────────────────────────────────────────────────────

adminInvites.post('/', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: { type: 'auth', message: 'authentication required' } }, 401);
  const body: { label?: string; expires_in_sec?: number } = await c.req
    .json<{ label?: string; expires_in_sec?: number }>()
    .catch(() => ({}));
  const expiresInSec =
    body.expires_in_sec && ALLOWED_EXPIRY_SEC.has(body.expires_in_sec)
      ? body.expires_in_sec
      : DEFAULT_EXPIRY_SEC;
  const label = body.label?.slice(0, 64) ?? null;
  const inv = await createInvite(c.env, { createdBy: userId, label, expiresInSec });
  return c.json(inv, 201);
});

// ── GET /admin/invites ────────────────────────────────────────────────────────

adminInvites.get('/', async (c) => {
  const invites = await listInvites(c.env.DB);
  // Never return token_hash to UI
  const safe = invites.map(({ token_hash: _th, ...rest }) => rest);
  return c.json({ invites: safe });
});

// ── DELETE /admin/invites/:id ─────────────────────────────────────────────────

adminInvites.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const inv = await getInviteById(c.env.DB, id);
  if (!inv) return c.json({ error: { type: 'not_found', message: 'invite not found' } }, 404);
  await revokeInviteById(c.env.DB, id);
  return c.json({ ok: true });
});

export default adminInvites;
