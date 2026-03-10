import { useCallback, useId } from 'react';
import useEditableValue from '../hooks/useEditableValue';
import CopyIcon, { useCopyFeedback } from './CopyIcon';

export type FieldProps = {
  label: string;
  value: string;
  onCommit?: (value: string) => unknown;
  numeric?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
};

export default function Field({
  label,
  value,
  onCommit,
  numeric,
  disabled,
  readOnly,
}: FieldProps) {
  const id = useId();
  const edit = useEditableValue(value, onCommit);
  const getValue = useCallback(() => edit.value, [edit.value]);
  const { copied, copy } = useCopyFeedback(getValue);

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <span className="relative min-w-0 group">
        <input
          id={id}
          inputMode={numeric ? 'decimal' : undefined}
          value={edit.value}
          onChange={edit.onChange}
          onKeyDown={edit.onKeyDown}
          onBlur={edit.onBlur}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={edit.error || undefined}
          className={`w-full ${edit.error ? 'border-2 border-red-500 text-red-500' : ''}`}
        />
        <CopyIcon copied={copied} onCopy={copy} />
      </span>
    </>
  );
}
