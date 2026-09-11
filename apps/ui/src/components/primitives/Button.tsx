import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button as AstryxButton } from '@astryxdesign/core/Button';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
}

const variants = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  outline: 'secondary',
  danger: 'destructive',
} as const;

function textLabel(children: ReactNode, fallback?: string): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  return fallback ?? 'Action';
}

/** Compatibility adapter: all application buttons now render Astryx Button. */
export function Button({
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  loading,
  children,
  className,
  disabled,
  title,
  'aria-label': ariaLabel,
  style,
  type,
  onClick,
  ...rest
}: ButtonProps) {
  const label = ariaLabel ?? title ?? textLabel(children);
  return (
    <AstryxButton
      label={label}
      variant={variants[variant]}
      size={size}
      icon={leftIcon}
      endContent={rightIcon}
      isDisabled={disabled}
      isLoading={loading}
      className={className}
      style={style}
      type={type}
      onClick={onClick}
      {...rest}
    >
      {children}
    </AstryxButton>
  );
}
