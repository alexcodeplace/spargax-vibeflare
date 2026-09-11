import { useState, useRef } from 'react';
import { Icon } from './Icon';
import { Spinner } from './Spinner';
import { transcribeAudio } from '../../lib/api';

type MicState = 'idle' | 'recording' | 'transcribing';

export interface MicButtonProps {
  onTranscript: (text: string) => void;
  onError?: (msg: string) => void;
  model?: string;
  disabled?: boolean;
}

export function MicButton({ onTranscript, onError, model = '@cf/openai/whisper', disabled }: MicButtonProps) {
  const [state, setState] = useState<MicState>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function handleClick() {
    if (disabled || state === 'transcribing') return;

    if (state === 'recording') {
      recorderRef.current?.stop();
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError?.('Microphone access denied');
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      setState('transcribing');
      const blob = new Blob(chunksRef.current);
      const form = new FormData();
      form.append('file', blob, 'recording.webm');
      form.append('model', model);
      try {
        const result = await transcribeAudio(form);
        onTranscript(result.text);
      } catch (e) {
        onError?.((e as Error).message);
      } finally {
        setState('idle');
      }
    };

    recorder.start();
    setState('recording');
  }

  const isRecording = state === 'recording';
  const isTranscribing = state === 'transcribing';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isTranscribing}
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      className={[
        'inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isRecording
          ? 'bg-[var(--color-danger)] text-[var(--color-accent-text)] animate-pulse'
          : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]',
      ].join(' ')}
    >
      {isTranscribing ? (
        <Spinner size="sm" />
      ) : isRecording ? (
        <Icon name="Square" size="sm" />
      ) : (
        <Icon name="Mic" size="sm" />
      )}
    </button>
  );
}
