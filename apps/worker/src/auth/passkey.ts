import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type { Env } from '../env';
import {
  insertCredential,
  getCredentialByCredentialId,
  incrementCredentialCounter,
  getUserById,
} from '../db/queries';
import { newId } from '../util/id';

const CHALLENGE_TTL = 60; // seconds

function relyingParty(env: Env, requestUrl?: string): { rpId: string; origin: string } {
  const url = requestUrl ? new URL(requestUrl) : null;
  const rpId = env.RP_ID?.trim() || url?.hostname || 'localhost';
  const origin = env.RP_ORIGIN?.trim() || url?.origin || `https://${rpId}`;
  return { rpId, origin };
}

export function resolveRelyingParty(env: Env, requestUrl?: string) {
  return relyingParty(env, requestUrl);
}

// Injected verifier types — allows tests to substitute without vi.mock
export type RegVerifier = typeof verifyRegistrationResponse;
export type AuthVerifier = typeof verifyAuthenticationResponse;

function regCacheKey(userId: string) {
  return `https://challenge.vibeflare/reg/${userId}`;
}

function authCacheKey(challengeId: string) {
  return `https://challenge.vibeflare/auth/${challengeId}`;
}

async function storeChallenge(key: string, challenge: string): Promise<void> {
  const cache = await caches.open('challenges');
  await cache.put(
    key,
    new Response(challenge, {
      headers: { 'Cache-Control': `max-age=${CHALLENGE_TTL}` },
    }),
  );
}

async function fetchChallenge(key: string): Promise<string | null> {
  const cache = await caches.open('challenges');
  const res = await cache.match(key);
  if (!res) return null;
  const text = await res.text();
  await cache.delete(key);
  return text;
}

export async function startRegistration(
  env: Env,
  userId: string,
  label: string,
  requestUrl?: string,
): Promise<Awaited<ReturnType<typeof generateRegistrationOptions>>> {
  const { rpId } = relyingParty(env, requestUrl);
  const options = await generateRegistrationOptions({
    rpName: env.RP_NAME,
    rpID: rpId,
    userID: new TextEncoder().encode(userId),
    userName: label,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  await storeChallenge(regCacheKey(userId), options.challenge);
  return options;
}

export interface VerifiedRegistration {
  credential: {
    id: string;
    publicKey: Uint8Array | ArrayBuffer;
    counter: number;
    transports?: string[];
  };
}

export async function verifyRegistrationOnly(
  env: Env,
  userId: string,
  response: RegistrationResponseJSON,
  _verifier: RegVerifier = verifyRegistrationResponse,
  requestUrl?: string,
): Promise<{ ok: true; data: VerifiedRegistration } | { ok: false; status: number; message: string }> {
  const { rpId, origin } = relyingParty(env, requestUrl);
  const challenge = await fetchChallenge(regCacheKey(userId));
  if (!challenge) {
    return { ok: false, status: 400, message: 'challenge expired or not found' };
  }

  let verification: VerifiedRegistrationResponse;
  try {
    verification = await _verifier({
      response,
      expectedChallenge: challenge,
      expectedRPID: rpId,
      expectedOrigin: origin,
    });
  } catch (e) {
    return { ok: false, status: 400, message: String(e) };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, status: 400, message: 'verification failed' };
  }

  const { credential } = verification.registrationInfo;
  return {
    ok: true,
    data: {
      credential: {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports as string[] | undefined,
      },
    },
  };
}

export async function finishRegistration(
  env: Env,
  userId: string,
  label: string,
  response: RegistrationResponseJSON,
  role: 'owner' | 'user' = 'user',
  _verifier: RegVerifier = verifyRegistrationResponse,
  requestUrl?: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const v = await verifyRegistrationOnly(env, userId, response, _verifier, requestUrl);
  if (!v.ok) return v;

  const { credential } = v.data;
  const now = Date.now();

  if (role === 'owner') {
    const result = await env.DB.prepare(
      `INSERT INTO auth_users (id, email, github_login, role, created_at)
       SELECT ?, NULL, NULL, 'owner', ?
       WHERE NOT EXISTS (SELECT 1 FROM auth_users)`,
    )
      .bind(userId, now)
      .run();
    if (result.meta.changes === 0) {
      return { ok: false, status: 409, message: 'setup already complete' };
    }
  } else {
    const existing = await getUserById(env.DB, userId);
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO auth_users (id, email, github_login, role, created_at) VALUES (?, NULL, NULL, 'user', ?)`,
      )
        .bind(userId, now)
        .run();
    }
  }

  const storedPublicKey = credential.publicKey instanceof Uint8Array
    ? credential.publicKey.slice().buffer
    : credential.publicKey.slice(0);

  await insertCredential(env.DB, {
    id: newId(),
    user_id: userId,
    credential_id: credential.id,
    public_key: storedPublicKey,
    counter: credential.counter,
    device_label: label,
    transports: credential.transports?.join(',') ?? null,
    created_at: now,
  });

  return { ok: true };
}

export async function startAuthentication(
  env: Env,
  requestUrl?: string,
): Promise<Awaited<ReturnType<typeof generateAuthenticationOptions>> & { challengeId: string }> {
  const { rpId } = relyingParty(env, requestUrl);
  const allCreds = await env.DB.prepare(
    'SELECT credential_id FROM auth_credentials',
  ).all<{ credential_id: string }>();

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: 'preferred',
    allowCredentials: allCreds.results.map((c) => ({
      id: c.credential_id,
    })),
  });

  const challengeId = newId();
  await storeChallenge(authCacheKey(challengeId), options.challenge);
  return { ...options, challengeId };
}

export async function finishAuthentication(
  env: Env,
  challengeId: string,
  response: AuthenticationResponseJSON,
  _verifier: AuthVerifier = verifyAuthenticationResponse,
  requestUrl?: string,
): Promise<{ userId: string; role: 'owner' | 'user' } | null> {
  const { rpId, origin } = relyingParty(env, requestUrl);
  const challenge = await fetchChallenge(authCacheKey(challengeId));
  if (!challenge) return null;

  const credRow = await getCredentialByCredentialId(env.DB, response.id);
  if (!credRow) return null;

  let verification: VerifiedAuthenticationResponse;
  try {
    verification = await _verifier({
      response,
      expectedChallenge: challenge,
      expectedRPID: rpId,
      expectedOrigin: origin,
      credential: {
        id: credRow.credential_id,
        publicKey: new Uint8Array(credRow.public_key),
        counter: credRow.counter,
        transports: credRow.transports?.split(',') ?? undefined,
      },
    });
  } catch {
    return null;
  }

  if (!verification.verified) return null;

  const now = Date.now();
  await incrementCredentialCounter(
    env.DB,
    credRow.id,
    verification.authenticationInfo.newCounter,
    now,
  );

  const user = await getUserById(env.DB, credRow.user_id);
  if (!user) return null;
  return { userId: user.id, role: user.role };
}
