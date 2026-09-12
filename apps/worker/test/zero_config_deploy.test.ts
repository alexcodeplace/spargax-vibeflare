import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { resolveSessionSecret } from '../src/auth/session';
import { resolveRelyingParty } from '../src/auth/passkey';
import { BUILTIN_MODEL_CATALOG_VERSION, BUILTIN_MODEL_CATALOG_VERSION_KEY, ensureModelCatalog, MODEL_CATALOG_READY_KEY } from '../src/models/catalog';
import { getSetting, listModels } from '../src/db/queries';

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM settings WHERE key IN (?, ?, ?)")
    .bind('system.session_secret', MODEL_CATALOG_READY_KEY, BUILTIN_MODEL_CATALOG_VERSION_KEY).run();
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

  it('seeds useful text and image models without Cloudflare REST credentials', async () => {
    const zeroConfig = { ...env, CF_ACCOUNT_ID: undefined, CF_API_TOKEN: undefined } as never;
    await expect(ensureModelCatalog(zeroConfig)).resolves.toEqual({ initialized: true, count: 8 });
    const textModels = await listModels(env.DB, 'text-generation');
    expect(textModels.map((model) => model.name)).toEqual([
      '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
      '@cf/meta/llama-3.1-8b-instruct-fp8',
      '@cf/meta/llama-3.2-3b-instruct',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/qwen/qwen2.5-coder-32b-instruct',
    ]);
    const imageModels = await listModels(env.DB, 'text-to-image');
    expect(imageModels.map((model) => model.name)).toEqual([
      '@cf/black-forest-labs/flux-1-schnell',
      '@cf/bytedance/stable-diffusion-xl-lightning',
      '@cf/lykon/dreamshaper-8-lcm',
    ]);
    expect(await getSetting(env.DB, MODEL_CATALOG_READY_KEY)).toBe('1');
    expect(await getSetting(env.DB, BUILTIN_MODEL_CATALOG_VERSION_KEY)).toBe(BUILTIN_MODEL_CATALOG_VERSION);
  });

  it('backfills upgraded built-in models into an already-ready zero-config catalog', async () => {
    const zeroConfig = { ...env, CF_ACCOUNT_ID: undefined, CF_API_TOKEN: undefined } as never;
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, '1', 0)")
      .bind(MODEL_CATALOG_READY_KEY).run();
    await env.DB.prepare("INSERT INTO models (name, task, description, properties, beta, enabled, synced_at) VALUES ('@cf/meta/llama-3.2-3b-instruct', 'text-generation', NULL, '[]', 0, 1, 0)").run();

    await expect(ensureModelCatalog(zeroConfig)).resolves.toEqual({ initialized: false, count: 8 });
    expect((await listModels(env.DB, 'text-to-image'))).toHaveLength(3);
    expect(await getSetting(env.DB, BUILTIN_MODEL_CATALOG_VERSION_KEY)).toBe(BUILTIN_MODEL_CATALOG_VERSION);
  });
});
