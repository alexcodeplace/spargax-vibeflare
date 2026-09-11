import type { HTMLAttributes } from 'react';
import { Card as AstryxCard } from '@astryxdesign/core/Card';

export type CardVariant = 'default' | 'outlined' | 'elevated';
export type CardPadding = 'sm' | 'md' | 'lg';
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const paddingStep = { sm: 3, md: 4, lg: 6 } as const;

/** Compatibility adapter: application cards are Astryx Card surfaces. */
export function Card({ variant = 'default', padding, className, children, ...rest }: CardProps) {
  return (
    <AstryxCard
      variant={variant === 'outlined' ? 'transparent' : 'default'}
      elevation={variant === 'elevated' ? 'med' : 'none'}
      padding={padding ? paddingStep[padding] : undefined}
      className={className}
      {...rest}
    >
      {children}
    </AstryxCard>
  );
}
