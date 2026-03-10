import { useId } from 'react';
import useEditableValue from '../hooks/useEditableValue';

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
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode={numeric ? 'decimal' : undefined}
        value={edit.value}
        onChange={edit.onChange}
        onKeyDown={edit.onKeyDown}
        onBlur={edit.onBlur}
        disabled={disabled}
        readOnly={readOnly}
        className={edit.error ? 'border-2 border-red-500 text-red-500' : ''}
      />
    </>
  );
}
