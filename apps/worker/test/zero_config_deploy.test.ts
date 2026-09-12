import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { resolveSessionSecret } from '../src/auth/session';
import { resolveRelyingParty } from '../src/auth/passkey';
import { ensureModelCatalog, MODEL_CATALOG_READY_KEY, MODEL_CATALOG_SYNCED_AT_KEY } from '../src/models/catalog';
import { getSetting, listModels } from '../src/db/queries';

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM settings WHERE key IN (?, ?, ?)")
    .bind('system.session_secret', MODEL_CATALOG_READY_KEY, MODEL_CATALOG_SYNCED_AT_KEY).run();
  await env.DB.prepare('DELETE FROM models').run();
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  function mockPublicCatalog() {
    const html = `
      <div data-models-cell data-model-id="@cf/meta/llama-3.2-3b-instruct" data-model-task="Text Generation" data-model-author="Meta" data-model-href="/workers-ai/models/llama-3.2-3b-instruct/" data-model-pricing="priced" data-model-capabilities=""></div>
      <div data-models-cell data-model-id="@cf/black-forest-labs/flux-1-schnell" data-model-task="Text-to-Image" data-model-author="Black Forest Labs" data-model-href="/workers-ai/models/flux-1-schnell/" data-model-pricing="priced" data-model-capabilities=""></div>
      <div data-models-cell data-model-id="@cf/openai/whisper" data-model-task="Automatic Speech Recognition" data-model-author="OpenAI" data-model-href="/workers-ai/models/whisper/" data-model-pricing="priced" data-model-capabilities=""></div>
    `;
    const pricing = `
      | @cf/meta/llama-3.2-3b-instruct | $0.051 per M input tokens $0.335 per M output tokens | 4625 neurons per M input tokens 30475 neurons per M output tokens |
    `;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(url.includes('/pricing/') ? pricing : html, { status: 200 });
    }));
  }

  it('loads the public Cloudflare catalog without account credentials', async () => {
    mockPublicCatalog();
    const zeroConfig = { ...env, CF_ACCOUNT_ID: undefined, CF_API_TOKEN: undefined } as never;
    await expect(ensureModelCatalog(zeroConfig)).resolves.toEqual({ initialized: true, count: 3 });
    expect((await listModels(env.DB, 'text-generation')).map((model) => model.name)).toEqual([
      '@cf/meta/llama-3.2-3b-instruct',
    ]);
    expect((await listModels(env.DB, 'text-to-image')).map((model) => model.name)).toEqual([
      '@cf/black-forest-labs/flux-1-schnell',
    ]);
    expect((await listModels(env.DB, 'automatic-speech-recognition')).map((model) => model.name)).toEqual([
      '@cf/openai/whisper',
    ]);
    expect(await getSetting(env.DB, MODEL_CATALOG_READY_KEY)).toBe('1');
    expect(Number(await getSetting(env.DB, MODEL_CATALOG_SYNCED_AT_KEY))).toBeGreaterThan(0);
  });

  it('lazily refreshes an older one-model installation on the next model-list load', async () => {
    mockPublicCatalog();
    const zeroConfig = { ...env, CF_ACCOUNT_ID: undefined, CF_API_TOKEN: undefined } as never;
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, '1', 0)")
      .bind(MODEL_CATALOG_READY_KEY).run();
    await env.DB.prepare("INSERT INTO models (name, task, description, properties, beta, enabled, synced_at) VALUES ('@cf/meta/llama-3.2-3b-instruct', 'text-generation', NULL, '[]', 0, 1, 0)").run();

    await expect(ensureModelCatalog(zeroConfig)).resolves.toEqual({ initialized: false, count: 3 });
    expect((await listModels(env.DB))).toHaveLength(3);
    expect(Number(await getSetting(env.DB, MODEL_CATALOG_SYNCED_AT_KEY))).toBeGreaterThan(0);
  });
});
