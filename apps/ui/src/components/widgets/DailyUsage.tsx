import { useEffect, useState } from 'react';
import { Card } from '../primitives/Card';
import { Progress } from '../primitives/Progress';
import { Badge } from '../primitives/Badge';
import { Spinner } from '../primitives/Spinner';
import { HydratedIsland } from '../HydratedIsland';
import { getQuota, type QuotaInfo } from '../../lib/api';

export interface DailyUsageProps {
  /** Compact mode for TopBar — smaller footprint */
  compact?: boolean;
}

/**
 * Shows daily quota usage: progress bar + percentage badge.
 * Fetches from /admin/quota via api.ts.
 * Self-wraps in HydratedIsland since it is mounted as a standalone island in TopBar.astro.
 */
function DailyUsageInner({ compact = false }: DailyUsageProps) {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQuota()
      .then(setQuota)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Badge variant="danger">Quota error</Badge>;
  if (!quota) return <Spinner size="sm" />;

  const pct = quota.limit > 0 ? Math.round((quota.used / quota.limit) * 100) : 0;
  const variant = pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : 'success';

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Progress value={quota.used} max={quota.limit} className="w-24" />
        <Badge variant={variant} size="sm">{pct}%</Badge>
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">Daily usage</span>
        <Badge variant={variant}>{pct}%</Badge>
      </div>
      <Progress value={quota.used} max={quota.limit} />
      <p className="text-xs text-[var(--color-muted)]">
        {quota.used.toLocaleString()} / {quota.limit.toLocaleString()} neurons
      </p>
    </Card>
  );
}

export function DailyUsage({ compact = false }: DailyUsageProps) {
  return (
    <HydratedIsland>
      <DailyUsageInner compact={compact} />
    </HydratedIsland>
  );
}
