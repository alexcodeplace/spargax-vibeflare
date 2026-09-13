import { useEffect, useId, useState, type ReactNode, type MouseEvent } from 'react';
import { Tab, TabList } from '@astryxdesign/core/TabList';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
  testid?: string;
  href?: string;
}

export interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  variant?: 'underline' | 'segmented';
  touchFriendly?: boolean;
  navigation?: boolean;
  label?: string;
}

function labelText(label: ReactNode, fallback: string): string {
  return typeof label === 'string' || typeof label === 'number' ? String(label) : fallback;
}

export function Tabs({ items, defaultValue, value: controlledValue, onValueChange, className, variant = 'underline', touchFriendly = false, navigation = false, label = 'Sections' }: TabsProps) {
  const id = useId();
  const [internalValue, setInternalValue] = useState(defaultValue ?? items[0]?.value ?? '');
  useEffect(() => {
    if (controlledValue !== undefined) setInternalValue(controlledValue);
  }, [controlledValue]);
  const value = controlledValue ?? internalValue;

  function select(next: string) {
    const item = items.find((candidate) => candidate.value === next);
    if (!item || item.disabled) return;
    if (controlledValue === undefined) setInternalValue(next);
    onValueChange?.(next);
  }

  return (
    <div className={`vf-tabs ${className ?? ''}`} data-vf-variant={variant}>
      <TabList
        className="vf-tab-list"
        overflow="visible"
        role={navigation ? undefined : 'tablist'}
        aria-label={label}
        value={value}
        onChange={select}
        layout={variant === 'segmented' ? 'fill' : 'hug'}
        hasDivider={false}
      >
        {items.map((item) => (
          <Tab
            key={item.value}
            id={`${id}-tab-${item.value}`}
            className="vf-tab"
            value={item.value}
            label={labelText(item.label, item.value)}
            href={navigation ? item.href : undefined}
            panelId={navigation ? undefined : `${id}-panel-${item.value}`}
            data-testid={item.testid}
            style={touchFriendly ? { minWidth: 44, minHeight: 44 } : undefined}
            {...(item.disabled
              ? {
                  'aria-disabled': 'true' as const,
                  onClick: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
                }
              : navigation ? {
                  // Real links support copy/open-in-new-tab. Ordinary clicks
                  // switch panels without throwing away pending form state.
                  onClick: (event: MouseEvent<HTMLButtonElement>) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    select(item.value);
                  },
                } : {})}
          />
        ))}
      </TabList>
      {items.map((item) => (
        <div
          key={item.value}
          id={`${id}-panel-${item.value}`}
          role={navigation ? 'region' : 'tabpanel'}
          aria-labelledby={`${id}-tab-${item.value}`}
          hidden={item.value !== value}
          tabIndex={0}
          className="vf-tab-panel pt-4"
        >
          {item.value === value ? item.content : null}
        </div>
      ))}
    </div>
  );
}
