import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { EditableHeaderFields, RawRinexFile } from '../util/rinex-header-edit';
import { extractEditableFields, splitRinexFile, reconstructFile } from '../util/rinex-header-edit';
import type { RinexResult } from '../util/rinex';
import { systemCmp } from '../util/rinex';
import { SYS_SHORT, systemColor } from '../util/gnss-constants';
import CopyableInput from './CopyableInput';

/* ─── Lazy-loaded equipment data ─────────────────────────────────── */

let _antennas: string[] | null = null;
let _receivers: string[] | null = null;

async function getAntennas(): Promise<string[]> {
  if (_antennas) return _antennas;
  const mod = await import('../data/igs-equipment');
  _antennas = mod.IGS_ANTENNAS;
  return _antennas;
}

async function getReceivers(): Promise<string[]> {
  if (_receivers) return _receivers;
  const mod = await import('../data/igs-equipment');
  _receivers = mod.IGS_RECEIVERS;
  return _receivers;
}

/* ─── Autocomplete input ─────────────────────────────────────────── */

function AutocompleteInput({
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
                i === selectedIdx ? 'bg-accent/20 text-white' : 'text-fg/70 hover:bg-fg/10'
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

/* ─── Icons ──────────────────────────────────────────────────────── */

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
      <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
  );
}

function UndoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd" />
    </svg>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function numStr(v: number): string {
  return v.toFixed(4);
}

/* ─── Observation type matrix (moved from RinexReaderPage) ────────── */

const OBS_TYPE_LABELS: Record<string, string> = {
  C: 'Pseudorange', L: 'Carrier phase', S: 'Signal strength', D: 'Doppler',
};

