import { useEffect, useState } from 'react';
import { Selector } from '@astryxdesign/core/Selector';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  id?: string;
}

export function Select({
  options,
  value: controlledValue,
  defaultValue,
  onValueChange,
  placeholder = 'Select…',
  disabled,
  className,
  label,
  id,
}: SelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  useEffect(() => {
    if (controlledValue !== undefined) setInternalValue(controlledValue);
  }, [controlledValue]);
  const value = controlledValue ?? internalValue;

  return (
    <Selector
      id={id}
      label={label ?? placeholder}
      isLabelHidden={!label}
      options={options}
      value={value}
      onChange={(next) => {
        if (controlledValue === undefined) setInternalValue(next);
        onValueChange?.(next);
      }}
      placeholder={placeholder}
      isDisabled={disabled}
      className={className}
      width="100%"
    />
  );
}
