import type { ModelInfo } from '@vibeflare/shared';

/**
 * Estimate neuron cost for a request given model D1 row.
 * Falls back to token-count estimate if no billing data in model row.
 */
export function estimateNeurons(
  model: ModelInfo,
  tokensIn: number,
  tokensOut: number
): number {
  if (model.neurons_flat != null && model.neurons_flat > 0) {
    return model.neurons_flat;
  }
  const inputCost = model.neurons_input ?? 1;
  const outputCost = model.neurons_output ?? 2;
  return Math.ceil(tokensIn * inputCost + tokensOut * outputCost);
}

/** Rough token count from raw string: ~4 chars per token */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
