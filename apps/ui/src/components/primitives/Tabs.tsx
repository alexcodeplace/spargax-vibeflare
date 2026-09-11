import { useEffect, useState, type ReactNode, type MouseEvent } from 'react';
import { Tab, TabList } from '@astryxdesign/core/TabList';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
  testid?: string;
}

export interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  variant?: 'underline' | 'segmented';
  touchFriendly?: boolean;
}

function labelText(label: ReactNode, fallback: string): string {
  return typeof label === 'string' || typeof label === 'number' ? String(label) : fallback;
}

export function Tabs({ items, defaultValue, value: controlledValue, onValueChange, className, variant = 'underline', touchFriendly = false }: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? items[0]?.value ?? '');
  useEffect(() => {
    if (controlledValue !== undefined) setInternalValue(controlledValue);
  }, [controlledValue]);
  const value = controlledValue ?? internalValue;
  const active = items.find((item) => item.value === value);

  return (
    <div className={className}>
      <TabList
        role="tablist"
        aria-label="Sections"
        value={value}
        onChange={(next) => {
          const item = items.find((candidate) => candidate.value === next);
          if (item?.disabled) return;
          if (controlledValue === undefined) setInternalValue(next);
          onValueChange?.(next);
        }}
        layout={variant === 'segmented' ? 'fill' : 'hug'}
        hasDivider={variant !== 'segmented'}
      >
        {items.map((item) => (
          <Tab
            key={item.value}
            value={item.value}
            label={labelText(item.label, item.value)}
            panelId={`vf-tab-panel-${item.value}`}
            data-testid={item.testid}
            style={touchFriendly ? { minWidth: 44, minHeight: 44 } : undefined}
            {...(item.disabled
              ? {
                  'aria-disabled': 'true' as const,
                  onClick: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
                }
              : {})}
          />
        ))}
      </TabList>
      <div id={`vf-tab-panel-${value}`} role="tabpanel" className="pt-4">
        {active?.content}
      </div>
    </div>
  );
}
