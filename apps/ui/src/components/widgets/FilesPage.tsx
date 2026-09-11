import { useEffect, useState } from 'react';
import { Card } from '../primitives/Card';
import { Button } from '../primitives/Button';
import { Badge } from '../primitives/Badge';
import { Spinner } from '../primitives/Spinner';
import { Icon } from '../primitives/Icon';
import { Toast, ToastProvider } from '../primitives/Toast';
import { HydratedIsland } from '../HydratedIsland';
import { FileDropzone } from './FileDropzone';
import { listFiles, deleteFile, type FileRecord } from '../../lib/api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isImage = (mime: string) => mime.startsWith('image/');

/**
 * Files page content: gallery of uploaded files as cards with image previews.
 * Wrapped in HydratedIsland — mount via AppShell.astro in files.astro.
 */
function FilesPageInner() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; title: string; variant: 'success' | 'danger' }>({
    open: false, title: '', variant: 'success',
  });

  useEffect(() => {
    listFiles()
      .then((loaded) => { setFiles(loaded); setLoadError(null); })
      .catch((reason: Error) => { setFiles([]); setLoadError(reason.message); })
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string, name: string) {
    setDeleting(id);
    try {
      await deleteFile(id);
      setFiles(prev => prev.filter(f => f.id !== id));
      setToast({ open: true, title: `Deleted ${name}`, variant: 'success' });
    } catch (e) {
      setToast({ open: true, title: (e as Error).message, variant: 'danger' });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <ToastProvider>
      <div data-testid="files-page" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Uploaded Files</h2>
            <p className="text-sm text-[var(--color-muted)]">Files are private to your account and available to chat workflows.</p>
          </div>
        </div>

        <FileDropzone
          className="min-h-[120px]"
          onUploaded={(record) => {
            setFiles((previous) => [record, ...previous.filter((file) => file.id !== record.id)]);
            setToast({ open: true, title: `Uploaded ${record.name}`, variant: 'success' });
          }}
        />

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : loadError ? (
          <Badge variant="danger">Could not load files: {loadError}</Badge>
        ) : files.length === 0 ? (
          <p data-testid="files-empty" className="text-sm text-[var(--color-muted)]">No files uploaded.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map(f => (
              <Card key={f.id} variant="outlined" className="overflow-hidden">
                <div className="aspect-[4/3] bg-[var(--color-surface)] relative flex items-center justify-center">
                  <Icon name="Image" size="lg" className="text-[var(--color-muted)]" />
                  {isImage(f.mime) && (
                    <img
                      src={`/admin/files/${f.id}/thumbnail`}
                      alt={f.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      width={4}
                      height={3}
                      style={{ aspectRatio: '4/3' }}
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">{f.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="neutral" size="sm">{formatBytes(f.size)}</Badge>
                      <Badge variant="neutral" size="sm">{f.mime}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">
                    Added {new Date(f.created_at).toLocaleDateString()}
                  </p>
                  <div className="flex justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Icon name="Download" size="sm" />}
                      onClick={() => { window.open(`/admin/files/${f.id}/download`, '_blank'); }}
                    >
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={deleting === f.id}
                      leftIcon={<Icon name="Trash2" size="sm" />}
                      onClick={() => handleDelete(f.id, f.name)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Toast
        open={toast.open}
        onOpenChange={o => setToast(t => ({ ...t, open: o }))}
        title={toast.title}
        variant={toast.variant}
      />
    </ToastProvider>
  );
}

export function FilesPage() {
  return (
    <HydratedIsland>
      <FilesPageInner />
    </HydratedIsland>
  );
}
