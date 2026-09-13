import { useEffect, useState, useRef } from 'react';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { Badge } from '../primitives/Badge';
import { Card } from '../primitives/Card';
import { createChat, getChatMessages, notifyQuotaChanged, transcribeAudio } from '../../lib/api';
import { parseHistoryMetadata, type HistoryMetadata } from '@vibeflare/shared';
import { cacheCreatedChat, refreshChats } from '../../lib/api/chats';
import { HistoryAttachments } from './HistoryAttachments';

export interface AudioTranscribePanelProps {
  model: string;
  history?: Array<{ id: string; role: 'user' | 'assistant'; content: string; attachments?: HistoryMetadata | null }>;
  ensureChat?: (title: string, signal: AbortSignal) => Promise<string>;
  onSaved?: (id: string, signal: AbortSignal) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}

export function AudioTranscribePanel({ model, history, ensureChat, onSaved, onBusyChange }: AudioTranscribePanelProps) {
  const [loading, setLoading] = useState(false);
  const ownChatId = useRef<string | null>(null);
  const [ownHistory, setOwnHistory] = useState<NonNullable<AudioTranscribePanelProps['history']>>([]);
  const visibleHistory = history ?? ownHistory;
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function handleTranscribe() {
    const file = fileRef.current?.files?.[0];
    if (!file || !model || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    onBusyChange?.(true);
    setError(null);
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('model', model);
    try {
      let id = ensureChat ? await ensureChat(`Transcribe ${file.name}`, controller.signal) : ownChatId.current;
      if (!id) {
        const chat = await createChat(`Transcribe ${file.name}`, model, controller.signal);
        id = chat.id; ownChatId.current = id; await cacheCreatedChat(chat);
      }
      await transcribeAudio(form, id, controller.signal);
      if (onSaved) await onSaved(id, controller.signal);
      else {
        const result = await getChatMessages(id, controller.signal);
        if (!controller.signal.aborted) setOwnHistory(result.messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message => ({ id: message.id, role: message.role as 'user' | 'assistant', content: message.content, attachments: parseHistoryMetadata(message.attachments) })));
        refreshChats();
      }
      if (controller.signal.aborted) return;
      notifyQuotaChanged();
      if (fileRef.current) fileRef.current.value = '';
      setFileName(null);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Transcription failed');
    } finally {
      if (!controller.signal.aborted) { setLoading(false); onBusyChange?.(false); }
      active.current = null;
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-3 p-4">
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">Audio file</span>
          <input ref={fileRef} type="file" accept="audio/*" disabled={loading}
            onChange={e => { setFileName(e.target.files?.[0]?.name ?? null); setError(null); }}
            className="block w-full cursor-pointer text-sm text-[var(--color-text)] file:mr-3 file:rounded-md file:border file:border-[var(--color-border)] file:bg-[var(--color-surface)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text)]" />
        </label>
        {!model && <Badge variant="warn">Select a model above first</Badge>}
        <Button variant="primary" size="sm" disabled={!fileName || !model || loading} loading={loading} onClick={handleTranscribe} leftIcon={<Icon name="Upload" size="sm" />}>Transcribe</Button>
        {error && <Badge variant="danger">{error}</Badge>}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        {visibleHistory.map(message => <Card key={message.id} variant="outlined" className="space-y-3 p-4">
          <p className="text-xs text-[var(--color-muted)]">{message.role === 'assistant' ? 'Transcript' : 'Audio input'}</p>
          <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{message.content}</p>
          <HistoryAttachments metadata={message.attachments} prompt={message.content} />
        </Card>)}
        {!visibleHistory.length && !loading && <p className="text-sm text-[var(--color-muted)]">Upload an audio file to transcribe. Your audio and transcript will be saved in history.</p>}
      </div>
    </div>
  );
}
