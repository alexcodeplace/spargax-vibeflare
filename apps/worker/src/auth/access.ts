import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../env';

export type JwksVerifier = (jwt: string, team: string, aud: string) => Promise<{ email: string; sub: string } | null>;

export async function verifyAccessJWT(
  env: Env,
  jwt: string,
  _verifier?: JwksVerifier,
): Promise<{ email: string; sub: string } | null> {
  // Allow injection for tests — bypass env check so tests work without CF_ACCESS_TEAM/AUD
  if (_verifier) {
    return _verifier(jwt, env.CF_ACCESS_TEAM ?? '', env.CF_ACCESS_AUD ?? '');
  }

  if (!env.CF_ACCESS_TEAM || !env.CF_ACCESS_AUD) return null;

  try {
    const certsUrl = `https://${env.CF_ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`;
    const JWKS = createRemoteJWKSet(new URL(certsUrl));
    const { payload } = await jwtVerify(jwt, JWKS, {
      audience: env.CF_ACCESS_AUD,
    });
    const email = payload['email'] as string | undefined;
    const sub = payload.sub;
    if (!email || !sub) return null;
    return { email, sub };
  } catch {
    return null;
  }
}
