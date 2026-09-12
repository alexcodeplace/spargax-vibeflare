import { describe, expect, it } from 'vitest';
import { parseCloudflareModelsHtml, parseNeuronPricing } from '../src/models/public_catalog';

describe('Cloudflare public model catalog parser', () => {
  it('extracts model ids/tasks and exact token-to-neuron rates from public docs', () => {
    const html = `
      <div data-models-cell data-model-id="@cf/meta/llama-3.2-3b-instruct" data-model-task="Text Generation" data-model-author="Meta" data-model-href="/workers-ai/models/llama-3.2-3b-instruct/" data-model-pricing="$0.051" data-model-capabilities=""></div>
      <div data-models-cell data-model-id="@cf/black-forest-labs/flux-1-schnell" data-model-task="Text-to-Image" data-model-author="Black Forest Labs" data-model-href="/workers-ai/models/flux-1-schnell/" data-model-pricing="$0.0000528" data-model-capabilities=""></div>
      <div data-models-cell data-model-id="@hf/google/gemma-7b-it" data-model-task="Text Generation" data-model-author="Google" data-model-href="/workers-ai/models/gemma-7b-it/" data-model-pricing="" data-model-capabilities=""></div>
    `;
    const pricing = `
| Model | Price in Tokens | Price in Neurons |
| @cf/meta/llama-3.2-3b-instruct | $0.051 per M input tokens $0.335 per M output tokens | 4625 neurons per M input tokens 30475 neurons per M output tokens |
| @cf/black-forest-labs/flux-1-schnell | image | 4.80 neurons per 512x512 tile 9.60 neurons per step |
`;
    const models = parseCloudflareModelsHtml(html, pricing);
    expect(models).toHaveLength(3);
    expect(models[0]).toMatchObject({
      name: '@cf/meta/llama-3.2-3b-instruct',
      task: 'text-generation',
      author: 'Meta',
      neuronsInput: 0.004625,
      neuronsOutput: 0.030475,
    });
    expect(models[1]).toMatchObject({
      name: '@cf/black-forest-labs/flux-1-schnell',
      task: 'text-to-image',
      neuronsInput: null,
      neuronsOutput: null,
    });
    expect(models[2]).toMatchObject({ name: '@hf/google/gemma-7b-it', task: 'text-generation' });
  });

  it('deduplicates model cells and ignores unrelated markup', () => {
    const html = `
      <span data-model-id="not-a-cell">ignored</span>
      <div data-models-cell data-model-id="@cf/openai/whisper" data-model-task="Automatic Speech Recognition" data-model-author="OpenAI"></div>
      <div data-models-cell data-model-id="@cf/openai/whisper" data-model-task="Automatic Speech Recognition" data-model-author="OpenAI"></div>
    `;
    expect(parseCloudflareModelsHtml(html)).toEqual([
      expect.objectContaining({ name: '@cf/openai/whisper', task: 'automatic-speech-recognition' }),
    ]);
  });

  it('parses comma-formatted neuron rates', () => {
    const rates = parseNeuronPricing('| @cf/test/model | price | 45,170 neurons per M input tokens 443,756 neurons per M output tokens |');
    expect(rates.get('@cf/test/model')).toMatchObject({ input: 0.04517, output: 0.443756 });
  });
});
