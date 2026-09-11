import type { ReactNode } from 'react';
import { Tooltip as AstryxTooltip } from '@astryxdesign/core/Tooltip';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

const placement = { top: 'above', bottom: 'below', left: 'start', right: 'end' } as const;
export function Tooltip({ content, children, side = 'top', delayDuration = 300 }: TooltipProps) {
  return <AstryxTooltip content={content} placement={placement[side]} delay={delayDuration}>{children}</AstryxTooltip>;
}
