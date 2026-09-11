import { useEffect, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange'> {
  variant?: 'default' | 'error';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  label?: string;
  errorMessage?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

function syntheticChange(value: string): ChangeEvent<HTMLInputElement> {
  return { target: { value }, currentTarget: { value } } as unknown as ChangeEvent<HTMLInputElement>;
}

export function Input({
  variant = 'default',
  size = 'md',
  fullWidth,
  label,
  errorMessage,
  className,
  id,
  value: controlledValue,
  defaultValue,
  onChange,
  disabled,
  readOnly,
  required,
  name,
  type = 'text',
  placeholder,
  min,
  max,
  step,
  autoFocus,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: InputProps) {
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ''));
  useEffect(() => {
    if (controlledValue !== undefined && controlledValue !== null) setInternalValue(String(controlledValue));
  }, [controlledValue]);

  const value = controlledValue === undefined ? internalValue : String(controlledValue ?? '');
  const fieldLabel = label ?? placeholder ?? rest['aria-label'] ?? 'Input';
  const status = variant === 'error' || errorMessage
    ? { type: 'error' as const, message: errorMessage }
    : undefined;

  if (type === 'number') {
    const parsed = value.trim() === '' ? null : Number(value);
    return (
      <NumberInput
        id={id}
        label={fieldLabel}
        isLabelHidden={!label}
        value={parsed !== null && Number.isFinite(parsed) ? parsed : null}
        onChange={(next) => {
          const text = String(next);
          if (controlledValue === undefined) setInternalValue(text);
          onChange?.(syntheticChange(text));
        }}
        size={size}
        width={fullWidth ? '100%' : undefined}
        status={status}
        isDisabled={disabled}
        isReadOnly={readOnly}
        isRequired={required}
        htmlName={name}
        placeholder={placeholder}
        min={min == null ? null : Number(min)}
        max={max == null ? null : Number(max)}
        step={step == null ? null : Number(step)}
        hasAutoFocus={autoFocus}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={className}
        {...rest}
      />
    );
  }

  const textType: 'text' | 'password' | 'email' = type === 'password' ? 'password' : type === 'email' ? 'email' : 'text';
  return (
    <TextInput
      id={id}
      label={fieldLabel}
      isLabelHidden={!label}
      type={textType}
      value={value}
      onChange={(next, event) => {
        if (controlledValue === undefined) setInternalValue(next);
        onChange?.(event);
      }}
      size={size}
      width={fullWidth ? '100%' : undefined}
      status={status}
      isDisabled={disabled}
      isReadOnly={readOnly}
      isRequired={required}
      htmlName={name}
      placeholder={placeholder}
      hasAutoFocus={autoFocus}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={className}
      {...rest}
    />
  );
}
