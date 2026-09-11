import type { Env } from '../env';

export interface QuotaResult {
  ok?: boolean;
  used: number;
  limit: number;
  warn?: boolean;
  reason?: string;
  day?: string;
}

function stub(env: Env): DurableObjectStub {
  return env.QUOTA.get(env.QUOTA.idFromName('global'));
}

export async function peekQuota(env: Env): Promise<QuotaResult> {
  const r = await stub(env).fetch('https://q/peek');
  return await r.json<QuotaResult>();
}

export async function chargeQuota(env: Env, neurons: number): Promise<QuotaResult> {
  const r = await stub(env).fetch('https://q/charge', {
    method: 'POST',
    body: JSON.stringify({ neurons }),
  });
  return await r.json<QuotaResult>();
}
