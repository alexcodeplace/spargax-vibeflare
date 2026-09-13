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

/** Keep both the chart frame and data disclosure stable while their contents load. */
export function UsageChart({ data, metric, loading = false, error = null }: UsageChartProps) {
  let chart: ReactNode;
  if (error) {
    chart = <div role="alert"><StableChartFrame><Badge variant="danger">Chart unavailable</Badge></StableChartFrame></div>;
  } else if (loading) {
    chart = <div role="status" aria-label="Loading usage data"><StableChartFrame><Spinner size="md" /></StableChartFrame></div>;
  } else {
    chart = <Suspense fallback={<StableChartFrame><Spinner size="md" /></StableChartFrame>}>
      <ChartImpl data={data} metric={metric} />
    </Suspense>;
  }

  return (
    <div>
      {chart}
      <details className="vf-chart-data">
        <summary>View {metric === 'neurons' ? 'neuron usage' : 'request'} data as a table</summary>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Usage data table" aria-busy={loading}>
          {loading ? <p>Loading usage data...</p> : error ? <p>Usage data is unavailable for this period.</p> : <>
            <table className="vf-data-table">
              <caption>{metric === 'neurons' ? 'Neurons' : 'Requests'} by time period</caption>
              <thead><tr><th scope="col">Time period</th><th scope="col">{metric === 'neurons' ? 'Neurons' : 'Requests'}</th></tr></thead>
              <tbody>{data.map((point, index) => <tr key={`${point.ts}-${index}`}><th scope="row">{point.ts}</th><td>{point[metric]}</td></tr>)}</tbody>
            </table>
            {data.length === 0 && <p>No usage recorded for this period.</p>}
          </>}
        </div>
      </details>
    </div>
  );
}
