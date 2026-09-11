import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import {
  startRegistration,
  finishRegistration,
  startAuthentication,
  finishAuthentication,
} from '../auth/passkey';
import { issueSession, clearSession } from '../auth/session';
import { linkAccessOnLogin } from '../auth/access_link';
import { countUsers, getUserByGithubLogin, getUserById } from '../db/queries';
import { checkAndRecord, checkRateLimit } from '../auth/ratelimit';
import { startDeviceAuth, pollDeviceAuth, fetchUser } from '../auth/github';
import { newId } from '../util/id';
import { getBrowserAuthMode } from '../auth/mode';
import { resolveUser } from '../auth/middleware';

export interface AuthDeps {
  startRegistration: typeof startRegistration;
  finishRegistration: typeof finishRegistration;
  startAuthentication: typeof startAuthentication;
  finishAuthentication: typeof finishAuthentication;
  linkAccessOnLogin: typeof linkAccessOnLogin;
  checkAndRecord: typeof checkAndRecord;
  checkRateLimit: typeof checkRateLimit;
  startDeviceAuth: typeof startDeviceAuth;
  pollDeviceAuth: typeof pollDeviceAuth;
  fetchUser: typeof fetchUser;
}

const defaultDeps: AuthDeps = {
  startRegistration,
  finishRegistration,
  startAuthentication,
  finishAuthentication,
  linkAccessOnLogin,
  checkAndRecord,
  checkRateLimit,
  startDeviceAuth,
  pollDeviceAuth,
  fetchUser,
};

export function createAuthRouter(deps: AuthDeps = defaultDeps) {
const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

function getIp(c: { req: { header: (h: string) => string | undefined } }): string {
  return c.req.header('cf-connecting-ip') ?? '0.0.0.0';
}

// ── Session status (public, never uses 401 as normal control flow) ────────────

auth.get('/session', async (c) => {
  const authed = await resolveUser(c);
  if (!authed) return c.json({ user: null, authMethod: null });
  const userId = c.get('userId');
  const user = userId ? await getUserById(c.env.DB, userId) : null;
  if (!user) return c.json({ user: null, authMethod: null });
  return c.json({
    user: { id: user.id, email: user.email, role: user.role },
    authMethod: c.get('authMethod') ?? null,
  });
});

// ── Setup (first-run owner registration) ─────────────────────────────────────

auth.post('/setup/start', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
  }
  const count = await countUsers(c.env.DB);
  if (count > 0) {
    return c.json({ error: { type: 'forbidden', message: 'setup already complete' } }, 403);
  }
  const userId = newId();
  const options = await deps.startRegistration(c.env, userId, 'owner', c.req.url);
  return c.json({ ...options, userId });
});

auth.post('/setup/finish', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
  }
  const ip = getIp(c);
  const rl = await deps.checkRateLimit(c.env, ip);
  if (rl.locked) {
    return c.json({ error: { type: 'rate_limit', message: 'too many attempts' } }, 429);
  }

  const body = await c.req.json<{ userId: string; label?: string; response: unknown }>();
  const result = await deps.finishRegistration(
    c.env,
    body.userId,
    body.label ?? 'owner',
    body.response as Parameters<typeof finishRegistration>[3],
    'owner',
    undefined,
    c.req.url,
  );

  if (!result.ok) {
    await deps.checkAndRecord(c.env, ip, false);
    return c.json({ error: { type: 'auth', message: result.message } }, result.status as 400 | 409);
  }

  await deps.checkAndRecord(c.env, ip, true);
  await deps.linkAccessOnLogin(c, body.userId);
  await issueSession(c, body.userId, 'owner');
  return c.json({ ok: true });
});

// ── Passkey login ─────────────────────────────────────────────────────────────

auth.post('/passkey/start', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
  }
  const options = await deps.startAuthentication(c.env, c.req.url);
  return c.json(options);
});

auth.post('/passkey/finish', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
  }
  const ip = getIp(c);
  const rl = await deps.checkRateLimit(c.env, ip);
  if (rl.locked) {
    return c.json({ error: { type: 'rate_limit', message: 'too many attempts' } }, 429);
  }

  const body = await c.req.json<{ challengeId: string; response: unknown }>();
  const result = await deps.finishAuthentication(
    c.env,
    body.challengeId,
    body.response as Parameters<typeof finishAuthentication>[2],
    undefined,
    c.req.url,
  );

  if (!result) {
    await deps.checkAndRecord(c.env, ip, false);
    return c.json({ error: { type: 'auth', message: 'authentication failed' } }, 401);
  }

  await deps.checkAndRecord(c.env, ip, true);
  await deps.linkAccessOnLogin(c, result.userId);
  await issueSession(c, result.userId, result.role);
  return c.json({ ok: true });
});

