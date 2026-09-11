import type { Context, Next } from 'hono';
import type { Env, Variables } from '../env';
import { readSession } from './session';
import { verifyAccessJWT, type JwksVerifier } from './access';
import { getUserById, getUserByAccessSub, insertUser, countUsers } from '../db/queries';
import { getBrowserAuthMode } from './mode';

export async function resolveUser(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  _jwksVerifier?: JwksVerifier,
): Promise<boolean> {
  const accessJwt = c.req.header('cf-access-jwt-assertion');
  if (getBrowserAuthMode(c.env) === 'cf_access' && accessJwt) {
    const claims = await verifyAccessJWT(c.env, accessJwt, _jwksVerifier);
    if (claims) {
      const user =
        (await getUserById(c.env.DB, claims.sub)) ??
        (await getUserByAccessSub(c.env.DB, claims.sub));
      if (user) {
        c.set('userId', user.id);
        c.set('authMethod', 'cf_access');
        return true;
      }
      const count = await countUsers(c.env.DB);
      if (count === 0) {
        // Bootstrap: first-ever user via CF Access → auto-promote to owner
        const now = Date.now();
        await insertUser(c.env.DB, {
          id: claims.sub,
          email: claims.email,
          github_login: null,
          access_sub: claims.sub,
          role: 'owner',
          created_at: now,
        });
        c.set('userId', claims.sub);
        c.set('authMethod', 'cf_access');
        return true;
      }
      // CF Access sub not in DB — fall through to session check
    }
    // Invalid Access JWT — fall through to session check
  }

  const sess = await readSession(c);
  if (sess) {
    c.set('userId', sess.sub);
    c.set('authMethod', 'session');
    return true;
  }

  return false;
}

export async function requireUserAuth(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next,
  _jwksVerifier?: JwksVerifier,
): Promise<Response | void> {
  const authed = await resolveUser(c, _jwksVerifier);
  if (authed) return await next();

  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/admin') || c.req.header('accept')?.includes('application/json')) {
    return c.json({ error: { type: 'auth', message: 'authentication required' } }, 401);
  }
  return c.redirect('/login');
}

export async function requireOwner(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next,
  _jwksVerifier?: JwksVerifier,
): Promise<Response | void> {
  const authed = await resolveUser(c, _jwksVerifier);
  if (!authed) {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/admin') || c.req.header('accept')?.includes('application/json')) {
      return c.json({ error: { type: 'auth', message: 'authentication required' } }, 401);
    }
    return c.redirect('/login');
  }

  const userId = c.get('userId');
  if (!userId) return c.json({ error: { type: 'auth', message: 'authentication required' } }, 401);

  const user = await getUserById(c.env.DB, userId);
  if (!user || user.role !== 'owner') {
    return c.json({ error: { type: 'forbidden', message: 'owner role required' } }, 403);
  }

  return await next();
}
