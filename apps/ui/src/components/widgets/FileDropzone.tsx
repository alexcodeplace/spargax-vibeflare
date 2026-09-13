import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { Icon } from '../primitives/Icon';
import { Spinner } from '../primitives/Spinner';
import { uploadFile, type FileRecord } from '../../lib/api';
import { fileMatchesAccept } from '../../lib/file-input';

export interface FileDropzoneProps {
  onUploaded?: (file: FileRecord) => void;
  /** A task-specific consumer. With this callback there is no implicit upload. */
  onFiles?: (files: File[]) => void | Promise<void>;
  accept?: string;
  maxBytes?: number;
  disabled?: boolean;
  label?: string;
  hint?: string;
  selectedName?: string | null;
  compact?: boolean;
  className?: string;
}

/** One accessible file picker for drops, browse, keyboard and task validation.
 * The default behavior preserves the Files page upload contract. Task panels
 * consume the actual File instead, so audio/text are not silently discarded.
 */
export function FileDropzone({ onUploaded, onFiles, accept, maxBytes = 25 * 1024 * 1024, disabled = false,
  label = 'Choose file', hint = 'Drag & drop or click to select a file', selectedName, compact = false, className = '' }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [doneName, setDoneName] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const hintId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(files: File[]) {
    setDragging(false);
    if (disabled || inFlight.current) return;
    setError('');
    if (files.length !== 1) { setError('Choose one file at a time.'); return; }
    const file = files[0]!;
    if (!fileMatchesAccept(file, accept)) { setError(`This file type is not supported here. ${hint}`); return; }
    if (!file.size) { setError('This file is empty. Choose a file with content.'); return; }
    if (file.size > maxBytes) { setError(`This file is too large. ${hint}`); return; }
    inFlight.current = true;
    setWorking(true);
    try {
      if (onFiles) await onFiles([file]);
      else {
        const record = await uploadFile(file);
        onUploaded?.(record);
        if (mounted.current && file.type.startsWith('image/') && !file.type.includes('svg')) setPreview(URL.createObjectURL(file));
      }
      if (mounted.current) setDoneName(file.name);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'The file could not be read. Try again.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setWorking(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); event.stopPropagation();
    void choose(Array.from(event.dataTransfer.files));
  }
  // Task inputs retain their selected file. The general Files uploader resets
  // to its prompt after upload; the new file is represented by its gallery row.
  const selected = selectedName === undefined ? (onFiles ? doneName : '') : selectedName;
  return <div className={`vf-dropzone ${compact ? 'vf-dropzone--compact' : ''} ${className}`} data-testid="file-dropzone"
    data-dragging={dragging ? 'true' : 'false'} aria-busy={working}
    onDragEnter={event => { event.preventDefault(); if (!disabled && !working) setDragging(true); }}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled || working ? 'none' : 'copy'; }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={drop}>
    <input ref={inputRef} type="file" data-testid="file-upload-input" aria-label={label} aria-describedby={hintId}
      accept={accept} disabled={disabled || working} className="sr-only" tabIndex={-1}
      onChange={event => { const files = Array.from(event.target.files ?? []); if (files.length) void choose(files); }} />
    <button type="button" className="vf-dropzone-picker" aria-label={`Browse: ${label}`} aria-describedby={hintId}
      disabled={disabled || working} onClick={() => inputRef.current?.click()}>
      {working ? <Spinner size="sm" /> : <Icon name="Upload" size="md" />}
      <span className="vf-dropzone-copy"><strong>{working ? (onFiles ? 'Reading file…' : 'Uploading…') : dragging ? 'Drop your file here' : selected || label}</strong>
        <span id={hintId}>{hint}</span></span>
      <span className="vf-dropzone-browse" aria-hidden="true">Browse</span>
    </button>
    {error && <p role="alert" className="vf-inline-notice vf-inline-notice--error">{error}</p>}
    {!onFiles && doneName && !working && !error && <span role="status" className="vf-file-status">Uploaded: {doneName}</span>}
    {!onFiles && preview && <img src={preview} alt={doneName} className="max-h-40 max-w-full rounded-lg object-contain" />}
  </div>;
}
