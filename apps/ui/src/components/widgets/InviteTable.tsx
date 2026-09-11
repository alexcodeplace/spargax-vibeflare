import { Badge } from '../primitives/Badge';
import type { BadgeProps } from '../primitives/Badge';
import { InviteRowAction } from './InviteRowAction';
import type { InviteRecord } from '../../lib/api/invites';

function statusInfo(invite: InviteRecord): { label: string; variant: BadgeProps['variant'] } {
  if (invite.revoked_at != null) return { label: 'revoked', variant: 'danger' };
  if (invite.used_at != null) return { label: 'used', variant: 'muted' };
  if (invite.expires_at <= Date.now()) return { label: 'expired', variant: 'warn' };
  return { label: 'active', variant: 'info' };
}

export interface InviteTableProps {
  invites: InviteRecord[];
  onRevoke: (id: string) => void;
}

export function InviteTable({ invites, onRevoke }: InviteTableProps) {
  if (invites.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">No invites yet.</p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-[var(--color-muted)]">
          <th className="pb-2 font-medium">Prefix</th>
          <th className="pb-2 font-medium">Label</th>
          <th className="pb-2 font-medium">Expires</th>
          <th className="pb-2 font-medium">Status</th>
          <th className="pb-2 font-medium" />
        </tr>
      </thead>
      <tbody>
        {invites.map((invite) => {
          const { label, variant } = statusInfo(invite);
          return (
            <tr key={invite.id} className="border-t border-[var(--color-border)]">
              <td className="py-2 pr-4 font-mono text-[var(--color-text)]">{invite.prefix}</td>
              <td className="py-2 pr-4 text-[var(--color-text)]">{invite.label ?? '—'}</td>
              <td className="py-2 pr-4 text-[var(--color-muted)]">
                {new Date(invite.expires_at).toLocaleString()}
              </td>
              <td className="py-2 pr-4">
                <Badge variant={variant} size="sm">{label}</Badge>
              </td>
              <td className="py-2 text-right">
                <InviteRowAction invite={invite} onRevoke={onRevoke} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