function ObsTypeMatrix({ obsTypes, systems }: { obsTypes: Record<string, string[]>; systems: string[] }) {
  const isV2 = !!obsTypes['_v2'];
  const sysList = isV2 ? systems : Object.keys(obsTypes).filter(s => s !== '_v2').sort(systemCmp);
  if (sysList.length === 0) return null;

  const codesBySys: Record<string, Set<string>> = {};
  for (const sys of sysList) {
    codesBySys[sys] = new Set(isV2 ? obsTypes['_v2'] : (obsTypes[sys] ?? []));
  }

  const allCodes = new Set<string>();
  for (const set of Object.values(codesBySys)) {
    for (const c of set) allCodes.add(c);
  }
  const grouped: Record<string, string[]> = {};
  for (const code of allCodes) {
    const type = code.charAt(0);
    if (!grouped[type]) grouped[type] = [];
    grouped[type]!.push(code);
  }
  const typeOrder = ['C', 'L', 'D', 'S'];
  const sortedTypes = Object.keys(grouped).sort((a, b) => (typeOrder.indexOf(a) - typeOrder.indexOf(b)));
  for (const t of sortedTypes) grouped[t]!.sort();

  return (
    <div className="col-span-2 mt-1">
      <div className="section-divider" />
      <div className="section-label">Observation types</div>
      <div className="mt-2 overflow-x-auto">
        {sortedTypes.map(type => {
          const codes = grouped[type]!;
          return (
            <div key={type} className="mb-2.5 last:mb-0">
              <div className="text-[10px] uppercase tracking-wider text-fg/30 mb-1">
                {OBS_TYPE_LABELS[type] ?? type}
              </div>
              <div className="grid gap-px" style={{
                gridTemplateColumns: `36px repeat(${codes.length}, minmax(28px, 1fr))`,
              }}>
                <div />
                {codes.map(code => (
                  <div key={code} className="text-center text-[9px] font-mono text-fg/30 pb-0.5">
                    {code}
                  </div>
                ))}
                {sysList.map(sys => {
                  const sysSet = codesBySys[sys]!;
                  const color = systemColor(sys);
                  return (
                    <div key={sys} className="contents">
                      <div className="text-[10px] font-medium h-5 flex items-center" style={{ color }}>
                        {SYS_SHORT[sys] ?? sys}
                      </div>
                      {codes.map(code => {
                        const has = sysSet.has(code);
                        return (
                          <div key={code} className="flex items-center justify-center h-5">
                            {has ? (
                              <span className="size-2.5 rounded-full" style={{ backgroundColor: color, opacity: 0.85 }} />
                            ) : (
                              <span className="size-1.5 rounded-full bg-fg/6" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Inline-editable field ──────────────────────────────────────── */

/**
 * A field that renders as CopyableInput in view mode,
 * and as an editable input in edit mode.
 */
function InlineField({
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

/* ─── Chevron icon for details toggle ─────────────────────────────── */

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */

export interface RinexHeaderEditorProps {
  result: RinexResult;
  file: File;
  readFileText: (file: File) => Promise<string>;
}

export default function RinexHeaderEditor({
  result,
  file,
  readFileText,
}: RinexHeaderEditorProps) {
  const { header, stats } = result;

  const [rawFile, setRawFile] = useState<RawRinexFile | null>(null);
  const [fields, setFields] = useState<EditableHeaderFields | null>(null);
  const [editing, setEditing] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Load raw file text lazily (only when edit mode is activated)
  const loadRawFile = useCallback(async () => {
    if (rawFile) return;
    const text = await readFileText(file);
    const raw = splitRinexFile(text);
    const f = extractEditableFields(raw.headerLines);
    setRawFile(raw);
    setFields(f);
  }, [rawFile, file, readFileText]);

  const handleEditToggle = useCallback(async () => {
    if (!editing) {
      await loadRawFile();
      setEditing(true);
      setDownloaded(false);
      // Auto-open the details panel
      if (detailsRef.current) detailsRef.current.open = true;
    } else {
      setEditing(false);
    }
  }, [editing, loadRawFile]);

  const updateField = useCallback(<K extends keyof EditableHeaderFields>(
    key: K,
    value: EditableHeaderFields[K],
  ) => {
    setFields(prev => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const originalFields = useMemo(() => {
    if (!rawFile) return null;
    return extractEditableFields(rawFile.headerLines);
  }, [rawFile]);

  const hasChanges = useMemo(() => {
    if (!fields || !originalFields) return false;
    return JSON.stringify(fields) !== JSON.stringify(originalFields);
  }, [fields, originalFields]);

  const handleDownload = useCallback(() => {
    if (!rawFile || !fields) return;
    const text = reconstructFile(rawFile, fields);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.replace(/\.gz$/i, '');
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }, [rawFile, fields, file.name]);

  const handleRevert = useCallback(() => {
    if (originalFields) {
      setFields({ ...originalFields });
      setDownloaded(false);
    }
  }, [originalFields]);

  // Count changed fields for the action bar badge
  const changedCount = useMemo(() => {
    if (!fields || !originalFields) return 0;
    let count = 0;
    for (const key of Object.keys(fields) as (keyof EditableHeaderFields)[]) {
      if (String(fields[key]) !== String(originalFields[key])) count++;
    }
    return count;
  }, [fields, originalFields]);

  // Display edited fields once loaded (even after exiting edit mode)
  const f = fields ?? null;
  const orig = originalFields;

  // Count how many header groups have data (for the summary line)
  const hasReceiver = !!(header.receiverType || header.receiverNumber);
  const hasAntenna = !!(header.antType || header.antNumber);
  const hasPosition = !!(header.approxPosition && (header.approxPosition[0] !== 0 || header.approxPosition[1] !== 0 || header.approxPosition[2] !== 0));
  const hasObserver = !!(header.observer || header.agency);

  const summaryParts: string[] = [];
  if (hasReceiver) summaryParts.push(header.receiverType || 'Receiver');
  if (hasAntenna) summaryParts.push(header.antType || 'Antenna');
  if (hasPosition) summaryParts.push('Position');
  if (hasObserver) summaryParts.push(header.agency || header.observer || 'Observer');

  return (
    <details ref={detailsRef} className="group rounded-xl bg-bg-raised/60 border border-border/40 overflow-hidden">
      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <ChevronIcon className="size-4 text-fg/30 shrink-0 transition-transform group-open:rotate-90" />
        <span className="text-sm font-semibold text-white/90 shrink-0">Header & Observation Types</span>
        {!editing && summaryParts.length > 0 && (
          <span className="text-[10px] text-fg/30 truncate min-w-0">
            {summaryParts.join(' · ')}
          </span>
        )}
        {editing && hasChanges && (
          <span className="text-[10px] text-accent shrink-0">
            {changedCount} field{changedCount !== 1 ? 's' : ''} changed
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {/* Download + Revert: always visible in the bar while editing */}
          {editing && hasChanges && (
            <>
              <button
                type="button"
                className="btn-secondary flex items-center gap-1 !py-0.5 !px-2 !text-[11px]"
                onClick={(e) => { e.preventDefault(); handleRevert(); }}
                title="Revert all changes"
              >
                <UndoIcon className="size-2.5" />
                Revert
              </button>
              <button
                type="button"
                className="btn flex items-center gap-1 !py-0.5 !px-2 !text-[11px]"
                onClick={(e) => { e.preventDefault(); handleDownload(); }}
              >
                <DownloadIcon className="size-3" />
                {downloaded ? 'Download again' : 'Download'}
              </button>
            </>
          )}
          <button
            type="button"
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              editing
                ? 'text-accent hover:text-accent/80'
                : 'text-fg/40 hover:text-fg/70'
            }`}
            onClick={(e) => { e.preventDefault(); handleEditToggle(); }}
            title={editing ? 'Stop editing' : 'Edit header fields'}
          >
            <PencilIcon className="size-3" />
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </summary>

      <div className="px-4 pb-4">
        <div className="card-fields">
          {/* ── Header fields (editable when in edit mode) ─────── */}
          <InlineField
            label="Marker"
            value={f ? f.markerName : (header.markerName || '—')}
            originalValue={orig?.markerName}
            editing={editing}
            onChange={v => updateField('markerName', v)}
            maxLength={60}
          />

          {(editing || header.markerType) && (
            <InlineField
              label="Marker type"
              value={f ? f.markerType : header.markerType}
              originalValue={orig?.markerType}
              editing={editing}
              onChange={v => updateField('markerType', v)}
              maxLength={60}
            />
          )}

          {/* ── Receiver ──────────────────────────────────────── */}
          {(editing || hasReceiver) && (
            <>
              <div className="section-divider" />
              <div className="section-label">Receiver</div>
              {(editing || header.receiverNumber) && (
                <InlineField
                  label="Serial"
                  value={f ? f.receiverNumber : header.receiverNumber}
                  originalValue={orig?.receiverNumber}
                  editing={editing}
                  onChange={v => updateField('receiverNumber', v)}
                  maxLength={20}
                />
              )}
              <InlineField
                label="Type"
                value={f ? f.receiverType : header.receiverType}
                originalValue={orig?.receiverType}
                editing={editing}
                onChange={v => updateField('receiverType', v)}
                autocomplete={editing ? { getSuggestions: getReceivers, placeholder: 'e.g. LEICA GR25' } : undefined}
              />
              {(editing || header.receiverVersion) && (
                <InlineField
                  label="Firmware"
                  value={f ? f.receiverVersion : header.receiverVersion}
                  originalValue={orig?.receiverVersion}
                  editing={editing}
                  onChange={v => updateField('receiverVersion', v)}
                  maxLength={20}
                />
              )}
            </>
          )}

          {/* ── Antenna ───────────────────────────────────────── */}
          {(editing || hasAntenna) && (
            <>
              <div className="section-divider" />
              <div className="section-label">Antenna</div>
              {(editing || header.antNumber) && (
                <InlineField
                  label="Serial"
                  value={f ? f.antNumber : header.antNumber}
                  originalValue={orig?.antNumber}
                  editing={editing}
                  onChange={v => updateField('antNumber', v)}
                  maxLength={20}
                />
              )}
              <InlineField
                label="Type"
                value={f ? f.antType : header.antType}
                originalValue={orig?.antType}
                editing={editing}
                onChange={v => updateField('antType', v)}
                autocomplete={editing ? { getSuggestions: getAntennas, placeholder: 'e.g. LEIAR25.R4      LEIT' } : undefined}
              />
            </>
          )}

          {/* ── Antenna offset ────────────────────────────────── */}
          {(editing || (header.antDelta && (header.antDelta[0] !== 0 || header.antDelta[1] !== 0 || header.antDelta[2] !== 0))) && (
            <>
              {!hasAntenna && <><div className="section-divider" /><div className="section-label">Antenna</div></>}
              <InlineField
                label="Offset H"
                value={f ? numStr(f.antDeltaH) : numStr(header.antDelta?.[0] ?? 0)}
                originalValue={orig ? numStr(orig.antDeltaH) : undefined}
                editing={editing}
                onChange={v => updateField('antDeltaH', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Offset E"
                value={f ? numStr(f.antDeltaE) : numStr(header.antDelta?.[1] ?? 0)}
                originalValue={orig ? numStr(orig.antDeltaE) : undefined}
                editing={editing}
                onChange={v => updateField('antDeltaE', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Offset N"
                value={f ? numStr(f.antDeltaN) : numStr(header.antDelta?.[2] ?? 0)}
                originalValue={orig ? numStr(orig.antDeltaN) : undefined}
                editing={editing}
                onChange={v => updateField('antDeltaN', parseFloat(v) || 0)}
                type="number"
              />
            </>
          )}

          {/* ── Position ──────────────────────────────────────── */}
          {(editing || hasPosition) && (
            <>
              <div className="section-divider" />
              <div className="section-label">Approx position (ECEF)</div>
              <InlineField
                label="X (m)"
                value={f ? numStr(f.positionX) : numStr(header.approxPosition?.[0] ?? 0)}
                originalValue={orig ? numStr(orig.positionX) : undefined}
                editing={editing}
                onChange={v => updateField('positionX', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Y (m)"
                value={f ? numStr(f.positionY) : numStr(header.approxPosition?.[1] ?? 0)}
                originalValue={orig ? numStr(orig.positionY) : undefined}
                editing={editing}
                onChange={v => updateField('positionY', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Z (m)"
                value={f ? numStr(f.positionZ) : numStr(header.approxPosition?.[2] ?? 0)}
                originalValue={orig ? numStr(orig.positionZ) : undefined}
                editing={editing}
                onChange={v => updateField('positionZ', parseFloat(v) || 0)}
                type="number"
              />
            </>
          )}

          {/* ── Observer ──────────────────────────────────────── */}
          {(editing || hasObserver) && (
            <>
              <div className="section-divider" />
              <div className="section-label">Observer</div>
              <InlineField
                label="Name"
                value={f ? f.observer : header.observer}
                originalValue={orig?.observer}
                editing={editing}
                onChange={v => updateField('observer', v)}
                maxLength={20}
              />
              <InlineField
                label="Agency"
                value={f ? f.agency : header.agency}
                originalValue={orig?.agency}
                editing={editing}
                onChange={v => updateField('agency', v)}
                maxLength={40}
              />
            </>
          )}

          {/* ── Observation type matrix ───────────────────────── */}
          {header.obsTypes && Object.keys(header.obsTypes).length > 0 && (
            <ObsTypeMatrix obsTypes={header.obsTypes} systems={stats.systems} />
          )}
        </div>

      </div>
    </details>
  );
}
