import type { ReactNode } from 'react';
import { Toast as AstryxToast } from '@astryxdesign/core/Toast';

export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function ToastViewport() {
  return null;
}

export type ToastVariant = 'default' | 'success' | 'warn' | 'danger' | 'info';

export interface ToastProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  variant?: ToastVariant;
  duration?: number;
}

export function Toast({
  open = false,
  onOpenChange,
  title,
  description,
  action,
  variant = 'default',
  duration = 4000,
}: ToastProps) {
  if (!open) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-[min(360px,calc(100vw-2rem))]">
      <AstryxToast
        type={variant === 'danger' ? 'error' : 'info'}
        body={
          <div className="space-y-1">
            {title && <div className="font-semibold">{title}</div>}
            {description && <div>{description}</div>}
          </div>
        }
        endContent={action}
        isAutoHide
        autoHideDuration={duration}
        onDismiss={() => onOpenChange?.(false)}
      />
    </div>
  );
}
