import { useState } from 'react';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';
import { useRevokeKey, type ApiKey } from '../../lib/api/keys';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export interface KeyRowProps {
  apiKey: ApiKey;
  onRevoked?: (id: string) => void;
}

/**
 * Table row showing key prefix, label, last_used, admin badge + revoke action.
 * Uses useRevokeKey mutation — invalidates keys list on success.
 */
export function KeyRow({ apiKey, onRevoked }: KeyRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const revokeKey = useRevokeKey();

  async function handleRevoke() {
    await revokeKey.mutateAsync(apiKey.id);
    setConfirmOpen(false);
    onRevoked?.(apiKey.id);
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)] gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <code className="text-xs font-mono text-[var(--color-muted)] shrink-0">
          {apiKey.prefix}…
        </code>
        <span className="text-sm text-[var(--color-text)] truncate">{apiKey.label}</span>
        {apiKey.is_admin && <Badge variant="warn" size="sm">admin</Badge>}
        {apiKey.revoked_at != null && <Badge variant="danger" size="sm">revoked</Badge>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-[var(--color-muted)]">
          {apiKey.last_used_at ? `Last used ${relativeTime(apiKey.last_used_at)}` : 'Never used'}
        </span>
        {apiKey.revoked_at == null && (
          <Dialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            trigger={
              <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
                Revoke
              </Button>
            }
            title="Revoke API key?"
            description={`This will permanently revoke "${apiKey.label}". Any apps using it will stop working.`}
            footer={
              <>
                <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" loading={revokeKey.isPending} onClick={handleRevoke}>
                  Revoke
                </Button>
              </>
            }
          />
        )}
      </div>
    </div>
  );
}
