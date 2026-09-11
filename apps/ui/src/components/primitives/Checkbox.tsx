import { useState } from 'react';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';

export interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  className?: string;
}

export function Checkbox({ checked, defaultChecked, onCheckedChange, disabled, label = 'Toggle', id, className }: CheckboxProps) {
  const [internal, setInternal] = useState(defaultChecked ?? false);
  const value = checked ?? internal;
  return (
    <CheckboxInput
      id={id}
      label={label}
      value={value}
      isDisabled={disabled}
      className={className}
      onChange={(next) => {
        if (checked === undefined) setInternal(next);
        onCheckedChange?.(next);
      }}
    />
  );
}
