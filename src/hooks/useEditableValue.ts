import type React from 'react';
import { useEffect, useState } from 'react';

export default function useEditableValue(
  value: string,
  onCommit?: (value: string) => unknown,
  validate?: (value: string) => string | null
) {
  const [inputValue, setInputValue] = useState(value);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const commit = () => {
    if (!onCommit) return;
    // Run validation first if provided
    if (validate) {
      const msg = validate(inputValue);
      if (msg) {
        setError(true);
        setErrorMessage(msg);
        return;
      }
    }
    const result = onCommit(inputValue);
    if (typeof result === 'string') {
      setError(true);
      setErrorMessage(result);
    } else if (result === undefined) {
      setError(true);
      setErrorMessage('Invalid value');
    } else {
      setError(false);
      setErrorMessage(null);
    }
  };

  return {
    value: inputValue,
    error,
    errorMessage,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      if (error) {
        setError(false);
        setErrorMessage(null);
      }
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commit();
    },
    onBlur: commit,
  };
}
