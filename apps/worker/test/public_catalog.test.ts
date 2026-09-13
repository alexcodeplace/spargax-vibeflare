import { describe, expect, it, vi } from 'vitest';
import {
  CLOUDFLARE_MODELS_URL, CLOUDFLARE_PRICING_URL,
  fetchCloudflarePublicCatalog, parseCloudflareModelRegistry, parseNeuronPricing,
} from '../src/models/public_catalog';
import snapshot from './fixtures/cloudflare-model-registry.json';

const model = (name: string, properties: { property_id: string; value: unknown }[] = [], overrides = {}) => ({
  name, task: { name: 'Text Generation' }, properties, deprecated: false, ...overrides,
});
const paid = { property_id: 'require_workers_paid', value: 'true' };

describe('Cloudflare structured model registry', () => {
  it('classifies access without pricing rows, including beta and zero-price models', () => {
    const result = parseCloudflareModelRegistry({ models: [
      model('@cf/google/embeddinggemma-300m', [{ property_id: 'beta', value: 'true' }]),
      model('@cf/bytedance/stable-diffusion-xl-lightning', [{ property_id: 'price', value: [{ unit: 'per step', price: 0, currency: 'USD' }] }]),
      model('@cf/test/expensive-free-plan', [{ property_id: 'price', value: [{ unit: 'per M tokens', price: 99, currency: 'USD' }] }]),
      model('@cf/deepseek-ai/deepseek-v4-flash-0731', [paid]),
    ] });
    expect(result.map(m => m.paidRequired)).toEqual([false, false, false, true]);
    expect(result[0]?.beta).toBe(true);
    expect(result[1]?.pricing).toBe('$0 per step');
    expect(result.every(m => m.neuronsInput === null)).toBe(true);
  });

  it('uses flag semantics, not price guesses or hardcoded model-family names', () => {
    const result = parseCloudflareModelRegistry({ models: [
      model('@cf/new-provider/new-paid-model', [{ ...paid, value: true }]),
      model('@cf/new-provider/new-free-model', [{ ...paid, value: 'false' }]),
      model('@cf/new-provider/absent-optional-flag'),
    ] });
    expect(result.map(m => m.paidRequired)).toEqual([true, false, false]);
  });

  it('omits deprecated and expired entries while preserving future retirement dates', () => {
    const result = parseCloudflareModelRegistry({ models: [
      model('@cf/test/current'),
      model('@cf/test/deprecated', [], { deprecated: true }),
      model('@cf/test/expired', [{ property_id: 'planned_deprecation_date', value: '2026-05-30' }]),
      model('@cf/test/future', [{ property_id: 'planned_deprecation_date', value: '2027-01-01' }]),
    ] }, '', Date.parse('2026-09-13'));
    expect(result.map(m => m.name)).toEqual(['@cf/test/current', '@cf/test/future']);
  });

  it('rejects malformed or partial snapshots before the database can be overwritten', () => {
    for (const bad of [
      null, {}, { models: [] },
      { models: [model('@cf/test/current'), { name: '@cf/test/broken' }] },
      { models: [model('@cf/test/current', [{ ...paid, value: 'maybe' }])] },
      { models: [model('@cf/test/current', [paid, paid])] },
      { models: [model('@cf/test/current'), model('@cf/test/current')] },
      { models: [model('@cf/test/current', [], { properties: null })] },
    ]) expect(() => parseCloudflareModelRegistry(bad)).toThrow();
  });

  it('gives every current real catalog entry a definite access classification', () => {
    const result = parseCloudflareModelRegistry(snapshot);
    expect(result).toHaveLength(65);
    expect(result.filter(m => m.paidRequired)).toHaveLength(7);
    expect(result.filter(m => !m.paidRequired)).toHaveLength(58);
    expect(result.every(m => typeof m.paidRequired === 'boolean')).toBe(true);
    expect(result.some(m => m.name === '@cf/microsoft/phi-2')).toBe(false);
    expect(result.find(m => m.name === '@cf/google/embeddinggemma-300m')?.paidRequired).toBe(false);
    expect(result.find(m => m.name === '@cf/openai/whisper-tiny-en')?.paidRequired).toBe(false);
  });

  it('keeps neuron rates independent of access and handles transport annotations', () => {
    const rates = parseNeuronPricing('| @cf/test/model | price | 45,170 neurons per M input tokens 443,756 neurons per M output tokens |\n| @cf/deepgram/flux (WebSocket) | $0.0077 | 700.00 neurons per audio minute |');
    expect(rates.get('@cf/test/model')).toMatchObject({ input: 0.04517, output: 0.443756 });
    expect(rates.has('@cf/deepgram/flux')).toBe(true);
  });

  it.each(['http failure', 'network failure'])('keeps access correct when pricing has a %s', async (failure) => {
    const mock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === CLOUDFLARE_MODELS_URL) return Response.json({ models: [model('@cf/test/current'), model('@cf/test/paid', [paid])] });
      if (failure === 'network failure') throw new Error('pricing offline');
      return new Response('offline', { status: 503 });
    });
    const result = await fetchCloudflarePublicCatalog(mock as typeof fetch);
    expect(result.map(m => m.paidRequired)).toEqual([false, true]);
    expect(mock.mock.calls.map(c => String(c[0])).sort()).toEqual([CLOUDFLARE_MODELS_URL, CLOUDFLARE_PRICING_URL].sort());
  });

  it('does not fall back to stale HTML pages when the registry is unavailable', async () => {
    const mock = vi.fn(async () => new Response('offline', { status: 502 }));
    await expect(fetchCloudflarePublicCatalog(mock as typeof fetch)).rejects.toThrow('registry failed');
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
