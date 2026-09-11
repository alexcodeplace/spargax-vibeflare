import { useState } from 'react';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Spinner } from '../primitives/Spinner';
import { InviteTable } from './InviteTable';
import { InviteCreateModal } from './InviteCreateModal';
import { useInvites, useCreateInvite, useRevokeInvite } from '../../lib/api/invites';

export function InvitesTab() {
  const invites = useInvites();
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const [open, setOpen] = useState(false);

  if (invites.isLoading) return <Spinner />;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Invites</h2>
          <p className="text-sm text-[var(--color-muted)]">Create one-time invite links to provision new accounts.</p>
        </div>
        <Button onClick={() => setOpen(true)}>New invite</Button>
      </div>
      <InviteTable
        invites={invites.data ?? []}
        onRevoke={(id) => revoke.mutate(id)}
      />
      <InviteCreateModal
        open={open}
        onClose={() => setOpen(false)}
        onCreate={(args) => create.mutateAsync(args)}
      />
    </Card>
  );
}
