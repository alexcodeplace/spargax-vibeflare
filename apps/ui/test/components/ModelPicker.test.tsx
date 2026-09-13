import { describe, expect, it } from 'vitest';
import {
  chooseDefaultModel,
  modelLabelForPicker,
  sortModelsForPicker,
} from '../../src/components/widgets/ModelPicker';
import type { ModelInfo } from '../../src/lib/api';

function model(name: string, task = 'text-generation', paidRequired = false): ModelInfo {
  return { name, task, paid_required: paidRequired };
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

  it('keeps free models ahead of paid-required models even when paid models are included', () => {
    const models = [
      model('@cf/deepseek-ai/deepseek-v4-flash-0731', 'text-generation', true),
      model('@cf/example/free'),
    ];
    expect(sortModelsForPicker(models, 'text-generation').map((item) => item.name)).toEqual([
      '@cf/example/free',
      '@cf/deepseek-ai/deepseek-v4-flash-0731',
    ]);
  });

  it('keeps preferred models first while retaining every other free model alphabetically', () => {
    const models = [
      model('@cf/z/example-z'),
      model('@cf/qwen/qwen2.5-coder-32b-instruct'),
      model('@cf/a/example-a'),
      model('@cf/meta/llama-3.2-3b-instruct'),
      model('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
    ];
    expect(sortModelsForPicker(models, 'text-generation').map((item) => item.name)).toEqual([
      '@cf/meta/llama-3.2-3b-instruct',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/qwen/qwen2.5-coder-32b-instruct',
      '@cf/a/example-a',
      '@cf/z/example-z',
    ]);
  });

  it('marks paid-required models with a dollar emoji in the selector label', () => {
    expect(modelLabelForPicker(model('@cf/deepseek-ai/deepseek-v4-flash-0731', 'text-generation', true)))
      .toBe('💲 Paid · @cf/deepseek-ai/deepseek-v4-flash-0731');
    expect(modelLabelForPicker(model('@cf/meta/llama-3.2-3b-instruct')))
      .toBe('@cf/meta/llama-3.2-3b-instruct');
  });

  it('never displays internal billing uncertainty or selects an unresolved row', () => {
    const missing: ModelInfo = { name: '@cf/test/legacy', task: 'text-generation', paid_required: null };
    const usable = model('@cf/test/usable');
    expect(modelLabelForPicker(missing)).not.toMatch(/unknown|unverified/i);
    expect(sortModelsForPicker([missing, usable])).toEqual([usable]);
    expect(chooseDefaultModel([missing])).toBeUndefined();
  });

  it('prefers FLUX Schnell for image generation without hiding the rest', () => {
    const models = [
      model('@cf/example/other-image', 'text-to-image'),
      model('@cf/black-forest-labs/flux-1-schnell', 'text-to-image'),
    ];
    expect(chooseDefaultModel(models, 'text-to-image')?.name).toBe('@cf/black-forest-labs/flux-1-schnell');
  });
  it('uses file-compatible audio models without changing the billing or global catalog order', () => {
    const rows = [model('@cf/deepgram/flux', 'automatic-speech-recognition'), model('@cf/deepgram/nova-3', 'automatic-speech-recognition'), model('@cf/openai/whisper', 'automatic-speech-recognition')];
    expect(chooseDefaultModel(rows, 'automatic-speech-recognition')?.name).toBe('@cf/openai/whisper');
    expect(sortModelsForPicker(rows, 'automatic-speech-recognition').some(item => item.name === '@cf/deepgram/flux')).toBe(false);
    expect(sortModelsForPicker(rows).some(item => item.name === '@cf/deepgram/flux')).toBe(true);
    expect(chooseDefaultModel([rows[0]!], 'automatic-speech-recognition')).toBeUndefined();
  });

});
