import { useEffect, useRef, useState } from 'react';

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
};

export default function AddressSearch({
  onSelect,
}: {
  onSelect: (lat: number, lon: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const skipNextSearch = useRef(false);

  const search = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams(
        {
          q: trimmed,
          format: 'json',
          limit: '5',
        },
      )}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept-Language': navigator.language },
      });
      if (!res.ok) throw new Error(res.statusText);
      const data = (await res.json()) as NominatimResult[];
      setResults(data);
      setOpen(true);
      setActiveIndex(-1);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    clearTimeout(debounceRef.current);
    if (query.trim().length >= 3) {
      setLoading(true);
    }
    debounceRef.current = setTimeout(() => void search(query), 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const select = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    onSelect(lat, lon);
    skipNextSearch.current = true;
    setQuery(result.display_name);
    setOpen(false);
  };

  const clear = () => {
    abortRef.current?.abort();
    setQuery('');
    setResults([]);
    setOpen(false);
    setLoading(false);
  };

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">
          {loading ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="size-3.5 text-fg/30 animate-spin"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 text-fg/30"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          )}
        </div>
        <input
          type="text"
          autoComplete="off"
          className="w-full rounded-lg bg-input/70 border border-border/50 text-left text-sm pl-8 pr-7 py-1.5 placeholder:text-fg/30 focus:border-accent/50 focus:outline-none transition-colors"
          placeholder="Search address..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (
              e.key === 'Enter' &&
              activeIndex >= 0 &&
              results[activeIndex]
            ) {
              e.preventDefault();
              select(results[activeIndex]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="absolute inset-y-0 right-1.5 flex items-center text-fg/30 hover:text-fg/60 bg-transparent border-0 p-0 m-0 cursor-pointer transition-colors"
            onClick={clear}
            tabIndex={-1}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <ul className="absolute z-10 left-0 right-0 mt-1.5 rounded-lg bg-bg-raised border border-border/60 overflow-hidden shadow-xl shadow-black/40">
          {results.length > 0 ? (
            results.map((r, i) => (
              <li key={`${r.lat},${r.lon}`}>
                <button
                  type="button"
                  className={`w-full flex items-start gap-2.5 text-left px-3 py-2 text-xs leading-relaxed border-0 bg-transparent text-fg m-0 rounded-none transition-colors cursor-pointer ${
                    i === activeIndex ? 'bg-fg/10' : 'hover:bg-fg/5'
                  }`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(r)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5 shrink-0 mt-0.5 text-fg/40"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2.5 text-xs text-fg/40">No results found</li>
          )}
        </ul>
      )}
    </div>
  );
}
