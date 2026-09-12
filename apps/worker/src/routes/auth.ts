import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
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
import { newId, nanoid } from '../util/id';
import { getBrowserAuthMode } from '../auth/mode';
import { resolveUser } from '../auth/middleware';
import { clearInviteCookie, getValidInvite, readInviteCookie, redeemInviteAtomic } from '../auth/invites';
import {
  buildGithubAppManifest,
  convertGithubAppManifest,
  exchangeGithubOAuthCode,
  getGithubWebConfig,
  githubOwnerMatches,
  hasGithubOwner,
  saveGithubWebConfig,
} from '../auth/github_web';

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

const GH_MANIFEST_STATE_COOKIE = 'vf_gh_manifest_state';
const GH_MANIFEST_PURPOSE_COOKIE = 'vf_gh_manifest_purpose';
const GH_OAUTH_STATE_COOKIE = 'vf_gh_oauth_state';
const GH_OAUTH_PURPOSE_COOKIE = 'vf_gh_oauth_purpose';
const GH_FLOW_TTL_SEC = 10 * 60;

function setFlowCookie(c: Context, name: string, value: string): void {
  setCookie(c, name, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: GH_FLOW_TTL_SEC,
  });
}

function clearFlowCookie(c: Context, name: string): void {
  deleteCookie(c, name, { path: '/' });
}

function requestOrigin(url: string): string {
  return new URL(url).origin;
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

// ── Zero-config GitHub App bootstrap + web OAuth ─────────────────────────────

auth.post('/setup/github/bootstrap/start', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
  }
  if (c.env.GITHUB_CLIENT_ID?.trim()) {
    return c.json({ error: { type: 'already_configured', message: 'GitHub Device Flow is configured for this deployment' } }, 409);
  }

  const origin = requestOrigin(c.req.url);
  if (await getGithubWebConfig(c.env, origin)) {
    return c.json({ error: { type: 'already_configured', message: 'GitHub web sign-in is already configured for this origin' } }, 409);
  }

  const userCount = await countUsers(c.env.DB);
  const purpose = userCount === 0 ? 'setup' : 'rebind';
  if (purpose === 'rebind' && !(await hasGithubOwner(c.env))) {
    return c.json({ error: { type: 'forbidden', message: 'Only an existing GitHub owner can repair GitHub sign-in for a new hostname' } }, 403);
  }

  const state = nanoid(32);
  setFlowCookie(c, GH_MANIFEST_STATE_COOKIE, state);
  setFlowCookie(c, GH_MANIFEST_PURPOSE_COOKIE, purpose);
  const manifest = buildGithubAppManifest(origin, `VibeFlare ${nanoid(8)}`);
  return c.json({
    action: `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`,
    manifest: JSON.stringify(manifest),
  });
});

auth.get('/setup/github/manifest/callback', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.redirect('/login', 302);
  }
  const expectedState = getCookie(c, GH_MANIFEST_STATE_COOKIE);
  const purpose = getCookie(c, GH_MANIFEST_PURPOSE_COOKIE);
  clearFlowCookie(c, GH_MANIFEST_STATE_COOKIE);
  clearFlowCookie(c, GH_MANIFEST_PURPOSE_COOKIE);
  const state = c.req.query('state');
  const code = c.req.query('code');
  if (!expectedState || !state || expectedState !== state || !code || (purpose !== 'setup' && purpose !== 'rebind')) {
    return c.redirect(purpose === 'rebind' ? '/login?reason=github_failed' : '/setup?github=manifest_failed', 302);
  }

  try {
    const app = await convertGithubAppManifest(code);
    const login = app.owner?.login?.trim();
    const clientId = app.client_id?.trim();
    const clientSecret = app.client_secret?.trim();
    if (!login || !clientId || !clientSecret) {
      return c.redirect(purpose === 'rebind' ? '/login?reason=github_failed' : '/setup?github=manifest_failed', 302);
    }

    const origin = requestOrigin(c.req.url);
    if (purpose === 'rebind') {
      const owner = await githubOwnerMatches(c.env, login);
      if (!owner) return c.redirect('/login?reason=github_owner_mismatch', 302);
      await saveGithubWebConfig(c.env, {
        clientId,
        clientSecret,
        appSlug: app.slug ?? null,
        origin,
      });
      await issueSession(c, owner.id, 'owner');
      return c.redirect('/', 302);
    }

    const userId = newId();
    const inserted = await c.env.DB.prepare(
      `INSERT INTO auth_users (id, email, github_login, role, created_at)
       SELECT ?, NULL, ?, 'owner', ?
       WHERE NOT EXISTS (SELECT 1 FROM auth_users)`,
    ).bind(userId, login, Date.now()).run();
    if (inserted.meta.changes === 0) {
      return c.redirect('/login', 302);
    }

    try {
      await saveGithubWebConfig(c.env, {
        clientId,
        clientSecret,
        appSlug: app.slug ?? null,
        origin,
      });
    } catch (error) {
      await c.env.DB.prepare('DELETE FROM auth_users WHERE id = ?').bind(userId).run();
      throw error;
    }

    await issueSession(c, userId, 'owner');
    return c.redirect('/', 302);
  } catch {
    return c.redirect(purpose === 'rebind' ? '/login?reason=github_failed' : '/setup?github=manifest_failed', 302);
  }
});