// ── Logout ────────────────────────────────────────────────────────────────────

auth.post('/logout', (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

// ── GitHub Device Flow ────────────────────────────────────────────────────────

auth.post('/github/device/start', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
  }
  if (!c.env.GITHUB_CLIENT_ID) {
    return c.json({ error: { type: 'not_configured', message: 'GitHub not configured' } }, 501);
  }

  // Rate limit by IP: max 10/hour (use AUTH_RL DO with a separate key space)
  const ip = getIp(c);
  const rl = await deps.checkRateLimit(c.env, ip);
  if (rl.locked) {
    return c.json({ error: { type: 'rate_limit', message: 'too many attempts' } }, 429);
  }

  try {
    const result = await deps.startDeviceAuth(c.env);
    await deps.checkAndRecord(c.env, ip, true);
    return c.json(result);
  } catch (e) {
    await deps.checkAndRecord(c.env, ip, false);
    return c.json({ error: { type: 'upstream', message: 'GitHub device flow init failed' } }, 502);
  }
});

auth.post('/github/device/poll', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
  }
  if (!c.env.GITHUB_CLIENT_ID) {
    return c.json({ error: { type: 'not_configured', message: 'GitHub not configured' } }, 501);
  }

  const body = await c.req.json<{ device_id: string }>();
  if (!body.device_id) {
    return c.json({ error: { type: 'bad_request', message: 'device_id required' } }, 400);
  }

  const poll = await deps.pollDeviceAuth(c.env, body.device_id);

  if (poll.status !== 'ok') {
    return c.json(poll);
  }

  // status === 'ok': fetch GitHub user, require existing account (invite-only)
  const ip = getIp(c);
  const ghUser = await deps.fetchUser(poll.accessToken);

  const user = await getUserByGithubLogin(c.env.DB, ghUser.login);
  if (!user) {
    await deps.checkAndRecord(c.env, ip, false);
    return c.json({ error: { type: 'invite_required', message: 'no account for this GitHub login; an invite is required' } }, 403);
  }

  await deps.checkAndRecord(c.env, ip, true);
  await deps.linkAccessOnLogin(c, user.id);
  await issueSession(c, user.id, user.role);
  return c.json({ status: 'ok' });
});

// ── First-owner GitHub completion ─────────────────────────────────────────────

auth.post('/setup/github/poll', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
  }
  if (!c.env.GITHUB_CLIENT_ID) {
    return c.json({ error: { type: 'not_configured', message: 'GitHub not configured' } }, 501);
  }
  const body = await c.req.json<{ device_id: string }>();
  if (!body.device_id) {
    return c.json({ error: { type: 'bad_request', message: 'device_id required' } }, 400);
  }
  const poll = await deps.pollDeviceAuth(c.env, body.device_id);
  if (poll.status !== 'ok') return c.json(poll);

  const ghUser = await deps.fetchUser(poll.accessToken);
  const userId = newId();
  const now = Date.now();
  const inserted = await c.env.DB.prepare(
    `INSERT INTO auth_users (id, email, github_login, role, created_at)
     SELECT ?, ?, ?, 'owner', ?
     WHERE NOT EXISTS (SELECT 1 FROM auth_users)`,
  ).bind(userId, ghUser.email ?? null, ghUser.login, now).run();
  if (inserted.meta.changes === 0) {
    return c.json({ error: { type: 'forbidden', message: 'setup already complete' } }, 403);
  }
  await issueSession(c, userId, 'owner');
  return c.json({ status: 'ok' });
});

// ── GET /auth/methods (public) ────────────────────────────────────────────────

auth.get('/methods', async (c) => {
  const mode = getBrowserAuthMode(c.env);
  const setupRequired = mode === 'standalone' && (await countUsers(c.env.DB)) === 0;
  return c.json({
    mode,
    passkey: mode === 'standalone',
    github: mode === 'standalone' && !!c.env.GITHUB_CLIENT_ID,
    cf_access: mode === 'cf_access',
    setup_required: setupRequired,
  });
});

return auth;
}

export default createAuthRouter();
