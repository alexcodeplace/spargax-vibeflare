import { useState } from 'react';
import type { HistoryFile, HistoryMetadata } from '@vibeflare/shared';

function SavedImage({ file, prompt }: { file: HistoryFile; prompt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <p role="status">This image is no longer available in your files.</p> : (
    <img src={`/admin/files/${encodeURIComponent(file.id)}/thumbnail`} alt={prompt} loading="lazy" className="h-auto max-h-[70vh] max-w-full rounded-xl object-contain" onError={() => setFailed(true)} />
  );
}

/** Only server-issued file IDs become same-origin, authenticated URLs. */
export function HistoryAttachments({ metadata, prompt }: { metadata?: HistoryMetadata | null; prompt: string }) {
  if (!metadata?.files.length) return null;
  return <div className="space-y-3" data-testid="saved-media-result">
    {metadata.files.map(file => <div key={file.id} className="min-w-0 space-y-2">
      {file.kind === 'image' && <SavedImage file={file} prompt={prompt} />}
      {file.kind === 'audio' && <audio controls preload="metadata" aria-label={file.name} src={`/admin/files/${encodeURIComponent(file.id)}/thumbnail`} className="max-w-full" />}
      <a href={`/admin/files/${encodeURIComponent(file.id)}/download`} download className="inline-block text-sm underline underline-offset-4">
        {file.kind === 'embeddings' ? 'Download full embeddings (JSON)' : `Download ${file.name}`}
      </a>
    </div>)}
  </div>;
}
