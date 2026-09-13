import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Card } from '../primitives/Card';
import { Button } from '../primitives/Button';
import { Spinner } from '../primitives/Spinner';
import { Badge } from '../primitives/Badge';
import { Icon } from '../primitives/Icon';
import { uploadFile, type FileRecord } from '../../lib/api';

export interface FileDropzoneProps {
  onUploaded?: (file: FileRecord) => void;
  accept?: string;
  className?: string;
}

type State = 'idle' | 'dragging' | 'uploading' | 'done' | 'error';

function isImageFile(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

/**
 * Drag-and-drop + click file upload. POSTs to /admin/files via api.ts.
 * Shows image preview when an image file is uploaded.
 */
export function FileDropzone({ onUploaded, accept, className }: FileDropzoneProps) {
  const [state, setState] = useState<State>('idle');
  const [fileName, setFileName] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function handleFile(file: File) {
    if (state === 'uploading') return;
    setFileName(file.name);
    setState('uploading');
    setErrorMsg('');
    setPreviewUrl('');
    try {
      const record = await uploadFile(file);
      if (isImageFile(file.name)) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }
      setState('done');
      onUploaded?.(record);
    } catch (e) {
      setErrorMsg((e as Error).message);
      setState('error');
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (state === 'uploading') return;
    setState('idle');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (state !== 'uploading') setState('dragging');
  }

  function onDragLeave() {
    if (state === 'dragging') setState('idle');
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }

  const isDragging = state === 'dragging';

  return (
    <Card
      variant="outlined"
      className={[
        'p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors border-dashed overflow-hidden',
        isDragging ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5' : '',
        className ?? '',
      ].join(' ')}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <input
        ref={inputRef}
        type="file"
        data-testid="file-upload-input"
        accept={accept}
        aria-label="Choose a file to upload"
        disabled={state === 'uploading'}
        className="hidden"
        onChange={onInputChange}
      />

      <Button type="button" disabled={state === 'uploading'} onClick={() => inputRef.current?.click()}>Choose a file</Button>
      <p role="status" aria-live="polite" aria-atomic="true">{state === 'uploading' ? `Uploading ${fileName}` : state === 'done' ? `Uploaded ${fileName}` : ''}</p>
      {state === 'uploading' && <Spinner size="md" />}
      {state === 'error' && <div role="alert"><Badge variant="danger">{errorMsg}</Badge></div>}
      {state === 'done' && previewUrl && (
        <img
          src={previewUrl}
          alt={fileName}
          className="w-full h-auto object-contain rounded-md"
          width={4}
          height={3}
        />
      )}
      {state === 'done' && !previewUrl && (
        <Badge variant="success">Uploaded: {fileName}</Badge>
      )}
      {(state === 'idle' || state === 'dragging') && (
        <>
          <Icon name="Upload" size="lg" className="text-[var(--color-accent)]" />
          <p className="text-sm text-[var(--color-muted)]">
            {isDragging ? 'Drop to upload' : 'Drag and drop a file, or use the Choose a file button'}
          </p>
        </>
      )}
    </Card>
  );
}
