import { useMemo, useState, useRef, useEffect } from 'react';
import type { SatCn0 } from 'gnss-js/rtcm3';
import type { EphemerisInfo } from 'gnss-js/rtcm3';
import { CONSTELLATION_COLORS } from '../util/gnss-constants';

const SYSTEM_PREFIX_TO_NAME: Record<string, string> = {
  G: 'GPS',
  R: 'GLONASS',
  E: 'Galileo',
  C: 'BeiDou',
  J: 'QZSS',
  I: 'NavIC',
  S: 'SBAS',
};

const CONSTELLATION_ORDER = [
  'GPS',
  'GLONASS',
  'Galileo',
  'BeiDou',
  'QZSS',
  'SBAS',
  'NavIC',
];

/* ─── Types ───────────────────────────────────────────────────── */

interface SatInfo {
  prn: string;
  constellation: string;
  observed: boolean;
  cn0: number | null;
  hasEphemeris: boolean;
  ephemeris: EphemerisInfo | null;
}

interface ConstellationGroup {
  name: string;
  color: string;
  sats: SatInfo[];
  observed: number;
  withEph: number;
}

interface Props {
  satellites: Map<string, SatCn0>;
  ephemerides: Map<string, EphemerisInfo>;
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function rad2deg(r: number): string {
  return ((r * 180) / Math.PI).toFixed(2) + '°';
}

function formatSciNum(n: number, digits = 4): string {
  if (Math.abs(n) < 0.001 || Math.abs(n) >= 1e6) return n.toExponential(digits);
  return n.toFixed(digits + 1);
}

/* ─── Tooltip component ──────────────────────────────────────── */

function SatelliteTooltip({
  sat,
  color,
  tileRect,
}: {
  sat: SatInfo;
  color: string;
  tileRect: DOMRect | null;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!tileRect || !tooltipRef.current) return;
    const tt = tooltipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = tileRect.left + tileRect.width / 2 - tt.width / 2;
    let top = tileRect.top - tt.height - 8;

    // Flip below if no room above
    if (top < 8) top = tileRect.bottom + 8;
    // Clamp horizontally
    if (left < 8) left = 8;
    if (left + tt.width > vw - 8) left = vw - tt.width - 8;
    // Clamp vertically
    if (top + tt.height > vh - 8) top = vh - tt.height - 8;

    setPos({ left, top });
  }, [tileRect]);

  const eph = sat.ephemeris;
  const isGlonass = sat.constellation === 'GLONASS';

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] w-60 rounded-lg border border-border/50 shadow-2xl p-3 text-xs pointer-events-none"
      style={{
        background: 'linear-gradient(135deg, #13131f 0%, #1a1a2e 100%)',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        opacity: pos ? 1 : 0,
        transition: 'opacity 0.1s',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono font-bold text-sm" style={{ color }}>
          {sat.prn}
        </span>
        <div className="flex items-center gap-1.5">
          {sat.hasEphemeris && (
            <span
              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: color + '20', color }}
            >
              EPH
            </span>
          )}
          {eph != null && (
            <span
              className={`text-[9px] font-medium ${eph.health === 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {eph.health === 0 ? 'Healthy' : 'Unhealthy'}
            </span>
          )}
        </div>
      </div>

      {/* C/N0 bar */}
      {sat.cn0 != null && (
        <div className="mb-2.5">
          <div className="flex justify-between text-fg/40 mb-1">
            <span>C/N&#x2080;</span>
            <span className="font-mono text-fg/70">
              {sat.cn0.toFixed(1)} dB-Hz
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: color + '15' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(5, (sat.cn0 / 55) * 100))}%`,
                background: `linear-gradient(90deg, ${color}90, ${color})`,
              }}
            />
          </div>
        </div>
      )}

      {/* Ephemeris data */}
      {eph && (
        <div className="border-t border-white/5 pt-2 space-y-1.5">
          <div className="text-[9px] font-semibold text-fg/30 uppercase tracking-widest">
            Ephemeris · MT {eph.messageType}
          </div>

          {isGlonass ? (
            /* GLONASS: position/velocity */
            <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[10px]">
              <EphRow label="Position X" value={`${eph.x?.toFixed(1)} km`} />
              <EphRow label="Position Y" value={`${eph.y?.toFixed(1)} km`} />
              <EphRow label="Position Z" value={`${eph.z?.toFixed(1)} km`} />
              <EphRow label="Velocity X" value={`${eph.vx?.toFixed(4)} km/s`} />
              <EphRow label="Velocity Y" value={`${eph.vy?.toFixed(4)} km/s`} />
              <EphRow label="Velocity Z" value={`${eph.vz?.toFixed(4)} km/s`} />
              {eph.freqChannel != null && (
                <EphRow
                  label="Freq channel"
                  value={`${eph.freqChannel > 0 ? '+' : ''}${eph.freqChannel}`}
                />
              )}
              {eph.af0 != null && (
                <EphRow
                  label="Clock bias"
                  value={`${(eph.af0 * 1e6).toFixed(3)} µs`}
                />
              )}
            </div>
          ) : (
            /* Keplerian (GPS/Galileo/BDS/QZSS) */
            <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[10px]">
              {eph.sqrtA != null && (
                <EphRow
                  label="Semi-major axis"
                  value={`${(eph.sqrtA ** 2 / 1000).toFixed(0)} km`}
                />
              )}
              {eph.eccentricity != null && (
                <EphRow
                  label="Eccentricity"
                  value={formatSciNum(eph.eccentricity)}
                />
              )}
              {eph.inclination != null && (
                <EphRow label="Inclination" value={rad2deg(eph.inclination)} />
              )}
              {eph.omega0 != null && (
                <EphRow label="RAAN (Ω₀)" value={rad2deg(eph.omega0)} />
              )}
              {eph.argPerigee != null && (
                <EphRow
                  label="Arg. perigee (ω)"
                  value={rad2deg(eph.argPerigee)}
                />
              )}
              {eph.meanAnomaly != null && (
                <EphRow
                  label="Mean anomaly (M₀)"
                  value={rad2deg(eph.meanAnomaly)}
                />
              )}
              {eph.toe != null && <EphRow label="toe" value={`${eph.toe} s`} />}
              {eph.week != null && (
                <EphRow label="Week" value={`${eph.week}`} />
              )}
              {eph.af0 != null && (
                <EphRow
                  label="Clock bias"
                  value={`${(eph.af0 * 1e6).toFixed(3)} µs`}
                />
              )}
              {eph.ura != null && (
                <EphRow label="URA index" value={`${eph.ura}`} />
              )}
            </div>
          )}
        </div>
      )}

      {!eph && sat.observed && (
        <div className="text-[10px] text-fg/20 italic pt-1">
          Observed in MSM — no ephemeris yet
        </div>
      )}
    </div>
  );
}

function EphRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-fg/35">{label}</span>
      <span className="text-fg/70 font-mono text-right">{value}</span>
    </>
  );
}

/* ─── Satellite tile ─────────────────────────────────────────── */

function SatelliteTile({ sat, color }: { sat: SatInfo; color: string }) {
  const [hovered, setHovered] = useState(false);
  const tileRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const handleEnter = () => {
    setHovered(true);
    if (tileRef.current) setRect(tileRef.current.getBoundingClientRect());
  };

  const hasEph = sat.hasEphemeris;
  const obs = sat.observed;

  return (
    <>
      <div
        ref={tileRef}
        className="relative cursor-default select-none"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className="w-11 h-[3.25rem] rounded-md flex flex-col items-center justify-center gap-0.5 transition-all duration-300"
          style={{
            background: hasEph
              ? `linear-gradient(135deg, ${color}18, ${color}08)`
              : obs
                ? `${color}08`
                : 'rgba(255,255,255,0.02)',
            border: `1px solid ${hasEph ? color + '50' : obs ? color + '20' : 'rgba(255,255,255,0.04)'}`,
            boxShadow: hasEph
              ? `0 0 16px ${color}30, 0 0 4px ${color}20, inset 0 1px 0 ${color}10`
              : 'none',
          }}
        >
          {/* Ephemeris indicator dot */}
          {hasEph && (
            <div
              className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full"
              style={{
                background: color,
                boxShadow: `0 0 6px ${color}`,
              }}
            />
          )}

          <span
            className="text-[10px] font-mono font-semibold leading-none transition-colors duration-300"
            style={{
              color: hasEph
                ? color
                : obs
                  ? color + 'bb'
                  : 'rgba(255,255,255,0.12)',
            }}
          >
            {sat.prn}
          </span>

          {/* C/N0 mini bar */}
          {sat.cn0 != null ? (
            <div
              className="w-7 h-[3px] rounded-full overflow-hidden"
              style={{ background: color + '15' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(8, (sat.cn0 / 55) * 100))}%`,
                  background: color,
                  opacity: hasEph ? 0.9 : 0.5,
                }}
              />
            </div>
          ) : (
            <div className="w-7 h-[3px]" />
          )}
        </div>
      </div>

      {hovered && <SatelliteTooltip sat={sat} color={color} tileRect={rect} />}
    </>
  );
}

/* ─── Constellation group ────────────────────────────────────── */

function ConstellationSection({ group }: { group: ConstellationGroup }) {
  const { name, color, sats, observed, withEph } = group;

  return (
    <div
      className="rounded-lg border border-border/30 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.01)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border/15">
        <div className="flex items-center gap-2">
          <div
            className="size-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}60` }}
          />
          <span className="text-xs font-bold tracking-wide" style={{ color }}>
            {name}
          </span>
        </div>
        <div className="flex items-center gap-3 ml-auto text-[10px] text-fg/30">
          <span>
            <span className="font-mono text-fg/50">{observed}</span> tracked
          </span>
          <span>
            <span className="font-mono text-fg/50">{withEph}</span> ephemeris
          </span>
        </div>
      </div>

      {/* Satellite tiles */}
      <div className="p-2.5 flex flex-wrap gap-1.5">
        {sats.map((sat) => (
          <SatelliteTile key={sat.prn} sat={sat} color={color} />
        ))}
      </div>
    </div>
  );
}

