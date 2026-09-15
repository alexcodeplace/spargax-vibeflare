import { useEffect, useState, useRef } from 'react';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { Card } from '../primitives/Card';
import { createChat, getChatMessages, notifyQuotaChanged, transcribeAudio } from '../../lib/api';
import { parseHistoryMetadata, supportsAudioFile, LIVE_AUDIO_MESSAGE, audioFileProblem, AUDIO_FILE_ACCEPT, MAX_AUDIO_BYTES, type HistoryMetadata } from '@vibeflare/shared';
import { cacheCreatedChat, refreshChats } from '../../lib/api/chats';
import { HistoryAttachments } from './HistoryAttachments';
import { FileDropzone } from './FileDropzone';

export interface AudioTranscribePanelProps {
  model: string;
  inputOnly?: boolean;
  history?: Array<{ id: string; role: 'user' | 'assistant'; content: string; attachments?: HistoryMetadata | null }>;
  ensureChat?: (title: string, signal: AbortSignal) => Promise<string>;
  onSaved?: (id: string, signal: AbortSignal) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  onCompleted?: () => void;
}

export function AudioTranscribePanel({ model, inputOnly = false, history, ensureChat, onSaved, onBusyChange, onCompleted }: AudioTranscribePanelProps) {
  const [loading, setLoading] = useState(false);
  const ownChatId = useRef<string | null>(null);
  const [ownHistory, setOwnHistory] = useState<NonNullable<AudioTranscribePanelProps['history']>>([]);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); }; }, []);
  const compatible = !!model && supportsAudioFile(model);

  function chooseAudio(files: File[]) {
    const next = files[0];
    if (!next) return;
    const problem = audioFileProblem(next);
    if (problem) throw new Error(problem);
    setFile(next); setError(null);
  }

  async function handleTranscribe() {
    if (!file || !model || active.current) return;
    const problem = !supportsAudioFile(model) ? LIVE_AUDIO_MESSAGE : audioFileProblem(file);
    if (problem) { setError(problem); return; }
    const controller = new AbortController();
    active.current = controller;
    setLoading(true); onBusyChange?.(true); setError(null);
    const form = new FormData();
    form.append('file', file, file.name); form.append('model', model);
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
      notifyQuotaChanged(); setFile(null); setLoading(false); onBusyChange?.(false); active.current = null; onCompleted?.();
    } catch (cause) {
      if (mounted.current) setError(controller.signal.aborted ? 'Transcription stopped. Your file is still selected for another try.' : cause instanceof Error ? cause.message : 'Transcription failed. Try another file or model.');
    } finally {
      active.current = null;
      if (mounted.current) { setLoading(false); onBusyChange?.(false); }
    }
  }

  return <div className="vf-audio-panel">
    <div className="vf-composer-wrap vf-audio-composer">
      <FileDropzone label="Audio file" hint="Drop a recording or browse · MP3, WAV, M4A, OGG, WebM, FLAC · up to 25 MB"
        accept={AUDIO_FILE_ACCEPT} maxBytes={MAX_AUDIO_BYTES} onFiles={chooseAudio} disabled={loading}
        selectedName={file?.name ?? null} className="vf-audio-dropzone" />
      <div className="vf-audio-selection" aria-live="polite">
        {file ? <><span>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span><button type="button" disabled={loading} className="vf-file-remove" onClick={() => setFile(null)}>Remove audio file</button></> : <p>Choose a file above. It is sent to the model only when you press Transcribe.</p>}
      </div>
      <div className="vf-audio-actions">
        <span>{loading ? 'Transcribing…' : 'Your transcript is saved in History.'}</span>
        {loading ? <Button variant="outline" onClick={() => active.current?.abort()}>Stop</Button> : <Button variant="primary" disabled={!file || !compatible} onClick={handleTranscribe} leftIcon={<Icon name="Upload" size="sm" />}>Transcribe</Button>}
      </div>
    </div>
    {(error || !compatible) && <p role={error ? 'alert' : 'status'} className={`vf-inline-notice ${error ? 'vf-inline-notice--error' : ''}`}>
      {error ?? (model ? LIVE_AUDIO_MESSAGE : 'Choose a file-compatible audio model above. Enable Whisper or Nova-3 in Settings if none are selected.')}
    </p>}
    {!inputOnly && <div className="vf-task-results">{(history ?? ownHistory).map(message => <Card key={message.id} variant="outlined" className="space-y-3 p-4">
      <p className="text-xs text-[var(--color-muted)]">{message.role === 'assistant' ? 'Transcript' : 'Audio input'}</p>
      <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{message.content}</p>
      <HistoryAttachments metadata={message.attachments} prompt={message.content} />
    </Card>)}</div>}
  </div>;
}