auth.get('/github/oauth/start', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
  }
  const origin = requestOrigin(c.req.url);
  const config = await getGithubWebConfig(c.env, origin);
  if (!config) {
    return c.json({ error: { type: 'not_configured', message: 'GitHub web sign-in is not configured' } }, 501);
  }
  const purpose = c.req.query('purpose') === 'invite' ? 'invite' : 'login';
  if (purpose === 'invite') {
    const token = readInviteCookie(c);
    if (!token || !(await getValidInvite(c.env.DB, token))) {
      clearInviteCookie(c);
      return c.redirect('/login?reason=invite_required', 302);
    }
  }

  const state = nanoid(32);
  setFlowCookie(c, GH_OAUTH_STATE_COOKIE, state);
  setFlowCookie(c, GH_OAUTH_PURPOSE_COOKIE, purpose);
  const redirectUri = `${config.origin}/auth/github/oauth/callback`;
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', config.clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('state', state);
  return c.redirect(authorize.toString(), 302);
});

auth.get('/github/oauth/callback', async (c) => {
  if (getBrowserAuthMode(c.env) !== 'standalone') {
    return c.redirect('/login', 302);
  }
  const expectedState = getCookie(c, GH_OAUTH_STATE_COOKIE);
  const purpose = getCookie(c, GH_OAUTH_PURPOSE_COOKIE);
  clearFlowCookie(c, GH_OAUTH_STATE_COOKIE);
  clearFlowCookie(c, GH_OAUTH_PURPOSE_COOKIE);
  const state = c.req.query('state');
  const code = c.req.query('code');
  if (!expectedState || expectedState !== state || !code || (purpose !== 'login' && purpose !== 'invite')) {
    return c.redirect('/login?reason=github_failed', 302);
  }

  try {
    const origin = requestOrigin(c.req.url);
    const config = await getGithubWebConfig(c.env, origin);
    if (!config) return c.redirect('/login?reason=github_failed', 302);
    const redirectUri = `${config.origin}/auth/github/oauth/callback`;
    const accessToken = await exchangeGithubOAuthCode(config, code, redirectUri);
    const ghUser = await deps.fetchUser(accessToken);

    if (purpose === 'login') {
      const user = await getUserByGithubLogin(c.env.DB, ghUser.login);
      if (!user) return c.redirect('/login?reason=invite_required', 302);
      await deps.linkAccessOnLogin(c, user.id);
      await issueSession(c, user.id, user.role);
      return c.redirect('/', 302);
    }

    const token = readInviteCookie(c);
    if (!token || !(await getValidInvite(c.env.DB, token))) {
      clearInviteCookie(c);
      return c.redirect('/login?reason=invite_required', 302);
    }
    const existing = await getUserByGithubLogin(c.env.DB, ghUser.login);
    if (existing) return c.redirect('/login', 302);

    const userId = newId();
    try {
      await c.env.DB.prepare(
        `INSERT INTO auth_users (id, email, github_login, role, created_at) VALUES (?, ?, ?, 'user', ?)`,
      ).bind(userId, ghUser.email ?? null, ghUser.login, Date.now()).run();
    } catch {
      return c.redirect('/login', 302);
    }
    const redeemed = await redeemInviteAtomic(c.env.DB, token, userId);
    if (!redeemed.ok) {
      await c.env.DB.prepare('DELETE FROM auth_users WHERE id = ?').bind(userId).run();
      clearInviteCookie(c);
      return c.redirect('/login?reason=invite_required', 302);
    }
    clearInviteCookie(c);
    await deps.linkAccessOnLogin(c, userId);
    await issueSession(c, userId, 'user');
    return c.redirect('/', 302);
  } catch {
    return c.redirect(purpose === 'invite' ? '/signup?reason=github_failed' : '/login?reason=github_failed', 302);
  }
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
  const origin = requestOrigin(c.req.url);
  const githubWeb = mode === 'standalone' ? await getGithubWebConfig(c.env, origin) : null;
  const canRebindGithub = mode === 'standalone' && !setupRequired && !githubWeb && await hasGithubOwner(c.env);
  const githubFlow = mode !== 'standalone'
    ? 'none'
    : c.env.GITHUB_CLIENT_ID?.trim()
      ? 'device'
      : githubWeb
        ? 'oauth'
        : setupRequired || canRebindGithub
          ? 'bootstrap'
          : 'none';
  return c.json({
    mode,
    passkey: mode === 'standalone',
    github: githubFlow !== 'none',
    github_flow: githubFlow,
    cf_access: mode === 'cf_access',
    setup_required: setupRequired,
  });
});

return auth;
}

export default createAuthRouter();
