import { useEffect, useMemo, useRef, useState } from 'react';
import { createEmbeddings, notifyQuotaChanged } from '../../lib/api';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Textarea } from '../primitives/Textarea';

export interface EmbeddingSimilarityPanelProps {
  model: string;
  ensureChat: (title: string, signal: AbortSignal) => Promise<string>;
  onSaved: (id: string, signal: AbortSignal) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}

export function EmbeddingSimilarityPanel({ model, ensureChat, onSaved, onBusyChange }: EmbeddingSimilarityPanelProps) {
  const [query, setQuery] = useState('');
  const [comparisons, setComparisons] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  const candidates = useMemo(
    () => comparisons.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
    [comparisons],
  );

  async function runTest(event: { preventDefault(): void }) {
    event.preventDefault();
    if (active.current) return;
    const queryText = query.trim();
    if (!model) { setError('Choose an embedding model first.'); return; }
    if (!queryText) { setError('Enter a query to compare.'); return; }
    if (candidates.length < 2) { setError('Add at least two comparison texts, one per line.'); return; }
    if (candidates.length > 8) { setError('Use at most eight comparison texts per test.'); return; }

    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError(null);
    onBusyChange?.(true);
    try {
      const title = `Embedding test: ${queryText.replace(/\s+/g, ' ').slice(0, 72)}`;
      const id = await ensureChat(title, controller.signal);
      await createEmbeddings(model, [queryText, ...candidates], id, true, controller.signal);
      await onSaved(id, controller.signal);
      if (!controller.signal.aborted) notifyQuotaChanged();
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Similarity test failed. Try again or choose another embedding model.');
      }
    } finally {
      active.current = null;
      if (mounted.current) {
        setLoading(false);
        onBusyChange?.(false);
      }
    }
  }

  return (
    <Card variant="outlined" className="vf-embedding-test" data-testid="embedding-similarity-test">
      <div className="vf-embedding-test-copy">
        <h2>Test semantic similarity</h2>
        <p>Embed one query and several texts together, then rank them by cosine similarity. Higher scores mean closer direction, not probability.</p>
      </div>
      <form className="vf-embedding-test-form" onSubmit={runTest}>
        <Textarea
          label="Query"
          fullWidth
          rows={2}
          maxLength={2000}
          value={query}
          disabled={loading}
          placeholder="How do I get a refund?"
          onChange={event => setQuery(event.target.value)}
        />
        <Textarea
          label="Comparison texts"
          fullWidth
          rows={5}
          maxLength={8000}
          value={comparisons}
          disabled={loading}
          placeholder={'How can I get my money back?\nOur office opens at 9 AM.\nReturns are accepted within 30 days.'}
          onChange={event => setComparisons(event.target.value)}
        />
        <div className="vf-embedding-test-actions">
          <span>{candidates.length}/8 comparison texts · one per line</span>
          <Button type="submit" loading={loading} disabled={loading || !model}>Run similarity test</Button>
        </div>
      </form>
      {error && <p role="alert" className="vf-inline-notice vf-inline-notice--error">{error}</p>}
      {!model && !error && <p role="status" className="vf-inline-notice">Choose an embedding model above to run a live test.</p>}
    </Card>
  );
}
