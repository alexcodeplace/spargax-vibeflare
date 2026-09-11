import { describe, expect, it } from 'vitest';
import { chooseDefaultModel } from '../../src/components/widgets/ModelPicker';
import type { ModelInfo } from '../../src/lib/api';

function model(name: string, task = 'text-generation'): ModelInfo {
  return { name, task } as ModelInfo;
}

describe('chooseDefaultModel', () => {
  it('prefers the live-proven text model over catalog order', () => {
    const models = [
      model('@cf/aisingapore/gemma-sea-lion-v4-27b-it'),
      model('@cf/meta/llama-3.2-3b-instruct'),
    ];
    expect(chooseDefaultModel(models, 'text-generation')?.name).toBe('@cf/meta/llama-3.2-3b-instruct');
  });

  it('falls back to the first available model when no preferred model exists', () => {
    const models = [model('@cf/example/first'), model('@cf/example/second')];
    expect(chooseDefaultModel(models, 'text-generation')?.name).toBe('@cf/example/first');
  });
});
