'use client';
import { lazy, Suspense, type ReactNode } from 'react';
import { Spinner } from '../primitives/Spinner';
import { Badge } from '../primitives/Badge';
import type { UsagePoint } from '../../lib/api';

export type UsageRange = '24h' | '7d' | '30d';
export type UsageMetric = 'requests' | 'neurons';

export interface UsageChartProps {
  data: UsagePoint[];
  metric: UsageMetric;
  loading?: boolean;
  error?: string | null;
}

const ChartImpl = lazy(() => import('./UsageChartImpl'));

function StableChartFrame({ children }: { children: ReactNode }) {
  return <div className="flex h-[180px] min-h-[180px] items-center justify-center">{children}</div>;
}

/** Stable chart frame: loading the data or the chart.js chunk never changes layout height. */
export function UsageChart({ data, metric, loading = false, error = null }: UsageChartProps) {
  if (error) return <div role="alert"><StableChartFrame><Badge variant="danger">Chart unavailable</Badge></StableChartFrame></div>;
  if (loading) return <div role="status" aria-label="Loading usage data"><StableChartFrame><Spinner size="md" /></StableChartFrame></div>;

  return (
    <div>
    <Suspense fallback={<StableChartFrame><Spinner size="md" /></StableChartFrame>}>
      <ChartImpl data={data} metric={metric} />
    </Suspense>
    <details className="vf-chart-data">
      <summary>View {metric === 'neurons' ? 'neuron usage' : 'request'} data as a table</summary>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Usage data table">
        <table className="vf-data-table">
          <caption>{metric === 'neurons' ? 'Neurons' : 'Requests'} by time period</caption>
          <thead><tr><th scope="col">Time period</th><th scope="col">{metric === 'neurons' ? 'Neurons' : 'Requests'}</th></tr></thead>
          <tbody>{data.map((point, index) => <tr key={`${point.ts}-${index}`}><th scope="row">{point.ts}</th><td>{point[metric]}</td></tr>)}</tbody>
        </table>
        {data.length === 0 && <p>No usage recorded for this period.</p>}
      </div>
    </details>
    </div>
  );
}
