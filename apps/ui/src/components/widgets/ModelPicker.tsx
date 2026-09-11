import { useEffect, useState } from 'react';
import { Select } from '../primitives/Select';
import { Spinner } from '../primitives/Spinner';
import { Badge } from '../primitives/Badge';
import { listModels, type ModelInfo } from '../../lib/api';

export interface ModelPickerProps {
  onChange?: (modelId: string, task: string) => void;
  task?: string;
}

const PREFERRED_TEXT_MODELS = [
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/meta/llama-3.1-8b-instruct',
] as const;

export function chooseDefaultModel(models: ModelInfo[], task?: string): ModelInfo | undefined {
  if (task === 'text-generation') {
    for (const name of PREFERRED_TEXT_MODELS) {
      const preferred = models.find((model) => model.name === name);
      if (preferred) return preferred;
    }
  }
  return models[0];
}

export function ModelPicker({ onChange, task }: ModelPickerProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    setLoading(true);
    listModels()
      .then(setModels)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = task ? models.filter(m => m.task === task) : models;

  useEffect(() => {
    if (loading) return;
    const first = chooseDefaultModel(filtered, task);
    if (!first) {
      if (selected) {
        setSelected('');
        onChange?.('', task ?? '');
      }
      return;
    }
    if (selected && filtered.some(m => m.name === selected)) return;
    setSelected(first.name);
    onChange?.(first.name, first.task);
  }, [task, loading, models]);

  if (error) return <div className="flex h-8 items-center"><Badge variant="danger">Failed to load models</Badge></div>;
  if (loading) return <div className="flex h-8 items-center"><Spinner size="sm" /></div>;

  function handleSelect(val: string) {
    setSelected(val);
    const model = models.find(m => m.name === val);
    onChange?.(val, model?.task ?? '');
  }

  return (
    <Select
      placeholder="Select a Model…"
      options={filtered.map(m => ({ value: m.name, label: m.name }))}
      value={selected}
      onValueChange={handleSelect}
      className="w-full"
    />
  );
}
