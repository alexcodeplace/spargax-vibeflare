import { Button } from '../primitives/Button';
import type { InviteRecord } from '../../lib/api/invites';

export interface InviteRowActionProps {
  invite: InviteRecord;
  onRevoke: (id: string) => void;
}

export function InviteRowAction({ invite, onRevoke }: InviteRowActionProps) {
  const active =
    !invite.used_at &&
    !invite.revoked_at &&
    invite.expires_at > Date.now();

  if (!active) return null;

  return (
    <Button variant="danger" size="sm" onClick={() => onRevoke(invite.id)}>
      Revoke
    </Button>
  );
}
