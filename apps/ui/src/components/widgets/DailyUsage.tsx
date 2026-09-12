import { useCallback, useEffect, useState } from 'react';
import { Card } from '../primitives/Card';
import { Progress } from '../primitives/Progress';
import { Badge } from '../primitives/Badge';
import { Spinner } from '../primitives/Spinner';
import { HydratedIsland } from '../HydratedIsland';
import { getQuota, QUOTA_CHANGED_EVENT, type QuotaInfo } from '../../lib/api';

export interface DailyUsageProps {
  /** Compact mode for TopBar — smaller footprint */
  compact?: boolean;
}

export function formatNeuronCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) < 10 && value % 1 !== 0) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Live daily Workers AI usage. Cloudflare's free allocation is 10,000 neurons/day. */
function DailyUsageInner({ compact = false }: DailyUsageProps) {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setQuota(await getQuota());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quota error');
    }
  }, []);

  useEffect(() => {
    void refresh();

    // Inference accounting for streaming requests is committed in a Worker
    // waitUntil() after the final SSE chunk. Refresh immediately, then twice
    // more shortly afterwards so the counter visibly catches that commit.
    let retryTimers: number[] = [];
    const onQuotaChanged = () => {
      void refresh();
      retryTimers.forEach(window.clearTimeout);
      retryTimers = [
        window.setTimeout(() => void refresh(), 600),
        window.setTimeout(() => void refresh(), 1800),
      ];
    };
    const onFocus = () => void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener(QUOTA_CHANGED_EVENT, onQuotaChanged);
    window.addEventListener('focus', onFocus);
    return () => {
      retryTimers.forEach(window.clearTimeout);
      window.clearInterval(interval);
      window.removeEventListener(QUOTA_CHANGED_EVENT, onQuotaChanged);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  if (error && !quota) return <Badge variant="danger">Quota error</Badge>;
  if (!quota) return <Spinner size="sm" />;

  const pct = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0;
  const roundedPct = Math.round(pct);
  const variant = pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : 'success';
  const usageLabel = `${formatNeuronCount(quota.used)} / ${quota.limit.toLocaleString()}`;

  if (compact) {
    return (
      <div className="flex items-center gap-2" title={`${usageLabel} free neurons used by VibeFlare today`}>
        <Progress value={quota.used} max={quota.limit} className="w-20" />
        <span className="whitespace-nowrap text-xs font-medium tabular-nums text-[var(--color-muted)]">
          {usageLabel} neurons
        </span>
      </div>
    );
  }

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[var(--color-text)]">Daily Workers AI usage</span>
        <Badge variant={variant}>{roundedPct}%</Badge>
      </div>
      <Progress value={quota.used} max={quota.limit} />
      <p className="text-sm font-medium tabular-nums text-[var(--color-text)]">
        {usageLabel} free neurons used by VibeFlare today
      </p>
      <p className="text-xs text-[var(--color-muted)]">Cloudflare resets the 10,000-neuron free allocation at 00:00 UTC. The allocation is account-wide; VibeFlare can only count inference sent through this VibeFlare installation.</p>
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
