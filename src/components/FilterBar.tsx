import { useState, useCallback, useMemo } from 'react';
import type { FilterState } from '../util/rinex-client';
import { systemColor } from '../util/gnss-constants';
import { systemName } from '../util/rinex';

/* ─── Chevron icon ─────────────────────────────────────────────── */

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
      className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''} ${className ?? ''}`}
    >
      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  );
}

/* ─── Help hint icon ───────────────────────────────────────────── */

function HintIcon({ hint }: { hint: string }) {
  return (
    <span className="group relative ml-1 inline-flex cursor-help" aria-label={hint}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3 text-fg/20 group-hover:text-fg/40 transition-colors">
        <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0Zm-6 3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM7.293 5.293a1 1 0 1 1 .99 1.667c-.169.108-.308.245-.408.404a.75.75 0 1 0 1.25.834c.2-.3.478-.557.803-.747A2.5 2.5 0 1 0 5.5 5.5a.75.75 0 0 0 1.5 0 1 1 0 0 1 .293-.707Z" clipRule="evenodd" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 rounded bg-bg-raised px-2 py-1.5 text-[9px] font-normal normal-case tracking-normal text-fg/60 border border-border/30 shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-20 leading-tight">
        {hint}
      </span>
    </span>
  );
}

/* ─── Signal type labels ───────────────────────────────────────── */

const SIGNAL_TYPES = [
  { key: 'C', label: 'Code', desc: 'Pseudorange' },
  { key: 'L', label: 'Phase', desc: 'Carrier phase' },
  { key: 'D', label: 'Doppler', desc: 'Doppler shift' },
  { key: 'S', label: 'SNR', desc: 'Signal strength' },
] as const;

/* ─── Per-system signal names (band+attribute → human label) ──── */

/** Maps system letter → band+attr suffix → human-readable signal name. */
const SIGNAL_NAMES: Record<string, Record<string, string>> = {
  G: {
    '1C': 'L1 C/A', '1S': 'L1C (D)', '1L': 'L1C (P)', '1X': 'L1C (D+P)',
    '1P': 'L1 P', '1W': 'L1 Z-tracking', '1Y': 'L1 Y', '1M': 'L1 M', '1N': 'L1 codeless',
    '2C': 'L2 C/A', '2D': 'L2 semi-codeless', '2S': 'L2C (M)', '2L': 'L2C (L)', '2X': 'L2C (M+L)',
    '2P': 'L2 P', '2W': 'L2 Z-tracking', '2Y': 'L2 Y', '2M': 'L2 M', '2N': 'L2 codeless',
    '5I': 'L5 I', '5Q': 'L5 Q', '5X': 'L5 I+Q',
  },
  R: {
    '1C': 'G1 C/A', '1P': 'G1 P',
    '4A': 'G1a L1OCd', '4B': 'G1a L1OCp', '4X': 'G1a L1OCd+p',
    '2C': 'G2 C/A', '2P': 'G2 P',
    '6A': 'G2a L2CSI', '6B': 'G2a L2OCp', '6X': 'G2a L2CSI+OCp',
    '3I': 'G3 I', '3Q': 'G3 Q', '3X': 'G3 I+Q',
  },
  E: {
    '1A': 'E1 PRS', '1B': 'E1 OS data', '1C': 'E1 OS pilot', '1X': 'E1 B+C', '1Z': 'E1 A+B+C',
    '5I': 'E5a I', '5Q': 'E5a Q', '5X': 'E5a I+Q',
    '7I': 'E5b I', '7Q': 'E5b Q', '7X': 'E5b I+Q',
    '8I': 'E5 AltBOC I', '8Q': 'E5 AltBOC Q', '8X': 'E5 AltBOC I+Q',
    '6A': 'E6 PRS', '6B': 'E6 CS', '6C': 'E6 C', '6X': 'E6 B+C', '6Z': 'E6 A+B+C',
  },
  C: {
    '2I': 'B1I I', '2Q': 'B1I Q', '2X': 'B1I I+Q',
    '1D': 'B1C data', '1P': 'B1C pilot', '1X': 'B1C D+P',
    '1S': 'B1A data', '1L': 'B1A pilot', '1Z': 'B1A D+P',
    '5D': 'B2a data', '5P': 'B2a pilot', '5X': 'B2a D+P',
    '7I': 'B2I I', '7Q': 'B2I Q', '7X': 'B2I I+Q',
    '7D': 'B2b data', '7P': 'B2b pilot', '7Z': 'B2b D+P',
    '8D': 'B2(a+b) data', '8P': 'B2(a+b) pilot', '8X': 'B2(a+b) D+P',
    '6I': 'B3I I', '6Q': 'B3I Q', '6X': 'B3I I+Q',
    '6D': 'B3A data', '6P': 'B3A pilot', '6Z': 'B3A D+P',
  },
  J: {
    '1C': 'L1 C/A', '1S': 'L1C (D)', '1L': 'L1C (P)', '1X': 'L1C (D+P)', '1Z': 'L1S/SAIF', '1B': 'L1Sb',
    '2S': 'L2C (M)', '2L': 'L2C (L)', '2X': 'L2C (M+L)',
    '5I': 'L5 I', '5Q': 'L5 Q', '5X': 'L5 I+Q', '5D': 'L5S (I)', '5P': 'L5S (Q)', '5Z': 'L5S (I+Q)',
    '6S': 'L6D', '6L': 'L6P', '6X': 'L6 D+P', '6E': 'L6E', '6Z': 'L6 D+E',
  },
  I: {
    '1D': 'L1 data', '1P': 'L1 pilot', '1X': 'L1 D+P',
    '5A': 'L5 SPS', '5B': 'L5 RS (D)', '5C': 'L5 RS (P)', '5X': 'L5 B+C',
    '9A': 'S SPS', '9B': 'S RS (D)', '9C': 'S RS (P)', '9X': 'S B+C',
  },
  S: {
    '1C': 'L1 C/A',
    '5I': 'L5 I', '5Q': 'L5 Q', '5X': 'L5 I+Q',
  },
};

/** Get human-readable signal name, with fallback. */
function signalLabel(sys: string, suffix: string): string {
  return SIGNAL_NAMES[sys]?.[suffix] ?? `${suffix}`;
}

/* ─── Props ────────────────────────────────────────────────────── */

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  /** All PRNs in the unfiltered dataset. */
  availablePrns: string[];
  /** All obs codes per system in the unfiltered dataset. */
  availableCodes: Record<string, string[]>;
  /** All systems present in the original (unfiltered) data. */
  allSystems: string[];
  /** Time bounds of the data (unix ms). */
  timeStart: number | null;
  timeEnd: number | null;
  /** Original sampling interval in seconds. */
  interval: number | null;
}

export default function FilterBar({
  filters, onChange, availablePrns, availableCodes, allSystems,
  timeStart, timeEnd, interval,
}: FilterBarProps) {
  const [open, setOpen] = useState(false);

  // Derive available bands from codes
  const availableBands = useMemo(() => {
    const bands = new Set<string>();
    for (const codes of Object.values(availableCodes)) {
      for (const code of codes) {
        if (code[1]) bands.add(code[1]);
      }
    }
    return [...bands].sort();
  }, [availableCodes]);

  // Group PRNs by system
  const prnsBySystem = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const prn of availablePrns) {
      const sys = prn[0]!;
      (map[sys] ??= []).push(prn);
    }
    return map;
  }, [availablePrns]);

  // Derive unique signals (2-char suffix) per system from available codes
  const signalsPerSystem = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [sys, codes] of Object.entries(availableCodes)) {
      const seen = new Set<string>();
      const sigs: string[] = [];
      for (const code of codes) {
        const suffix = code.slice(1); // e.g. '1C' from 'C1C'
        if (!seen.has(suffix)) {
          seen.add(suffix);
          sigs.push(suffix);
        }
      }
      if (sigs.length > 0) map[sys] = sigs;
    }
    return map;
  }, [availableCodes]);

  // Count per-system excluded signals
  const perSysExcludedCount = useMemo(() => {
    let count = 0;
    for (const sigs of Object.values(filters.excludedSignalsPerSystem)) {
      count += sigs.length;
    }
    return count;
  }, [filters.excludedSignalsPerSystem]);

  const toggleSystem = useCallback((sys: string) => {
    const ex = filters.excludedSystems;
    const next = ex.includes(sys) ? ex.filter(s => s !== sys) : [...ex, sys];
    onChange({ ...filters, excludedSystems: next });
  }, [filters, onChange]);

  const hasActiveFilters = filters.excludedSystems.length > 0
    || filters.excludedPrns.length > 0
    || filters.excludedSignalTypes.length > 0
    || filters.excludedBands.length > 0
    || filters.timeStart != null
    || filters.timeEnd != null
    || filters.samplingInterval != null
    || filters.sparseThreshold > 0
    || perSysExcludedCount > 0;

  const handleReset = useCallback(() => {
    onChange({
      excludedSystems: [],
      excludedPrns: [],
      excludedSignalTypes: [],
      excludedBands: [],
      timeStart: null,
      timeEnd: null,
      samplingInterval: null,
      sparseThreshold: 0,
      excludedSignalsPerSystem: {},
    });
  }, [onChange]);

  const togglePrn = useCallback((prn: string) => {
    const ex = filters.excludedPrns;
    const next = ex.includes(prn) ? ex.filter(p => p !== prn) : [...ex, prn];
    onChange({ ...filters, excludedPrns: next });
  }, [filters, onChange]);

  const toggleSignalType = useCallback((type: string) => {
    const ex = filters.excludedSignalTypes;
    const next = ex.includes(type) ? ex.filter(t => t !== type) : [...ex, type];
    onChange({ ...filters, excludedSignalTypes: next });
  }, [filters, onChange]);

  const toggleBand = useCallback((band: string) => {
    const ex = filters.excludedBands;
    const next = ex.includes(band) ? ex.filter(b => b !== band) : [...ex, band];
    onChange({ ...filters, excludedBands: next });
  }, [filters, onChange]);

  const toggleSignal = useCallback((sys: string, sig: string) => {
    const prev = filters.excludedSignalsPerSystem;
    const sysSigs = prev[sys] ?? [];
    const next = sysSigs.includes(sig)
      ? sysSigs.filter(s => s !== sig)
      : [...sysSigs, sig];
    const updated = { ...prev };
    if (next.length > 0) {
      updated[sys] = next;
    } else {
      delete updated[sys];
    }
    onChange({ ...filters, excludedSignalsPerSystem: updated });
  }, [filters, onChange]);

  // Count of active filters
  const filterCount = filters.excludedSystems.length
    + filters.excludedPrns.length
    + filters.excludedSignalTypes.length
    + filters.excludedBands.length
    + perSysExcludedCount
    + (filters.timeStart != null ? 1 : 0)
    + (filters.timeEnd != null ? 1 : 0)
    + (filters.samplingInterval != null ? 1 : 0)
    + (filters.sparseThreshold > 0 ? 1 : 0);

  return (
    <div className="rounded-lg border border-border/30 bg-bg-raised/40 overflow-hidden">
      {/* Header row: filter toggle + constellation badges (always visible) */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          className="flex items-center gap-2 text-[11px] text-fg/40 hover:text-fg/60 transition-colors shrink-0"
          onClick={() => setOpen(v => !v)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
            <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
          </svg>
          Filters
          {filterCount > 0 && (
            <span className="inline-flex items-center justify-center size-4 rounded-full bg-accent/20 text-accent text-[9px] font-bold">
              {filterCount}
            </span>
          )}
        </button>

        {/* Constellation badges — always visible */}
        <div className="flex flex-wrap gap-1 items-center">
          {allSystems.map(sys => {
            const excluded = filters.excludedSystems.includes(sys);
            const c = systemColor(sys);
            return (
              <button
                key={sys}
                type="button"
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none cursor-pointer transition-all hover:scale-105 select-none${
                  excluded ? ' opacity-30' : ''
                }`}
                style={excluded
                  ? { backgroundColor: 'transparent', color: c, border: `1px solid ${c}30` }
                  : { backgroundColor: `${c}18`, color: c, border: `1px solid ${c}30` }
                }
                onClick={() => toggleSystem(sys)}
                title={`${excluded ? 'Include' : 'Exclude'} ${systemName(sys)}`}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: excluded ? `${c}40` : c }}
                />
                {systemName(sys)}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="ml-auto text-fg/30 hover:text-fg/50 transition-colors shrink-0"
          onClick={() => setOpen(v => !v)}
        >
          <ChevronIcon open={open} />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border/20 flex flex-col gap-3">
          {/* Callout */}
          <div className="flex items-start gap-2 rounded-md bg-accent/5 border border-accent/15 px-2.5 py-1.5 text-[10px] text-fg/50 leading-relaxed">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5 shrink-0 mt-0.5 text-accent/50">
              <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
            </svg>
            Filters apply to both the analysis (charts, QA, statistics) and exported files. The original data is never modified.
          </div>

          {/* Signal types */}
          <div>
            <div className="text-[10px] text-fg/30 mb-1.5 uppercase tracking-wider flex items-center">Signal types<HintIcon hint="Filter by measurement type. Code = pseudorange, Phase = carrier phase, Doppler = frequency shift, SNR = signal strength. Applies across all constellations." /></div>
            <div className="flex flex-wrap gap-1.5">
              {SIGNAL_TYPES.map(({ key, label, desc }) => {
                const excluded = filters.excludedSignalTypes.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all border ${
                      excluded
                        ? 'border-border/20 text-fg/20 bg-transparent line-through'
                        : 'border-accent/30 text-accent bg-accent/10'
                    }`}
                    onClick={() => toggleSignalType(key)}
                    title={`${excluded ? 'Include' : 'Exclude'} ${desc}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bands */}
          <div>
            <div className="text-[10px] text-fg/30 mb-1.5 uppercase tracking-wider flex items-center">Frequency bands<HintIcon hint="Exclude entire frequency bands (L1, L2, L5, etc.) across all constellations. Band numbering follows the RINEX convention and varies per system." /></div>
            <div className="flex flex-wrap gap-1.5">
              {availableBands.map(band => {
                const excluded = filters.excludedBands.includes(band);
                return (
                  <button
                    key={band}
                    type="button"
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all border ${
                      excluded
                        ? 'border-border/20 text-fg/20 bg-transparent line-through'
                        : 'border-accent/30 text-accent bg-accent/10'
                    }`}
                    onClick={() => toggleBand(band)}
                    title={`${excluded ? 'Include' : 'Exclude'} band ${band}`}
                  >
                    L{band}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Per-constellation signals */}
          <div>
            <div className="text-[10px] text-fg/30 mb-1.5 uppercase tracking-wider flex items-center">Signals per constellation<HintIcon hint="Toggle individual signals per constellation. Each button represents a RINEX signal (band + tracking attribute, e.g. 1C = L1 C/A). Excludes all observation types (C/L/D/S) for that signal. Hover a signal for its name." /></div>
            <div className="flex flex-col gap-2">
              {allSystems.map(sys => {
                const sigs = signalsPerSystem[sys];
                if (!sigs || sigs.length === 0) return null;
                const c = systemColor(sys);
                const sysExcluded = filters.excludedSystems.includes(sys);
                const sysExSigs = filters.excludedSignalsPerSystem[sys] ?? [];
                return (
                  <div key={sys} className={sysExcluded ? 'opacity-30' : ''}>
                    <div className="text-[10px] font-medium mb-1" style={{ color: c }}>
                      {systemName(sys)}
                      {sysExcluded && <span className="text-fg/30 ml-1">(excluded)</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sigs.map(sig => {
                        const band = sig[0]!;
                        const globallyExcluded = filters.excludedBands.includes(band);
                        const perSysExcluded = sysExSigs.includes(sig);
                        const excluded = sysExcluded || globallyExcluded || perSysExcluded;
                        const name = signalLabel(sys, sig);
                        return (
                          <button
                            key={sig}
                            type="button"
                            className={`group relative px-1.5 py-0.5 rounded text-[10px] font-mono transition-all border ${
                              excluded
                                ? 'border-border/15 text-fg/15 bg-transparent line-through'
                                : 'border-border/30 text-fg/60 bg-bg-raised/60'
                            }`}
                            onClick={() => !sysExcluded && !globallyExcluded && toggleSignal(sys, sig)}
                            disabled={sysExcluded || globallyExcluded}
                            title={sysExcluded
                              ? `${systemName(sys)} is excluded`
                              : globallyExcluded
                                ? `Excluded by global band L${band} filter`
                                : `${excluded ? 'Include' : 'Exclude'} ${name} (${sig})`}
                          >
                            {sig}
                            {/* Tooltip with signal name on hover */}
                            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-bg-raised px-1.5 py-0.5 text-[9px] font-sans text-fg/70 border border-border/30 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              {name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PRN exclusion per system */}
          <div>
            <div className="text-[10px] text-fg/30 mb-1.5 uppercase tracking-wider flex items-center">Satellites<HintIcon hint="Exclude individual satellites (PRNs). Useful for removing specific vehicles with known issues, e.g. unhealthy or maneuvering satellites." /></div>
            <div className="flex flex-col gap-2">
              {allSystems.map(sys => {
                const prns = prnsBySystem[sys];
                if (!prns || prns.length === 0) return null;
                const c = systemColor(sys);
                const sysExcluded = filters.excludedSystems.includes(sys);
                return (
                  <div key={sys} className={sysExcluded ? 'opacity-30' : ''}>
                    <div className="text-[10px] font-medium mb-1" style={{ color: c }}>
                      {systemName(sys)}
                      {sysExcluded && <span className="text-fg/30 ml-1">(excluded)</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {prns.map(prn => {
                        const excluded = sysExcluded || filters.excludedPrns.includes(prn);
                        return (
                          <button
                            key={prn}
                            type="button"
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all border ${
                              excluded
                                ? 'border-border/15 text-fg/15 bg-transparent line-through'
                                : 'border-border/30 text-fg/60 bg-bg-raised/60'
                            }`}
                            onClick={() => !sysExcluded && togglePrn(prn)}
                            disabled={sysExcluded}
                            title={sysExcluded
                              ? `${systemName(sys)} is excluded`
                              : `${excluded ? 'Include' : 'Exclude'} ${prn}`}
                          >
                            {prn}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time range + sampling + sparse removal */}
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 items-start">
            <div>
              <div className="text-[10px] text-fg/30 mb-1 uppercase tracking-wider flex items-center">Time range<HintIcon hint="Crop the dataset to a time window. Times are in UTC. Useful for isolating a specific session or event." /></div>
              <div className="flex flex-col gap-1">
                <input
                  type="datetime-local"
                  className="w-full bg-bg/60 border border-border/30 rounded px-2 py-1 text-[11px] text-fg/70 focus:border-accent/50 outline-none"
                  value={filters.timeStart != null ? toLocalISO(filters.timeStart) : (timeStart != null ? toLocalISO(timeStart) : '')}
                  onChange={e => {
                    const v = e.target.value ? new Date(e.target.value + 'Z').getTime() : null;
                    onChange({ ...filters, timeStart: v });
                  }}
                  step="1"
                />
                <input
                  type="datetime-local"
                  className="w-full bg-bg/60 border border-border/30 rounded px-2 py-1 text-[11px] text-fg/70 focus:border-accent/50 outline-none"
                  value={filters.timeEnd != null ? toLocalISO(filters.timeEnd) : (timeEnd != null ? toLocalISO(timeEnd) : '')}
                  onChange={e => {
                    const v = e.target.value ? new Date(e.target.value + 'Z').getTime() : null;
                    onChange({ ...filters, timeEnd: v });
                  }}
                  step="1"
                />
              </div>
            </div>

            <div>
              <div className="text-[10px] text-fg/30 mb-1 uppercase tracking-wider flex items-center">Sampling<HintIcon hint="Decimate epochs to a lower rate. Keeps only epochs that match the selected interval. Reduces data volume for export or faster analysis." /></div>
              <select
                className="w-full bg-bg/60 border border-border/30 rounded px-2 py-1 text-[11px] text-fg/70 focus:border-accent/50 outline-none"
                value={filters.samplingInterval ?? ''}
                onChange={e => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  onChange({ ...filters, samplingInterval: v });
                }}
              >
                <option value="">Original{interval != null ? ` (${interval}s)` : ''}</option>
                <option value="1">1s</option>
                <option value="5">5s</option>
                <option value="10">10s</option>
                <option value="15">15s</option>
                <option value="30">30s</option>
                <option value="60">1 min</option>
                <option value="120">2 min</option>
                <option value="300">5 min</option>
                <option value="600">10 min</option>
                <option value="900">15 min</option>
                <option value="1800">30 min</option>
                <option value="3600">1 hour</option>
              </select>
            </div>

            <div>
              <div className="text-[10px] text-fg/30 mb-1 uppercase tracking-wider flex items-center">Sparse removal<HintIcon hint="Remove signals that appear in fewer than X% of epochs. Cleans up sporadically tracked signals that add noise without useful data." /></div>
              <select
                className="w-full bg-bg/60 border border-border/30 rounded px-2 py-1 text-[11px] text-fg/70 focus:border-accent/50 outline-none"
                value={filters.sparseThreshold}
                onChange={e => onChange({ ...filters, sparseThreshold: Number(e.target.value) })}
              >
                <option value="0">Off</option>
                <option value="1">{'< 1%'}</option>
                <option value="5">{'< 5%'}</option>
                <option value="10">{'< 10%'}</option>
                <option value="25">{'< 25%'}</option>
                <option value="50">{'< 50%'}</option>
              </select>
            </div>
          </div>

          {/* Reset */}
          {hasActiveFilters && (
            <button
              type="button"
              className="self-start text-[11px] text-fg/30 hover:text-fg/60 transition-colors underline underline-offset-2"
              onClick={handleReset}
            >
              Reset all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Convert unix ms to datetime-local input value (UTC). */
function toLocalISO(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}-${mo}-${dy}T${h}:${mi}:${s}`;
}
