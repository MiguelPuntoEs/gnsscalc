import clsx from 'clsx';
import React, { useEffect, useId, useState } from 'react';
import InputMask from 'react-input-mask';
import styles from './labelinput.module.scss';

type LabelInputProps = {
  label: string;
  value: string;
  onCompute?: (value: string) => unknown;
  disabled?: boolean;
  className?: string;
  type?: string;
  step?: string;
  maskOptions?: {
    mask: string;
    formatChars: {
      [key: string]: string;
    };
  };
  readOnly?: boolean;
};

export default function LabelInput({
  label,
  value,
  onCompute,
  disabled = false,
  className,
  type = 'text',
  step,
  maskOptions,
  readOnly,
}: LabelInputProps) {
  const id = useId();
  const [error, setError] = useState(false);
  const [inputValue, setInputValue] = useState<string>(value);

  // Update internal value when prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Clear error when user starts typing
    if (error) setError(false);
  };

  const handleValidate = () => {
    if (!onCompute) return;

    const result = onCompute(inputValue);
    setError(result === undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleValidate();
    }
  };

  const input = maskOptions ? (
    <InputMask
      id={id}
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleValidate}
      disabled={disabled}
      className={clsx(className, error ? styles.error : undefined)}
      mask={maskOptions.mask}
    />
  ) : (
    <input
      id={id}
      type={type}
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleValidate}
      disabled={disabled}
      className={clsx(className, error ? styles.error : undefined)}
      step={step}
      readOnly={readOnly}
    />
  );

  return (
    <>
      <label htmlFor={id}>{label}</label>
      {input}
    </>
  );
}
