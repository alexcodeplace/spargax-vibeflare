export const NEURONS_PER_MODEL: Record<string, { input: number; output: number; flat?: number }> = {
  // Populated dynamically by sync_models cron; static fallback shipped here.
};

export function estimateNeurons(model: string, inputTokens: number, outputTokens: number): number {
  const cost = NEURONS_PER_MODEL[model];
  if (!cost) return 1; // safe min
  if (cost.flat) return cost.flat;
  return Math.ceil(inputTokens * cost.input + outputTokens * cost.output);
}
