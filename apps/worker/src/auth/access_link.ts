import type { Context } from 'hono';
import type { Env, Variables } from '../env';
import { verifyAccessJWT, type JwksVerifier } from './access';
import { linkAccessSub } from '../db/queries';
import { getBrowserAuthMode } from './mode';

/**
 * Binds the request's Cloudflare Access identity to `userId`.
 * Call only from a handler that has just authenticated `userId` in this request —
 * both identities are then proven at the moment of the bind.
 */
export async function linkAccessOnLogin(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  userId: string,
  _jwksVerifier?: JwksVerifier,
): Promise<void> {
  if (getBrowserAuthMode(c.env) !== 'cf_access') return;
  const jwt = c.req.header('cf-access-jwt-assertion');
  if (!jwt) return;
  const claims = await verifyAccessJWT(c.env, jwt, _jwksVerifier);
  if (!claims) return;
  await linkAccessSub(c.env.DB, userId, claims.sub);
}
