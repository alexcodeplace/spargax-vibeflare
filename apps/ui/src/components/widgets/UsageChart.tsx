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
  if (error) return <StableChartFrame><Badge variant="danger">Chart unavailable</Badge></StableChartFrame>;
  if (loading) return <StableChartFrame><Spinner size="md" /></StableChartFrame>;

  return (
    <Suspense fallback={<StableChartFrame><Spinner size="md" /></StableChartFrame>}>
      <ChartImpl data={data} metric={metric} />
    </Suspense>
  );
}
