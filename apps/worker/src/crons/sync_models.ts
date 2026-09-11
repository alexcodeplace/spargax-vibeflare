import type { Env } from '../env';
import { upsertModel, disableDelistedModels, rearmDisabledModels } from '../db/queries';

/** How long a model stays disabled after its last failure before traffic is sent to it again. */
const FAILURE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function syncModels(
  env: Env
): Promise<{ count: number; delisted: number; rearmed: number }> {
  const syncedAt = Date.now();
  let page = 1;
  let count = 0;
  while (true) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/models/search?page=${page}&per_page=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`models sync failed: ${res.status} — ${body.slice(0, 200)}. Set CF_API_TOKEN secret with Workers AI Read scope.`);
    }
    const data = await res.json() as {
      result: Array<{
        name: string;
        task?: { name?: string };
        description?: string;
        properties?: Array<{ property_id: string; value: string }>;
      }>;
    };
    for (const m of data.result) {
      const props = m.properties ?? [];
      const beta = props.find((p) => p.property_id === 'beta')?.value === 'true' ? 1 : 0;
      const neuronsInput = props.find((p) => p.property_id === 'input_cost');
      const neuronsOutput = props.find((p) => p.property_id === 'output_cost');
      const neuronsFlat = props.find((p) => p.property_id === 'flat_cost');
      await upsertModel(env.DB, {
        name: m.name,
        task: (m.task?.name ?? 'unknown').toLowerCase().replace(/\s+/g, '-'),
        description: m.description ?? null,
        properties: JSON.stringify(props),
        neurons_input: neuronsInput ? Number(neuronsInput.value) : null,
        neurons_output: neuronsOutput ? Number(neuronsOutput.value) : null,
        neurons_flat: neuronsFlat ? Number(neuronsFlat.value) : null,
        beta,
        enabled: 1,
        synced_at: syncedAt,
      });
      count++;
    }
    if (data.result.length < 100) break;
    page++;
  }
  const rearmed = await rearmDisabledModels(env.DB, syncedAt, syncedAt - FAILURE_COOLDOWN_MS);
  const delisted = await disableDelistedModels(env.DB, syncedAt);
  return { count, delisted, rearmed };
}
