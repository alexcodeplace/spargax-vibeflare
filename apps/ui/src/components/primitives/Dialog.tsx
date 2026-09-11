import {
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Dialog as AstryxDialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

function text(node: ReactNode, fallback: string): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return fallback;
}

export function Dialog({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  useEffect(() => {
    if (controlledOpen !== undefined) setInternalOpen(controlledOpen);
  }, [controlledOpen]);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  let triggerNode = trigger;
  if (isValidElement(trigger)) {
    const element = trigger as ReactElement<{ onClick?: (event: unknown) => void }>;
    const previous = element.props.onClick;
    triggerNode = cloneElement(element, {
      onClick: (event: unknown) => {
        previous?.(event);
        setOpen(true);
      },
    });
  }

  return (
    <>
      {triggerNode}
      <AstryxDialog
        isOpen={open}
        onOpenChange={setOpen}
        purpose="info"
        width={520}
        className={className}
      >
        <Layout
          height="auto"
          header={title ? (
            <DialogHeader
              title={text(title, 'Dialog')}
              subtitle={description ? text(description, '') : undefined}
              onOpenChange={setOpen}
              hasDivider
            />
          ) : undefined}
          content={<LayoutContent>{children}</LayoutContent>}
          footer={footer ? (
            <LayoutFooter hasDivider>
              <div className="flex justify-end gap-2">{footer}</div>
            </LayoutFooter>
          ) : undefined}
        />
      </AstryxDialog>
    </>
  );
}
