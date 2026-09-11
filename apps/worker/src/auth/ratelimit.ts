import type { Env } from '../env';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 5;

export interface RateLimitResult {
  locked: boolean;
  remaining: number;
}

export class AuthRateLimiter implements DurableObject {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const key = url.searchParams.get('key') ?? '';
    const storageKey = `f:${key}`;
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    // Load and prune timestamps
    let timestamps: number[] = (await this.state.storage.get<number[]>(storageKey)) ?? [];
    timestamps = timestamps.filter(t => t > cutoff);

    if (url.pathname === '/check') {
      const locked = timestamps.length >= MAX_FAILURES;
      const remaining = Math.max(0, MAX_FAILURES - timestamps.length);
      return Response.json({ locked, remaining });
    }

    if (url.pathname === '/record') {
      const success = url.searchParams.get('success') === '1';
      if (success) {
        // Reset on success
        timestamps = [];
      } else {
        timestamps.push(now);
      }
      await this.state.storage.put(storageKey, timestamps);
      const locked = timestamps.length >= MAX_FAILURES;
      const remaining = Math.max(0, MAX_FAILURES - timestamps.length);
      return Response.json({ locked, remaining });
    }

    return new Response('not found', { status: 404 });
  }
}

function stub(env: Env, ip: string): DurableObjectStub {
  return env.AUTH_RL.get(env.AUTH_RL.idFromName(ip));
}

export async function checkAndRecord(
  env: Env,
  ip: string,
  success: boolean
): Promise<RateLimitResult> {
  const s = stub(env, ip);
  const r = await s.fetch(
    `https://rl/record?key=${encodeURIComponent(ip)}&success=${success ? '1' : '0'}`
  );
  return r.json<RateLimitResult>();
}

export async function checkRateLimit(env: Env, ip: string): Promise<RateLimitResult> {
  const s = stub(env, ip);
  const r = await s.fetch(`https://rl/check?key=${encodeURIComponent(ip)}`);
  return r.json<RateLimitResult>();
}
