import { useState, useRef } from 'react';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { Badge } from '../primitives/Badge';
import { Card } from '../primitives/Card';
import { transcribeAudio } from '../../lib/api';

export interface AudioTranscribePanelProps {
  model: string;
}

export function AudioTranscribePanel({ model }: AudioTranscribePanelProps) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleTranscribe() {
    const file = fileRef.current?.files?.[0];
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    setTranscript(null);
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('model', model || '@cf/openai/whisper');
    try {
      const result = await transcribeAudio(form);
      setTranscript(result.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileName(file?.name ?? null);
    setTranscript(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex flex-col gap-3 p-4">
        <label className="block">
          <span className="text-sm text-[var(--color-muted)] block mb-1">Audio file</span>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-[var(--color-text)] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-[var(--color-surface)] file:text-[var(--color-text)] file:border file:border-[var(--color-border)] hover:file:opacity-80 cursor-pointer"
          />
        </label>
        {!model && (
          <Badge variant="warn">Select a model above first</Badge>
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={!fileName || loading}
          loading={loading}
          onClick={handleTranscribe}
          leftIcon={<Icon name="Upload" size="sm" />}
        >
          Transcribe
        </Button>
        {error && <Badge variant="danger">{error}</Badge>}
      </div>

      {transcript !== null && (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <Card variant="outlined" className="p-4">
            <p className="text-xs text-[var(--color-muted)] mb-2">Transcript</p>
            <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{transcript}</p>
          </Card>
        </div>
      )}

      {transcript === null && !loading && !error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[var(--color-muted)]">Upload an audio file to transcribe.</p>
        </div>
      )}
    </div>
  );
}
