import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import {
  getValidInvite,
  redeemInviteAtomic,
  setInviteCookie,
  clearInviteCookie,
  readInviteCookie,
} from '../auth/invites';
import {
  startRegistration,
  verifyRegistrationOnly,
} from '../auth/passkey';
import { issueSession } from '../auth/session';
import { linkAccessOnLogin } from '../auth/access_link';
import { checkRateLimit, checkAndRecord } from '../auth/ratelimit';
import { startDeviceAuth, pollDeviceAuth, fetchUser } from '../auth/github';
import { verifyAccessJWT } from '../auth/access';
import { getUserByGithubLogin, getUserById, getUserByAccessSub } from '../db/queries';
import { newId } from '../util/id';
import { getBrowserAuthMode } from '../auth/mode';

export interface InviteDeps {
  verifyAccessJWT: typeof verifyAccessJWT;
  verifyRegistrationOnly: typeof verifyRegistrationOnly;
  startDeviceAuth: typeof startDeviceAuth;
  pollDeviceAuth: typeof pollDeviceAuth;
  fetchUser: typeof fetchUser;
}

const defaultDeps: InviteDeps = { verifyAccessJWT, verifyRegistrationOnly, startDeviceAuth, pollDeviceAuth, fetchUser };

export function createAuthInviteRouter(
  deps: InviteDeps = defaultDeps,
) {
  const authInvite = new Hono<{ Bindings: Env; Variables: Variables }>();

  function getIp(c: { req: { header: (h: string) => string | undefined } }): string {
    return c.req.header('cf-connecting-ip') ?? '0.0.0.0';
  }

  // ── GET /auth/invite/stash?token=<full> ───────────────────────────────────────

  authInvite.get('/stash', (c) => {
    const token = c.req.query('token');
    if (!token) return c.redirect('/login?reason=invite_required', 302);
    setInviteCookie(c, token);
    return c.redirect('/signup', 302);
  });

  // ── POST /auth/invite/validate ────────────────────────────────────────────────

  authInvite.post('/validate', async (c) => {
    const token = readInviteCookie(c);
    if (!token) {
      return c.json({ error: { type: 'invalid_request', message: 'invite cookie missing' } }, 400);
    }
    const invite = await getValidInvite(c.env.DB, token);
    if (!invite) {
      clearInviteCookie(c);
      return c.json({ error: { type: 'invite_consumed', message: 'invite not valid' } }, 410);
    }
    return c.json({ ok: true, expires_at: invite.expires_at });
  });

  // ── POST /auth/invite/redeem/passkey/start ────────────────────────────────────

  authInvite.post('/redeem/passkey/start', async (c) => {
    if (getBrowserAuthMode(c.env) !== 'standalone') {
      return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
    }
    const ip = getIp(c);
    const rl = await checkRateLimit(c.env, ip);
    if (rl.locked) {
      return c.json({ error: { type: 'rate_limit', message: 'too many attempts' } }, 429);
    }

    const token = readInviteCookie(c);
    if (!token) {
      return c.json({ error: { type: 'invalid_request', message: 'invite cookie missing' } }, 400);
    }
    const invite = await getValidInvite(c.env.DB, token);
    if (!invite) {
      clearInviteCookie(c);
      return c.json({ error: { type: 'invite_consumed', message: 'invite not valid' } }, 410);
    }

    const userId = newId();
    const options = await startRegistration(c.env, userId, 'new user', c.req.url);
    await checkAndRecord(c.env, ip, true);
    return c.json({ ...options, userId });
  });

  // ── POST /auth/invite/redeem/passkey/finish ───────────────────────────────────

  authInvite.post('/redeem/passkey/finish', async (c) => {
    if (getBrowserAuthMode(c.env) !== 'standalone') {
      return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
    }
    const ip = getIp(c);
    const rl = await checkRateLimit(c.env, ip);
    if (rl.locked) {
      return c.json({ error: { type: 'rate_limit', message: 'too many attempts' } }, 429);
    }

    const token = readInviteCookie(c);
    if (!token) {
      return c.json({ error: { type: 'invalid_request', message: 'invite cookie missing' } }, 400);
    }
    const invite = await getValidInvite(c.env.DB, token);
    if (!invite) {
      clearInviteCookie(c);
      return c.json({ error: { type: 'invite_consumed', message: 'invite not valid' } }, 410);
    }

    const body = await c.req.json<{
      userId: string;
      label?: string;
      response: unknown;
    }>();

    if (!body.userId) {
      return c.json({ error: { type: 'invalid_request', message: 'userId required' } }, 400);
    }

    const v = await deps.verifyRegistrationOnly(
      c.env,
      body.userId,
      body.response as Parameters<typeof verifyRegistrationOnly>[2],
      undefined,
      c.req.url,
    );

    if (!v.ok) {
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'auth', message: v.message } }, v.status as 400 | 409);
    }

    const { credential } = v.data;
    const now = Date.now();
    const credRowId = newId();

    const userInsert = await c.env.DB.prepare(
      `INSERT INTO auth_users (id, email, github_login, role, created_at) VALUES (?, NULL, NULL, 'user', ?) ON CONFLICT DO NOTHING RETURNING id`,
    ).bind(body.userId, now).all<{ id: string }>();
    if (!userInsert.results?.[0]) {
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'already_exists', message: 'user already exists' } }, 409);
    }

    try {
      await c.env.DB.prepare(
        `INSERT INTO auth_credentials (id, user_id, credential_id, public_key, counter, device_label, transports, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        credRowId,
        body.userId,
        credential.id,
        credential.publicKey as unknown as ArrayBuffer,
        credential.counter,
        body.label ?? null,
        credential.transports?.join(',') ?? null,
        now,
      ).run();
    } catch {
      await c.env.DB.prepare('DELETE FROM auth_users WHERE id = ?').bind(body.userId).run();
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'already_exists', message: 'credential already registered' } }, 409);
    }

    const result = await redeemInviteAtomic(c.env.DB, token, body.userId);

    if (!result.ok) {
      await c.env.DB.prepare('DELETE FROM auth_users WHERE id = ?').bind(body.userId).run();
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: result.reason, message: `invite ${result.reason}` } }, 410);
    }

    await checkAndRecord(c.env, ip, true);
    clearInviteCookie(c);
    await linkAccessOnLogin(c, body.userId);
    await issueSession(c, body.userId, 'user');
    return c.json({ ok: true });
  });

  // ── POST /auth/invite/redeem/github/start ─────────────────────────────────────

  authInvite.post('/redeem/github/start', async (c) => {
    if (getBrowserAuthMode(c.env) !== 'standalone') {
      return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
    }
    if (!c.env.GITHUB_CLIENT_ID) {
      return c.json({ error: { type: 'not_configured', message: 'GitHub not configured' } }, 501);
    }

    const ip = getIp(c);
    const rl = await checkRateLimit(c.env, ip);
    if (rl.locked) {
      return c.json({ error: { type: 'rate_limit', message: 'too many attempts' } }, 429);
    }

    const token = readInviteCookie(c);
    if (!token) {
      return c.json({ error: { type: 'invalid_request', message: 'invite cookie missing' } }, 400);
    }
    const invite = await getValidInvite(c.env.DB, token);
    if (!invite) {
      clearInviteCookie(c);
      return c.json({ error: { type: 'invite_consumed', message: 'invite not valid' } }, 410);
    }

    try {
      const result = await deps.startDeviceAuth(c.env);
      await checkAndRecord(c.env, ip, true);
      return c.json(result);
    } catch {
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'upstream', message: 'GitHub device flow init failed' } }, 502);
    }
  });

  // ── POST /auth/invite/redeem/github/poll ──────────────────────────────────────

  authInvite.post('/redeem/github/poll', async (c) => {
    if (getBrowserAuthMode(c.env) !== 'standalone') {
      return c.json({ error: { type: 'auth_mode', message: 'Cloudflare Access owns browser sign-in for this deployment' } }, 409);
    }
    if (!c.env.GITHUB_CLIENT_ID) {
      return c.json({ error: { type: 'not_configured', message: 'GitHub not configured' } }, 501);
    }

    const token = readInviteCookie(c);
    if (!token) {
      return c.json({ error: { type: 'invalid_request', message: 'invite cookie missing' } }, 400);
    }
    const invite = await getValidInvite(c.env.DB, token);
    if (!invite) {
      clearInviteCookie(c);
      return c.json({ error: { type: 'invite_consumed', message: 'invite not valid' } }, 410);
    }

    const body = await c.req.json<{ device_id: string }>();
    if (!body.device_id) {
      return c.json({ error: { type: 'invalid_request', message: 'device_id required' } }, 400);
    }

    const poll = await deps.pollDeviceAuth(c.env, body.device_id);
    if (poll.status !== 'ok') {
      return c.json(poll);
    }

    const ip = getIp(c);
    const ghUser = await deps.fetchUser(poll.accessToken);

    const existing = await getUserByGithubLogin(c.env.DB, ghUser.login);
    if (existing) {
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'already_exists', message: 'GitHub account already registered' } }, 409);
    }

    const userId = newId();
    const now = Date.now();

    let inserted: D1Result<{ id: string }>;
    try {
      inserted = await c.env.DB.prepare(
        `INSERT INTO auth_users (id, email, github_login, role, created_at) VALUES (?, ?, ?, 'user', ?) RETURNING id`,
      ).bind(userId, ghUser.email ?? null, ghUser.login, now).all<{ id: string }>();
    } catch {
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'already_exists', message: 'GitHub account already registered' } }, 409);
    }
    if (!inserted.results?.[0]) {
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'already_exists', message: 'GitHub account already registered' } }, 409);
    }

    const result = await redeemInviteAtomic(c.env.DB, token, userId);

    if (!result.ok) {
      await c.env.DB.prepare('DELETE FROM auth_users WHERE id = ?').bind(userId).run();
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: result.reason, message: `invite ${result.reason}` } }, 410);
    }

    await checkAndRecord(c.env, ip, true);
    clearInviteCookie(c);
    await linkAccessOnLogin(c, userId);
    await issueSession(c, userId, 'user');
    return c.json({ status: 'ok' });
  });

  // ── POST /auth/invite/redeem/access ──────────────────────────────────────────

  authInvite.post('/redeem/access', async (c) => {
    if (getBrowserAuthMode(c.env) !== 'cf_access') {
      return c.json({ error: { type: 'auth_mode', message: 'VibeFlare session auth owns browser sign-in for this deployment' } }, 409);
    }
    const ip = getIp(c);
    const rl = await checkRateLimit(c.env, ip);
    if (rl.locked) {
      return c.json({ error: { type: 'rate_limit', message: 'too many attempts' } }, 429);
    }

    const token = readInviteCookie(c);
    if (!token) {
      return c.json({ error: { type: 'invalid_request', message: 'invite cookie missing' } }, 400);
    }
    const invite = await getValidInvite(c.env.DB, token);
    if (!invite) {
      clearInviteCookie(c);
      return c.json({ error: { type: 'invite_consumed', message: 'invite not valid' } }, 410);
    }

    const jwt = c.req.header('cf-access-jwt-assertion') ?? '';
    const claims = await deps.verifyAccessJWT(c.env, jwt);
    if (!claims) {
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'auth', message: 'invalid CF Access JWT' } }, 401);
    }

    const existingUser =
      (await getUserById(c.env.DB, claims.sub)) ??
      (await getUserByAccessSub(c.env.DB, claims.sub));
    if (existingUser) {
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'already_exists', message: 'account already registered' } }, 409);
    }

    const now = Date.now();

    let inserted: D1Result<{ id: string }>;
    try {
      inserted = await c.env.DB.prepare(
        `INSERT INTO auth_users (id, email, github_login, access_sub, role, created_at) VALUES (?, ?, NULL, ?, 'user', ?) RETURNING id`,
      ).bind(claims.sub, claims.email, claims.sub, now).all<{ id: string }>();
    } catch {
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'already_exists', message: 'account already registered' } }, 409);
    }
    if (!inserted.results?.[0]) {
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: 'already_exists', message: 'account already registered' } }, 409);
    }

    const result = await redeemInviteAtomic(c.env.DB, token, claims.sub);

    if (!result.ok) {
      await c.env.DB.prepare('DELETE FROM auth_users WHERE id = ?').bind(claims.sub).run();
      await checkAndRecord(c.env, ip, false);
      return c.json({ error: { type: result.reason, message: `invite ${result.reason}` } }, 410);
    }

    await checkAndRecord(c.env, ip, true);
    clearInviteCookie(c);
    await issueSession(c, claims.sub, 'user');
    return c.json({ ok: true });
  });

  return authInvite;
}

export default createAuthInviteRouter();
