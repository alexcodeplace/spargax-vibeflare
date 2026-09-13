import { isValidElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
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

function childText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(childText).join('');
  if (isValidElement<{ children?: ReactNode; 'aria-hidden'?: boolean | 'true' | 'false' }>(node)) {
    if (node.props['aria-hidden'] === true || node.props['aria-hidden'] === 'true') return '';
    return childText(node.props.children);
  }
  return '';
}

function textLabel(children: ReactNode): string {
  // Compound JSX labels must not all become the accessible name "Action".
  // Read the supplied content only; never execute a child component.
  return childText(children).replace(/\s+/g, ' ').trim() || 'Action';
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
      className={`vf-button ${className ?? ''}`}
      data-vf-variant={variant}
      data-vf-size={size}
      style={style}
      type={type}
      onClick={onClick}
      {...rest}
    >
      {children}
    </AstryxButton>
  );
}
