import { useEffect, useState } from 'react';
import { Card } from '../primitives/Card';
import { Tabs } from '../primitives/Tabs';
import { UsageChart, type UsageRange } from './UsageChart';
import { AuditTable } from './AuditTable';
import { HydratedIsland } from '../HydratedIsland';
import { getUsage, type UsageResponse } from '../../lib/api';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card variant="default" className="p-4 space-y-1">
      <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-[var(--color-text)]">{value}</p>
    </Card>
  );
}

/**
 * Analytics page content: summary stats, usage charts, audit log.
 * Wrapped in HydratedIsland — mount via AppShell.astro in analytics.astro.
 */
function AnalyticsPageInner() {
  const [range, setRange] = useState<UsageRange>('24h');
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getUsage(range)
      .then(setUsage)
      .catch((reason: Error) => { setUsage(null); setError(reason.message); })
      .finally(() => setLoading(false));
  }, [range]);

  const stats = usage?.data ?? [];
  const totalNeurons = stats.reduce((sum, point) => sum + (point.neurons ?? 0), 0);
  const totalRequests = stats.reduce((sum, point) => sum + (point.requests ?? 0), 0);

  return (
    <div data-testid="analytics-page" className="space-y-6">
      {/* Range switcher */}
      <Tabs
        items={[
          { value: '24h', label: '24h', content: null },
          { value: '7d', label: '7d', content: null },
          { value: '30d', label: '30d', content: null },
        ]}
        value={range}
        onValueChange={(v) => setRange(v as UsageRange)}
        touchFriendly
      />

      {/* Keep the summary footprint stable while usage is loading. */}
      <div className="min-h-5" aria-live="polite">
        {error && <p className="text-sm text-[var(--color-danger)]">Could not load usage: {error}</p>}
      </div>
      <div data-testid="usage-summary" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={`Neurons (${range})`} value={loading ? '…' : totalNeurons.toLocaleString()} />
        <StatCard label={`Requests (${range})`} value={loading ? '…' : totalRequests.toLocaleString()} />
        <StatCard
          label="Error Rate"
          value={loading ? '…' : usage?.error_rate == null ? 'N/A' : `${(usage.error_rate * 100).toFixed(1)}%`}
        />
        <StatCard label="Top Model" value={loading ? '…' : usage?.top_model ?? 'N/A'} />
      </div>

      {/* Both charts share the page's one usage fetch and keep a fixed plotting height. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card variant="default" className="p-4">
          <p className="text-sm font-medium text-[var(--color-muted)] mb-3">Neurons over time</p>
          <UsageChart data={stats} metric="neurons" loading={loading} error={error} />
        </Card>
        <Card variant="default" className="p-4">
          <p className="text-sm font-medium text-[var(--color-muted)] mb-3">Requests over time</p>
          <UsageChart data={stats} metric="requests" loading={loading} error={error} />
        </Card>
      </div>

      {/* Audit log */}
      <div>
        <p className="text-sm font-medium text-[var(--color-text)] mb-3">Recent Events</p>
        <AuditTable />
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  return (
    <HydratedIsland>
      <AnalyticsPageInner />
    </HydratedIsland>
  );
}
