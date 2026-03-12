import { useState, useCallback, useRef, useEffect } from 'react';

export default function AutocompleteInput({
  value,
  onChange,
  getSuggestions,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  getSuggestions: () => Promise<string[]>;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const handleFocus = useCallback(async () => {
    if (suggestions.length === 0) {
      const items = await getSuggestions();
      setSuggestions(items);
      if (value) {
        const upper = value.toUpperCase();
        setFiltered(items.filter(s => s.toUpperCase().includes(upper)).slice(0, 50));
      }
    }
    setOpen(true);
  }, [getSuggestions, suggestions.length, value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    const upper = v.toUpperCase();
    setFiltered(
      v ? suggestions.filter(s => s.toUpperCase().includes(upper)).slice(0, 50) : [],
    );
    setOpen(true);
    setSelectedIdx(-1);
  }, [onChange, suggestions]);

  const handleSelect = useCallback((item: string) => {
    onChange(item);
    setOpen(false);
    setSelectedIdx(-1);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      handleSelect(filtered[selectedIdx]!);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [open, filtered, selectedIdx, handleSelect]);

  useEffect(() => {
    if (selectedIdx >= 0 && listRef.current) {
      const el = listRef.current.children[selectedIdx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative min-w-0">
      <input
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full !text-left"
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 top-full mt-0.5 max-h-48 overflow-y-auto rounded-md border border-border/60 bg-bg-raised shadow-lg"
        >
          {filtered.map((item, i) => (
            <li
              key={item}
              className={`px-2 py-1 text-xs font-mono cursor-pointer ${
                i === selectedIdx ? 'bg-accent/20 text-fg-strong' : 'text-fg/70 hover:bg-fg/10'
              }`}
              onMouseDown={() => handleSelect(item)}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
