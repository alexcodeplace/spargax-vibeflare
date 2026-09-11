import { useEffect, useState } from 'react';
import { Card } from '../primitives/Card';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { Checkbox } from '../primitives/Checkbox';
import { Dialog } from '../primitives/Dialog';
import { CodeBlock } from '../primitives/CodeBlock';
import { Spinner } from '../primitives/Spinner';
import { Toast, ToastProvider } from '../primitives/Toast';
import { KeyRow } from './KeyRow';
import { HydratedIsland } from '../HydratedIsland';
import { useKeys, useCreateKey, type ApiKey } from '../../lib/api/keys';
import { me } from '../../lib/api';

/**
 * Keys management page: list keys, create new key via Dialog,
 * show secret once in CodeBlock.
 */
function KeysPageInner() {
  const { data: keys = [], isPending } = useKeys();
  const createKey = useCreateKey();
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'user' | null>(null);
  const [toast, setToast] = useState<{ open: boolean; title: string; variant: 'success' | 'danger' }>({
    open: false, title: '', variant: 'success',
  });

  useEffect(() => {
    me().then((user) => setRole(user.role)).catch(() => setRole(null));
  }, []);

  async function handleCreate() {
    if (!label.trim()) return;
    try {
      const result = await createKey.mutateAsync({ label: label.trim(), isAdmin });
      setNewSecret((result as ApiKey & { full?: string; secret?: string }).full ?? (result as { secret?: string }).secret ?? null);
      setCreateOpen(false);
      setLabel('');
      setIsAdmin(false);
    } catch (e) {
      setToast({ open: true, title: (e as Error).message, variant: 'danger' });
    }
  }

  return (
    <ToastProvider>
      <div data-testid="keys-page" className="space-y-4 max-w-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">API Keys</h2>
            <Dialog
              open={createOpen}
              onOpenChange={setCreateOpen}
              trigger={
                <Button data-testid="create-key-button" variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                  Create key
                </Button>
              }
              title="Create API key"
              description="Give the key a label and set its permissions."
              footer={
                <>
                  <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={createKey.isPending}
                    disabled={!label.trim()}
                    onClick={handleCreate}
                  >
                    Create
                  </Button>
                </>
              }
            >
              <div className="space-y-4 py-2">
                <Input
                  label="Label"
                  id="key-label"
                  fullWidth
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="My app key"
                />
                {role === 'owner' && (
                  <div data-testid="admin-key-option">
                    <Checkbox
                      checked={isAdmin}
                      onCheckedChange={(v) => setIsAdmin(!!v)}
                      label="Admin key"
                    />
                  </div>
                )}
              </div>
            </Dialog>
          </div>

          {/* New key secret reveal */}
          {newSecret && (
            <Card variant="outlined" className="p-4 space-y-3">
              <p className="text-sm font-medium text-[var(--color-warning)]">
                Copy this key now — it will not be shown again.
              </p>
              <CodeBlock code={newSecret} language="text" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewSecret(null)}
              >
                Dismiss
              </Button>
            </Card>
          )}

          {isPending ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No API keys yet.</p>
          ) : (
            <div>
              {keys.map(k => (
                <KeyRow key={k.id} apiKey={k} />
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

export function KeysPage() {
  return (
    <HydratedIsland>
      <KeysPageInner />
    </HydratedIsland>
  );
}
