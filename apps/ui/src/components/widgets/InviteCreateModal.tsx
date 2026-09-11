import { useEffect, useState } from 'react';
import { Dialog } from '../primitives/Dialog';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { Select } from '../primitives/Select';

const EXPIRY_OPTIONS = [
  { value: '3600', label: '1 hour' },
  { value: '86400', label: '24 hours' },
  { value: '604800', label: '7 days (default)' },
  { value: '2592000', label: '30 days' },
];

export interface InviteCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (args: { label: string | null; expiresInSec: number }) => Promise<{ full: string; prefix: string }>;
}

export function InviteCreateModal({ open, onClose, onCreate }: InviteCreateModalProps) {
  const [label, setLabel] = useState('');
  const [expiresInSec, setExpiresInSec] = useState('604800');
  const [created, setCreated] = useState<{ full: string; prefix: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setCreated(null);
      setLabel('');
      setExpiresInSec('604800');
      setCopied(false);
    }
  }, [open]);

  async function handleSubmit() {
    setLoading(true);
    try {
      const result = await onCreate({
        label: label.trim() || null,
        expiresInSec: Number(expiresInSec),
      });
      setCreated(result);
    } finally {
      setLoading(false);
    }
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/signup?token=${encodeURIComponent(created!.full)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={created ? 'Invite created' : 'New invite'}
      description={
        created
          ? 'Share this link with the person you want to invite. It can only be used once.'
          : 'Create a one-time invite link to provision a new account.'
      }
      footer={
        created ? (
          <Button variant="primary" onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button variant="primary" loading={loading} onClick={handleSubmit}>Create</Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          <pre className="rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-2 text-xs font-mono text-[var(--color-text)] break-all whitespace-pre-wrap">
            {created.full}
          </pre>
          <Button variant="secondary" onClick={handleCopyLink} className="w-full">
            {copied ? 'Copied!' : 'Copy link'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            id="invite-label"
            label="Label (optional)"
            fullWidth
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Alice's invite"
          />
          <Select
            id="invite-expires"
            label="Expires in"
            options={EXPIRY_OPTIONS}
            value={expiresInSec}
            onValueChange={setExpiresInSec}
          />
        </div>
      )}
    </Dialog>
  );
}
