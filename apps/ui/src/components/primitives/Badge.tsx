import type { HTMLAttributes } from 'react';
import { Badge as AstryxBadge } from '@astryxdesign/core/Badge';

export type BadgeVariant = 'default' | 'success' | 'warn' | 'danger' | 'info' | 'muted' | 'neutral';
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

const variants = {
  default: 'neutral',
  success: 'success',
  warn: 'warning',
  danger: 'error',
  info: 'info',
  muted: 'neutral',
  neutral: 'neutral',
} as const;

export function Badge({ variant = 'default', size, className, children, ...rest }: BadgeProps) {
  const sizing = size === 'sm' ? 'text-xs' : undefined;
  return (
    <AstryxBadge
      variant={variants[variant]}
      label={children}
      className={[sizing, className].filter(Boolean).join(' ') || undefined}
      {...rest}
    />
  );
}
