// Public metadata feed used by Cloudflare's own documentation sync:
// https://github.com/cloudflare/cloudflare-docs/blob/production/bin/fetch-ai-models.js
// Unlike rendered documentation cards, this feed removes retired models and
// includes the explicit require_workers_paid property. No token or inference.
export const CLOUDFLARE_MODELS_URL = 'https://ai-cloudflare-com.pages.dev/api/models';
export const CLOUDFLARE_PRICING_URL = 'https://developers.cloudflare.com/workers-ai/platform/pricing/index.md';

export interface PublicCatalogModel {
  name: string;
  task: string;
  author: string | null;
  href: string;
  description: string | null;
  capabilities: string[];
  pricing: string | null;
  neuronsInput: number | null;
  neuronsOutput: number | null;
  paidRequired: boolean;
  beta: boolean;
}

export function normalizeCloudflareTask(task: string): string {
  return task.trim().toLowerCase().replace(/\s+/g, '-');
}

interface TokenNeuronRates { input: number | null; output: number | null; raw: string }

/** Rates are accounting metadata, never evidence of Free/Paid access. */
export function parseNeuronPricing(markdown: string): Map<string, TokenNeuronRates> {
  const rates = new Map<string, TokenNeuronRates>();
  for (const line of markdown.split('\n')) {
    // Cloudflare sometimes appends transport annotations, e.g. (WebSocket).
    const row = line.match(/^\|\s*(@[^|\s]+\/[^|\s]+)(?:\s+\([^|]*\))?\s*\|[^|]*\|\s*([^|]+)\|/);
    if (!row) continue;
    const name = row[1]!;
    const raw = row[2]!.trim();
    const toRate = (match: RegExpMatchArray | null) => {
      if (!match) return null;
      const value = Number(match[1]!.replace(/,/g, ''));
      return Number.isFinite(value) ? value / 1_000_000 : null;
    };
    rates.set(name, {
      input: toRate(raw.match(/([\d,.]+)\s+neurons per M input tokens/i)),
      output: toRate(raw.match(/([\d,.]+)\s+neurons per M output tokens/i)),
      raw,
    });
  }
  return rates;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function booleanProperty(value: unknown, name: string): boolean {
  // These are optional flags in Cloudflare's model registry. Absence means off,
  // not that a request must be made to discover whether the flag applies.
  if (value === undefined || value === false || value === 'false') return false;
  if (value === true || value === 'true') return true;
  throw new Error(`Cloudflare model registry has an invalid ${name} flag`);
}

const CAPABILITIES: Record<string, string> = {
  function_calling: 'Function calling', reasoning: 'Reasoning', vision: 'Vision',
  lora: 'LoRA', partner: 'Partner', realtime: 'Real-time',
};

/** Validate the full snapshot before touching the DB. Never publish a partial parse. */
export function parseCloudflareModelRegistry(
  data: unknown,
  pricingMarkdown = '',
  now = Date.now(),
): PublicCatalogModel[] {
  if (!object(data) || !Array.isArray(data.models) || data.models.length === 0) {
    throw new Error('Cloudflare model registry returned no models');
  }
  const rates = parseNeuronPricing(pricingMarkdown);
  const models = new Map<string, PublicCatalogModel>();
  const names = new Set<string>();
  for (const row of data.models) {
    if (!object(row) || typeof row.name !== 'string' || !/^@(cf|hf)\/[^/\s]+\/[^/\s]+$/.test(row.name)
      || !object(row.task) || typeof row.task.name !== 'string' || !row.task.name.trim()
      || !Array.isArray(row.properties)) {
      throw new Error('Cloudflare model registry contains an invalid model record');
    }
    if (names.has(row.name)) throw new Error('Cloudflare model registry contains duplicate models');
    names.add(row.name);
    const properties: Record<string, unknown> = Object.create(null);
    for (const p of row.properties) {
      if (!object(p) || typeof p.property_id !== 'string' || !('value' in p) || p.property_id in properties) {
        throw new Error('Cloudflare model registry contains invalid properties');
      }
      properties[p.property_id] = p.value;
    }
    const paidRequired = booleanProperty(properties.require_workers_paid, 'require_workers_paid');
    const deprecated = booleanProperty(row.deprecated, 'deprecated');
    const deprecatedAt = properties.planned_deprecation_date;
    let expired = false;
    if (deprecatedAt !== undefined) {
      if (typeof deprecatedAt !== 'string' || !Number.isFinite(Date.parse(deprecatedAt))) {
        throw new Error('Cloudflare model registry contains an invalid retirement date');
      }
      expired = Date.parse(deprecatedAt) <= now;
    }
    if (deprecated || expired) continue;
    const pricing = Array.isArray(properties.price) ? properties.price.flatMap(p =>
      object(p) && typeof p.price === 'number' && typeof p.unit === 'string' && p.currency === 'USD'
        ? [`$${p.price} ${p.unit}`] : []
    ).join('; ') || null : null;
    const price = rates.get(row.name);
    models.set(row.name, {
      name: row.name,
      task: normalizeCloudflareTask(row.task.name),
      author: row.name.split('/')[1] ?? null,
      href: `https://developers.cloudflare.com/workers-ai/models/${encodeURIComponent(row.name.split('/')[2]!)}/`,
      description: typeof row.description === 'string' ? row.description : null,
      capabilities: Object.entries(CAPABILITIES).filter(([key]) => properties[key] === true || properties[key] === 'true').map(([,label]) => label),
      pricing: price?.raw ?? pricing,
      neuronsInput: price?.input ?? null,
      neuronsOutput: price?.output ?? null,
      paidRequired,
      beta: booleanProperty(properties.beta, 'beta'),
    });
  }
  if (models.size === 0) throw new Error('Cloudflare model registry has no active models');
  return [...models.values()];
}

export async function fetchCloudflarePublicCatalog(fetchImpl: typeof fetch = fetch): Promise<PublicCatalogModel[]> {
  // Pricing is optional. A missing price row/endpoint can never turn a model's
  // access status into "unknown", or discard an otherwise valid registry.
  const [registry, pricing] = await Promise.all([
    fetchImpl(CLOUDFLARE_MODELS_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }),
    fetchImpl(CLOUDFLARE_PRICING_URL, { headers: { Accept: 'text/markdown' }, signal: AbortSignal.timeout(8_000) })
      .then(async r => r.ok ? await r.text() : '').catch(() => ''),
  ]);
  if (!registry.ok) throw new Error(`Cloudflare model registry failed: ${registry.status}`);
  return parseCloudflareModelRegistry(await registry.json(), pricing);
}
