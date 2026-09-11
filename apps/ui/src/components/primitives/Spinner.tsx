import { Spinner as AstryxSpinner } from '@astryxdesign/core/Spinner';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export function Spinner({ size = 'md', className, label = 'Loading…' }: SpinnerProps) {
  return <AstryxSpinner size={size} className={className} aria-label={label} />;
}