/* ─── Main panel ─────────────────────────────────────────────── */

export default function SatelliteStatusPanel({
  satellites,
  ephemerides,
}: Props) {
  const groups = useMemo(() => {
    // Collect all known PRNs from observations and ephemerides
    const satMap = new Map<string, SatInfo>();

    for (const [prn, sat] of satellites) {
      const constName = SYSTEM_PREFIX_TO_NAME[sat.system] ?? sat.system;
      satMap.set(prn, {
        prn,
        constellation: constName,
        observed: true,
        cn0: sat.cn0,
        hasEphemeris: false,
        ephemeris: null,
      });
    }

    for (const [prn, eph] of ephemerides) {
      const existing = satMap.get(prn);
      if (existing) {
        existing.hasEphemeris = true;
        existing.ephemeris = eph;
      } else {
        satMap.set(prn, {
          prn,
          constellation: eph.constellation,
          observed: false,
          cn0: null,
          hasEphemeris: true,
          ephemeris: eph,
        });
      }
    }

    // Group by constellation
    const grouped = new Map<string, SatInfo[]>();
    for (const sat of satMap.values()) {
      const list = grouped.get(sat.constellation) ?? [];
      list.push(sat);
      grouped.set(sat.constellation, list);
    }

    // Sort satellites within each group by PRN number
    for (const list of grouped.values()) {
      list.sort((a, b) =>
        a.prn.localeCompare(b.prn, undefined, { numeric: true }),
      );
    }

    // Build ordered constellation groups
    const result: ConstellationGroup[] = [];
    for (const name of CONSTELLATION_ORDER) {
      const sats = grouped.get(name);
      if (!sats || sats.length === 0) continue;
      result.push({
        name,
        color: CONSTELLATION_COLORS[name] ?? '#94a3b8',
        sats,
        observed: sats.filter((s) => s.observed).length,
        withEph: sats.filter((s) => s.hasEphemeris).length,
      });
    }

    // Add any remaining constellations not in the standard order
    for (const [name, sats] of grouped) {
      if (CONSTELLATION_ORDER.includes(name)) continue;
      result.push({
        name,
        color: CONSTELLATION_COLORS[name] ?? '#94a3b8',
        sats,
        observed: sats.filter((s) => s.observed).length,
        withEph: sats.filter((s) => s.hasEphemeris).length,
      });
    }

    return result;
  }, [satellites, ephemerides]);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-border/20 px-4 py-8 text-center">
        <div className="text-fg/20 text-sm">Waiting for satellite data…</div>
        <div className="text-fg/10 text-xs mt-1">
          MSM and ephemeris messages will appear here
        </div>
      </div>
    );
  }

  // Summary counts
  const totalTracked = groups.reduce((s, g) => s + g.observed, 0);
  const totalEph = groups.reduce((s, g) => s + g.withEph, 0);

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-fg/60">Satellites</span>
          <span className="text-[10px] text-fg/25">
            {totalTracked} tracked · {totalEph} with ephemeris
          </span>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 text-[9px] text-fg/25">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm border border-fg/10 bg-fg/[0.02]" />
            Not seen
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm border border-green-400/20 bg-green-400/[0.06]" />
            Observed
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block size-2 rounded-sm border border-green-400/50 bg-green-400/10"
              style={{ boxShadow: '0 0 4px rgba(74,222,128,0.3)' }}
            />
            Ephemeris
          </span>
        </div>
      </div>

      {/* Constellation groups */}
      {groups.map((group) => (
        <ConstellationSection key={group.name} group={group} />
      ))}
    </div>
  );
}
