import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { EphemerisInfo } from 'gnss-js/rtcm3';
import { CONSTELLATION_COLORS } from '../util/gnss-constants';
import {
  CONSTELLATION_SLOTS,
  SYSTEM_ORDER,
  isSatHealthy,
  isEphExpired,
  ephDate,
  getFilterGroups,
  matchesFilter,
  formatAge,
  formatEphTime,
} from '../util/constellation-helpers';
import EphemerisDetail from './EphemerisDetail';

/* ── Constants ────────────────────────────────────────────────── */

const API_URL = '/api/constellation-status';
const POLL_INTERVAL = 30_000;

interface StatusData {
  updatedAt: number;
  satellites: Record<string, EphemerisInfo>;
}

/* ── Main component ───────────────────────────────────────────── */

export default function ConstellationStatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPrn, setSelectedPrn] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string | null>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as StatusData;
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    timerRef.current = setInterval(() => void fetchData(), POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData]);

  const satellites = useMemo(() => {
    if (!data) return new Map<string, EphemerisInfo>();
    return new Map(Object.entries(data.satellites));
  }, [data]);

  const totalSats = satellites.size;
  const healthySats = [...satellites.values()].filter((e) =>
    isSatHealthy(e),
  ).length;
  const unhealthySats = totalSats - healthySats;

  // Tick the "Updated Xs ago" display every 5 seconds
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  const updatedAge = data?.updatedAt ? now - data.updatedAt : null;

  const toggleFilter = useCallback((sys: string, group: string) => {
    setFilters((prev) => ({
      ...prev,
      [sys]: prev[sys] === group ? null : group,
    }));
  }, []);

  // Which constellation owns the selected PRN?
  const selectedSys = selectedPrn?.charAt(0) ?? null;
  const selectedEph = selectedPrn
    ? (satellites.get(selectedPrn) ?? null)
    : null;

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap text-sm">
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="text-fg/40">Loading…</span>
          ) : totalSats > 0 ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-green-400" />
                <span className="text-fg/60">
                  {totalSats} satellites broadcasting
                </span>
              </span>
              {unhealthySats > 0 && (
                <span className="text-red-400">{unhealthySats} unhealthy</span>
              )}
              <span className="text-fg/25 hidden sm:inline">
                — tap a satellite for details
              </span>
            </>
          ) : (
            <span className="text-fg/40">No data available yet</span>
          )}
        </div>
        {updatedAge != null && updatedAge > 0 && (
          <span className="text-xs text-fg/30">
            Updated {formatAge(updatedAge)}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Constellation grids */}
      {SYSTEM_ORDER.map((sys) => {
        const slots = CONSTELLATION_SLOTS[sys]!;
        const color = CONSTELLATION_COLORS[sys] ?? '#7c8aff';
        const sysEphs = [...satellites.values()].filter((e) =>
          e.prn.startsWith(sys),
        );
        const unhealthy = sysEphs.filter((e) => !isSatHealthy(e)).length;
        const filterGroups = getFilterGroups(sys, satellites);
        const activeFilter = filters[sys] ?? null;

        return (
          <section key={sys} className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-base font-semibold" style={{ color }}>
                {slots.label}
              </h3>
              {sysEphs.length > 0 && (
                <span className="text-xs text-fg/40">
                  {sysEphs.length} tracked
                  {unhealthy > 0 && (
                    <span className="text-red-400 ml-1">
                      ({unhealthy} unhealthy)
                    </span>
                  )}
                </span>
              )}
              {filterGroups.length > 1 && (
                <div className="flex gap-1 ml-auto">
                  {filterGroups.map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => toggleFilter(sys, group)}
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                        activeFilter === group
                          ? 'border-accent/50 bg-accent/15 text-accent'
                          : 'border-fg/10 text-fg/30 hover:text-fg/50 hover:border-fg/20'
                      }`}
                    >
                      {group}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(4.5rem, 1fr))',
              }}
            >
              {Array.from({ length: slots.max - slots.min + 1 }, (_, i) => {
                const prn = `${slots.prefix}${String(slots.min + i).padStart(slots.padWidth, '0')}`;
                const eph = satellites.get(prn);
                const hasEph = !!eph;
                const expired = eph ? isEphExpired(eph) : false;
                const isHealthy = eph ? isSatHealthy(eph) : false;
                const isSelected = prn === selectedPrn;
                const date = eph ? ephDate(eph) : null;
                const dimmed =
                  activeFilter !== null &&
                  !matchesFilter(prn, activeFilter, satellites);

                // Three visual states: healthy (green), unhealthy (red), expired (amber/dimmed)
                const cellStyle = dimmed
                  ? 'bg-fg/[0.02] border border-fg/[0.04] opacity-30'
                  : isSelected
                    ? 'ring-2 ring-accent bg-accent/10 border border-accent/30 scale-105'
                    : !hasEph
                      ? 'bg-fg/[0.03] border border-fg/[0.06] cursor-default'
                      : expired
                        ? 'bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 hover:scale-105 hover:shadow-md hover:shadow-amber-500/5'
                        : isHealthy
                          ? 'bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 hover:scale-105 hover:shadow-md hover:shadow-green-500/5'
                          : 'bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:scale-105 hover:shadow-md hover:shadow-red-500/5';

                const prnColor = isSelected
                  ? 'text-accent'
                  : !hasEph
                    ? 'text-fg/20'
                    : expired
                      ? 'text-amber-300/60'
                      : isHealthy
                        ? 'text-green-300'
                        : 'text-red-300';

                const timeColor = isSelected
                  ? 'text-accent/60'
                  : expired
                    ? 'text-amber-400/40'
                    : isHealthy
                      ? 'text-green-400/60'
                      : 'text-red-400/60';

                return (
                  <button
                    key={prn}
                    type="button"
                    disabled={!hasEph}
                    onClick={() => setSelectedPrn(isSelected ? null : prn)}
                    className={`rounded-md px-2 py-1.5 text-center transition-all duration-100 ${cellStyle} ${hasEph ? 'cursor-pointer' : ''}`}
                  >
                    <div
                      className={`text-xs font-mono font-semibold ${prnColor}`}
                    >
                      {prn}
                    </div>
                    {hasEph && (
                      <div className={`text-[10px] ${timeColor}`}>
                        {formatEphTime(date)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Detail panel — appears below the constellation that owns the selected sat */}
            {selectedSys === sys && selectedEph && (
              <EphemerisDetail
                eph={selectedEph}
                onClose={() => setSelectedPrn(null)}
              />
            )}
          </section>
        );
      })}

      {/* Legend */}
      {totalSats > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-fg/40 pt-2 border-t border-border/30">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-green-500/10 border border-green-500/20" />
            Healthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-red-500/10 border border-red-500/20" />
            Unhealthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-amber-500/10 border border-amber-500/20" />
            Expired
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-fg/[0.03] border border-fg/[0.06]" />
            No ephemeris
          </span>
          <span className="ml-auto">
            Source: IGS BCEP00BKG0 broadcast ephemeris
          </span>
        </div>
      )}
    </div>
  );
}
