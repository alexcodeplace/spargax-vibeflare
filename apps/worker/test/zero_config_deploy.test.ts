import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { resolveSessionSecret } from '../src/auth/session';
import { resolveRelyingParty } from '../src/auth/passkey';
import { ensureModelCatalog, MODEL_CATALOG_READY_KEY } from '../src/models/catalog';
import { getSetting, listModels } from '../src/db/queries';

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM settings WHERE key IN (?, ?)")
    .bind('system.session_secret', MODEL_CATALOG_READY_KEY).run();
  await env.DB.prepare('DELETE FROM models').run();
});

describe('zero-config Cloudflare deployment', () => {
  it('generates and persists one session signing key when no secret binding exists', async () => {
    const zeroConfig = { ...env, SESSION_SECRET: undefined } as never;
    const first = await resolveSessionSecret(zeroConfig);
    const second = await resolveSessionSecret(zeroConfig);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(await getSetting(env.DB, 'system.session_secret')).toBe(first);
  });

  it('derives WebAuthn origin and RP ID from the workers.dev request URL', () => {
    const zeroConfig = { ...env, RP_ID: undefined, RP_ORIGIN: undefined } as never;
    expect(resolveRelyingParty(zeroConfig, 'https://vibeflare.example-subdomain.workers.dev/setup')).toEqual({
      rpId: 'vibeflare.example-subdomain.workers.dev',
      origin: 'https://vibeflare.example-subdomain.workers.dev',
    });
  });

  it('keeps explicit CLI/custom-domain RP settings authoritative', () => {
    const configured = { ...env, RP_ID: 'ai.example.com', RP_ORIGIN: 'https://ai.example.com' } as never;
    expect(resolveRelyingParty(configured, 'https://different.workers.dev/setup')).toEqual({
      rpId: 'ai.example.com',
      origin: 'https://ai.example.com',
    });
  });

  it('seeds a known-good chat model without Cloudflare REST credentials', async () => {
    const zeroConfig = { ...env, CF_ACCOUNT_ID: undefined, CF_API_TOKEN: undefined } as never;
    await expect(ensureModelCatalog(zeroConfig)).resolves.toEqual({ initialized: true, count: 1 });
    const models = await listModels(env.DB, 'text-generation');
    expect(models.map((model) => model.name)).toEqual(['@cf/meta/llama-3.2-3b-instruct']);
    expect(await getSetting(env.DB, MODEL_CATALOG_READY_KEY)).toBe('1');
  });
});
