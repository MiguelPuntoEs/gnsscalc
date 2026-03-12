import AutocompleteInput from './AutocompleteInput';
import CopyableInput from './CopyableInput';

export default function InlineField({
  label,
  value,
  originalValue,
  editing,
  onChange,
  type = 'text',
  maxLength,
  autocomplete,
}: {
  label: string;
  value: string;
  originalValue?: string;
  editing: boolean;
  onChange?: (v: string) => void;
  type?: 'text' | 'number';
  maxLength?: number;
  autocomplete?: {
    getSuggestions: () => Promise<string[]>;
    placeholder?: string;
  };
}) {
  const changed = editing && originalValue !== undefined && value !== originalValue;

  return (
    <>
      <label className="relative">
        {changed && (
          <span className="absolute -left-2.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-accent" />
        )}
        {label}
      </label>
      {editing && onChange ? (
        autocomplete ? (
          <AutocompleteInput
            value={value}
            onChange={onChange}
            getSuggestions={autocomplete.getSuggestions}
            placeholder={autocomplete.placeholder}
          />
        ) : (
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            type={type}
            step={type === 'number' ? 'any' : undefined}
            maxLength={maxLength}
            className="w-full !text-left"
          />
        )
      ) : (
        <CopyableInput value={value} />
      )}
    </>
  );
}
