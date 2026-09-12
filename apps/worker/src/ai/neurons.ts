import type { ModelInfo } from '@vibeflare/shared';

export interface AiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  neurons?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

/** Prefer the billing usage Workers AI returns with an inference response. */
export function usageFromOutput(out: unknown): AiUsage | null {
  if (!out || typeof out !== 'object') return null;
  const usage = (out as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return null;
  return usage as AiUsage;
}

export function actualNeuronsFromOutput(out: unknown): number | null {
  const neurons = usageFromOutput(out)?.neurons;
  return typeof neurons === 'number' && Number.isFinite(neurons) && neurons >= 0 ? neurons : null;
}

/**
 * Estimate neuron cost only when Workers AI does not return usage.neurons.
 * Token rates stored in the catalog are neurons per token (Cloudflare publishes
 * them as neurons per million tokens, converted during catalog sync).
 */
export function estimateNeurons(
  model: ModelInfo,
  tokensIn: number,
  tokensOut: number,
): number {
  if (model.neurons_flat != null && model.neurons_flat > 0) {
    return model.neurons_flat;
  }
  const inputCost = model.neurons_input ?? 1;
  const outputCost = model.neurons_output ?? 2;
  return Math.max(0, tokensIn * inputCost + tokensOut * outputCost);
}

/** Rough token count fallback from raw string: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
