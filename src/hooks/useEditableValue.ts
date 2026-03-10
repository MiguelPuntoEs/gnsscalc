import type React from 'react';
import { useEffect, useState } from 'react';

export default function useEditableValue(
  value: string,
  onCommit?: (value: string) => unknown
) {
  const [inputValue, setInputValue] = useState(value);
  const [error, setError] = useState(false);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const commit = () => {
    if (!onCommit) return;
    const result = onCommit(inputValue);
    setError(result === undefined);
  };

  return {
    value: inputValue,
    error,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      if (error) setError(false);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commit();
    },
    onBlur: commit,
  };
}
