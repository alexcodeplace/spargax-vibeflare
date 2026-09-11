import { useEffect, useState, type ChangeEvent, type TextareaHTMLAttributes } from 'react';
import { TextArea } from '@astryxdesign/core/TextArea';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size' | 'onChange'> {
  variant?: 'default' | 'error';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  label?: string;
  errorMessage?: string;
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}

export function Textarea({
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
  placeholder,
  rows,
  autoFocus,
  onFocus,
  onBlur,
  onPaste,
  spellCheck,
  maxLength,
  ...rest
}: TextareaProps) {
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ''));
  useEffect(() => {
    if (controlledValue !== undefined && controlledValue !== null) setInternalValue(String(controlledValue));
  }, [controlledValue]);
  const value = controlledValue === undefined ? internalValue : String(controlledValue ?? '');
  const fieldLabel = label ?? placeholder ?? rest['aria-label'] ?? 'Message';
  const status = variant === 'error' || errorMessage
    ? { type: 'error' as const, message: errorMessage }
    : undefined;

  return (
    <TextArea
      id={id}
      label={fieldLabel}
      isLabelHidden={!label}
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
      rows={rows}
      hasAutoFocus={autoFocus}
      onFocus={onFocus}
      onBlur={onBlur}
      onPaste={onPaste}
      hasSpellCheck={spellCheck == null ? undefined : spellCheck === true || spellCheck === 'true'}
      maxLength={maxLength}
      className={className}
      {...rest}
    />
  );
}
