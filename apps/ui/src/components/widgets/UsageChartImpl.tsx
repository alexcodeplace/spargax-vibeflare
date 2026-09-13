'use client';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip as ChartTooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { UsageChartProps } from './UsageChart';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Filler);

/** Heavy chart.js implementation. Data is fetched once by AnalyticsPage and passed in. */
export default function UsageChartImpl({ data, metric }: Pick<UsageChartProps, 'data' | 'metric'>) {
  const label = metric === 'neurons' ? 'Neurons' : 'Requests';
  const values = data.map((point) => point[metric]);
  const chartData = {
    labels: data.map((point) => point.ts),
    datasets: [{
      label,
      data: values,
      borderColor: metric === 'neurons' ? 'var(--color-info)' : 'var(--color-accent)',
      backgroundColor: (metric === 'neurons' ? 'var(--color-info)' : 'var(--color-accent)') + '22',
      fill: true,
      tension: 0.4,
    }],
  };

  const options = {
    responsive: true,
    animation: false as const,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: 'var(--color-muted)' },
        grid: { color: 'var(--color-border)' },
      },
      y: {
        ticks: { color: 'var(--color-muted)' },
        grid: { color: 'var(--color-border)' },
      },
    },
  };

  return (
    <div className="h-[180px] min-h-[180px] w-full">
      <Line data={chartData} options={options} role="img" aria-label={`${label} over time. The same values are available in the data table below.`} />
    </div>
  );
}
