import { ProgressBar } from '@astryxdesign/core/ProgressBar';

export interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
}

export function Progress({ value, max = 100, className, showLabel }: ProgressProps) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const variant = ratio >= 0.9 ? 'error' : ratio >= 0.7 ? 'warning' : 'success';
  return (
    <ProgressBar
      value={value}
      max={max}
      label="Usage"
      isLabelHidden={!showLabel}
      hasValueLabel={showLabel}
      variant={variant}
      className={className}
    />
  );
}
