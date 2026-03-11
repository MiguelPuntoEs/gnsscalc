import { useState, useMemo } from 'react';
import type { NtripStream, StreamStats, SatCn0 } from '../../util/ntrip';
import { SYS_SHORT, systemColor, SYSTEM_COLORS, CONSTELLATION_COLORS, SYSTEM_META } from '../../util/gnss-constants';
import { geodeticToEcef, computeLiveSkyPositions } from '../../util/orbit';
import SatelliteStatusPanel from '../SatelliteStatusPanel';
import { RecordIcon, StopIcon, DownloadIcon } from './Icons';
import StationInfoCard from './StationInfoCard';
import LiveSkyPlot from './LiveSkyPlot';

/* ─── Helpers ──────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Human-readable names for RINEX signal codes */
const SIGNAL_LABELS: Record<string, string> = {
  '1C': 'L1 C/A', '1S': 'L1C-D', '1L': 'L1C-P', '1X': 'L1C',
  '2C': 'L2 C/A', '2S': 'L2C-M', '2L': 'L2C-L', '2X': 'L2C',
  '2P': 'L2 P(Y)', '2W': 'L2 Z',
  '5I': 'L5 I', '5Q': 'L5 Q', '5X': 'L5',
  '1B': 'E1 B', '1A': 'E1 A',
  '7I': 'E5b I', '7Q': 'E5b Q', '7X': 'E5b',
  '8I': 'E5ab I', '8Q': 'E5ab Q', '8X': 'E5ab',
  '6B': 'E6 B', '6C': 'E6 C',
  '2I': 'B1 I', '2Q': 'B1 Q',
  '6I': 'B3 I', '6Q': 'B3 Q',
  '1D': 'B1C-D', '1P': 'B1C-P',
  '5D': 'B2a D', '5P': 'B2a P',
  '4A': 'G1a L1OF', '4B': 'G1a L1OC',
  '3I': 'G3 I', '3Q': 'G3 Q',
};

const OBS_TYPE_LABELS: Record<string, string> = {
  C: 'Pseudorange', L: 'Carrier phase', S: 'Signal strength', D: 'Doppler',
};

/* ─── Cn0Chart ─────────────────────────────────────────────────── */

function Cn0Chart({ satellites }: { satellites: Map<string, SatCn0> }) {
  const [selectedSignal, setSelectedSignal] = useState<string>('best');

  // Collect all available signal codes across all satellites
  const availableSignals = useMemo(() => {
    const codes = new Set<string>();
    for (const sat of satellites.values()) {
      for (const sig of sat.signals) codes.add(sig.code);
    }
    return [...codes].sort();
  }, [satellites]);

  // Group satellites with resolved C/N0 for selected signal
  const grouped = useMemo(() => {
    const groups: Record<string, { prn: string; system: string; cn0: number }[]> = {};
    for (const sat of satellites.values()) {
      let cn0: number | undefined;
      if (selectedSignal === 'best') {
        cn0 = sat.cn0;
      } else {
        const sig = sat.signals.find(s => s.code === selectedSignal);
        cn0 = sig?.cn0;
      }
      if (cn0 === undefined || cn0 <= 0) continue;
      (groups[sat.system] ??= []).push({ prn: sat.prn, system: sat.system, cn0 });
    }
    for (const sats of Object.values(groups)) {
      sats.sort((a, b) => a.prn.localeCompare(b.prn));
    }
    const order = 'GRECIJS';
    return Object.entries(groups).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  }, [satellites, selectedSignal]);

  if (grouped.length === 0 && availableSignals.length === 0) return null;

  const maxCn0 = 56;
  const barW = 18;
  const barGap = 2;
  const groupGap = 12;
  const maxH = 120;
  const labelH = 32;

  let totalW = 0;
  for (const [, sats] of grouped) {
    totalW += sats.length * (barW + barGap) - barGap + groupGap;
  }
  totalW -= groupGap;

  return (
    <div className="overflow-x-auto rounded-lg border border-border/40 bg-bg-raised/30 p-3">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-xs font-medium text-fg/60">Satellite C/N0</span>
        {availableSignals.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setSelectedSignal('best')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                selectedSignal === 'best'
                  ? 'bg-accent/20 text-accent'
                  : 'text-fg/40 hover:text-fg/60 hover:bg-fg/5'
              }`}
            >
              Best
            </button>
            {availableSignals.map(code => (
              <button
                key={code}
                onClick={() => setSelectedSignal(code)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  selectedSignal === code
                    ? 'bg-accent/20 text-accent'
                    : 'text-fg/40 hover:text-fg/60 hover:bg-fg/5'
                }`}
                title={SIGNAL_LABELS[code] ?? code}
              >
                {code}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-3 ml-auto">
          {grouped.map(([sys]) => {
            const meta = SYSTEM_META[sys];
            return (
              <span key={sys} className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: meta?.color ?? '#94a3b8' }} />
                <span className="text-[10px] text-fg/40">{meta?.name ?? sys}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg width={Math.max(totalW, 100)} height={maxH + labelH} className="block">
          {[20, 30, 40, 50].map(threshold => {
            const y = maxH - (threshold / maxCn0) * maxH;
            return (
              <g key={threshold}>
                <line x1={0} y1={y} x2={totalW} y2={y} stroke="currentColor" strokeOpacity={0.08} strokeDasharray="2,3" />
                <text x={-2} y={y + 3} textAnchor="end" className="fill-fg/20 text-[8px]">{threshold}</text>
              </g>
            );
          })}
          {(() => {
            let x = 0;
            return grouped.map(([sys, sats]) => {
              const color = SYSTEM_META[sys]?.color ?? '#94a3b8';
              const groupEls = sats.map((sat) => {
                const h = Math.min(sat.cn0 / maxCn0, 1) * maxH;
                const barX = x;
                x += barW + barGap;
                const weak = sat.cn0 < 20;
                return (
                  <g key={sat.prn}>
                    <rect
                      x={barX}
                      y={maxH - h}
                      width={barW}
                      height={h}
                      rx={2}
                      fill={color}
                      opacity={weak ? 0.35 : 0.8}
                    />
                    <text
                      x={barX + barW / 2}
                      y={maxH + 11}
                      textAnchor="middle"
                      className="fill-fg/50 text-[8px] font-mono"
                    >
                      {sat.prn}
                    </text>
                    <text
                      x={barX + barW / 2}
                      y={maxH + 22}
                      textAnchor="middle"
                      className="fill-fg/30 text-[7px] font-mono tabular-nums"
                    >
                      {Math.round(sat.cn0)}
                    </text>
                  </g>
                );
              });
              x += groupGap - barGap;
              return <g key={sys}>{groupEls}</g>;
            });
          })()}
        </svg>
      </div>
    </div>
  );
}

/* ─── LiveObsTypeMatrix ────────────────────────────────────────── */

function LiveObsTypeMatrix({ obsTypes }: { obsTypes: Record<string, Set<string>> }) {
  const sysList = useMemo(() => {
    const order = 'GRECIJS';
    return Object.keys(obsTypes).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [obsTypes]);

  // Collect all codes, group by measurement type
  const { sortedTypes, grouped } = useMemo(() => {
    const allCodes = new Set<string>();
    for (const set of Object.values(obsTypes)) {
      for (const c of set) allCodes.add(c);
    }
    const g: Record<string, string[]> = {};
    for (const code of allCodes) {
      const t = code.charAt(0);
      (g[t] ??= []).push(code);
    }
    const typeOrder = ['C', 'L', 'D', 'S'];
    const st = Object.keys(g).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));
    for (const t of st) g[t]!.sort();
    return { sortedTypes: st, grouped: g };
  }, [obsTypes]);

  if (sysList.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/40 bg-bg-raised/30 p-3">
      <span className="text-xs font-medium text-fg/60 mb-2 block">Observation Types</span>
      <div className="overflow-x-auto">
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
                  const sysSet = obsTypes[sys]!;
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

/* ─── StreamMonitor ────────────────────────────────────────────── */

export interface StreamMonitorProps {
  mountpoint: string;
  stats: StreamStats;
  onDisconnect: () => void;
  recording: boolean;
  onToggleRecord: () => void;
  onDownloadRinex: () => void;
  rinexEpochs: number;
  /** Sourcetable stream entry for this mountpoint. */
  streamEntry?: NtripStream | null;
}

export default function StreamMonitor({ mountpoint, stats, onDisconnect, recording, onToggleRecord, onDownloadRinex, rinexEpochs, streamEntry }: StreamMonitorProps) {
  const elapsed = Date.now() - stats.startTime;
  const sortedTypes = useMemo(() =>
    [...stats.messageTypes.values()].sort((a, b) => b.count - a.count),
    [stats.messageTypes, stats.totalFrames] // re-sort when new frames arrive
  );

  // Resolve station position: prefer RTCM3 1005/1006, fall back to sourcetable lat/lon
  const rxPos = useMemo<[number, number, number] | null>(() => {
    if (stats.stationMeta.position) return stats.stationMeta.position;
    if (streamEntry && (streamEntry.latitude !== 0 || streamEntry.longitude !== 0)) {
      return geodeticToEcef(
        streamEntry.latitude * Math.PI / 180,
        streamEntry.longitude * Math.PI / 180,
        0, // approximate altitude
      );
    }
    return null;
  }, [stats.stationMeta.position, streamEntry]);

  // Compute live sky positions from ephemeris + station position
  const skyPositions = useMemo(() => {
    if (!rxPos || stats.ephemerides.size === 0) return null;
    const cn0Map = new Map<string, number>();
    for (const [prn, sat] of stats.satellites) cn0Map.set(prn, sat.cn0);
    return computeLiveSkyPositions(stats.ephemerides, rxPos, cn0Map);
  }, [stats.ephemerides, rxPos, stats.satellites]);

  return (
    <div className="space-y-4">
      {/* Connection header + stream stats */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-green-500" />
            </span>
            <span className="text-sm font-medium text-fg/90 font-mono">/{mountpoint}</span>
          </div>
          <button className="btn-secondary !px-2 !py-0.5 !text-[11px] !text-fg/50" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
        <div className="card-fields">
          <label>Duration</label>
          <span className="text-sm text-fg/80">{formatDuration(elapsed)}</span>
          <label>Data received</label>
          <span className="text-sm text-fg/80">{formatBytes(stats.totalBytes)}</span>
          <label>Throughput</label>
          <span className="text-sm text-fg/80">{formatBytes(Math.round(stats.bytesPerSecond))}/s</span>
          <label>RTCM3 frames</label>
          <span className="text-sm text-fg/80">{stats.totalFrames.toLocaleString()}</span>
          <label>Frame rate</label>
          <span className="text-sm text-fg/80">{stats.framesPerSecond.toFixed(1)} msg/s</span>
          <label>Message types</label>
          <span className="text-sm text-fg/80">{stats.messageTypes.size}</span>
        </div>
      </div>

      {/* RINEX recording toolbar */}
      <div className="rounded-lg border border-border/40 bg-bg-raised/30 px-3 py-2.5 flex items-center gap-3">
        {!recording && rinexEpochs === 0 && (
          <>
            <button
              className="btn-secondary !px-2.5 !py-1 flex items-center gap-1.5"
              onClick={onToggleRecord}
            >
              <RecordIcon className="size-3 text-red-500" />
              <span className="text-xs">Record RINEX</span>
            </button>
            <span className="text-[10px] text-fg/25">Capture observations to a .obs file</span>
          </>
        )}
        {recording && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="relative flex size-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full size-2.5 bg-red-500" />
              </span>
              <span className="text-xs text-red-400 font-medium tabular-nums">
                Recording &middot; {rinexEpochs.toLocaleString()} epochs
              </span>
            </span>
            <button
              className="btn-secondary !px-2.5 !py-1 flex items-center gap-1 ml-auto"
              onClick={onToggleRecord}
            >
              <StopIcon className="size-3" />
              <span className="text-xs">Stop</span>
            </button>
          </>
        )}
        {!recording && rinexEpochs > 0 && (
          <>
            <span className="text-xs text-fg/50 tabular-nums">{rinexEpochs.toLocaleString()} epochs captured</span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                className="btn-secondary !px-2.5 !py-1 flex items-center gap-1.5 !border-accent/40 !text-accent hover:!bg-accent/10"
                onClick={onDownloadRinex}
              >
                <DownloadIcon className="size-3.5" />
                <span className="text-xs font-medium">Download .obs</span>
              </button>
              <button
                className="btn-secondary !px-2 !py-1 flex items-center gap-1"
                onClick={onToggleRecord}
              >
                <RecordIcon className="size-2.5 text-red-500/70" />
                <span className="text-xs">New</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Station info */}
      <StationInfoCard meta={stats.stationMeta} streamEntry={streamEntry} />

      {/* Satellite C/N0 chart */}
      {stats.satellites.size > 0 && <Cn0Chart satellites={stats.satellites} />}

      {/* Live sky plot */}
      {skyPositions && skyPositions.length > 0 && rxPos && (
        <LiveSkyPlot satellites={skyPositions} stationPosition={rxPos} />
      )}

      {/* Observation type matrix */}
      {Object.keys(stats.obsTypes).length > 0 && <LiveObsTypeMatrix obsTypes={stats.obsTypes} />}

      {/* Satellite constellation status with ephemeris */}
      {(stats.satellites.size > 0 || stats.ephemerides.size > 0) && (
        <SatelliteStatusPanel satellites={stats.satellites} ephemerides={stats.ephemerides} />
      )}

      {/* Message type breakdown */}
      {sortedTypes.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-raised text-fg/50 text-left">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">System</th>
                <th className="px-3 py-2 text-right">Count</th>
                <th className="px-3 py-2 text-right">Bytes</th>
                <th className="px-3 py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {sortedTypes.map(mt => {
                const rate = elapsed > 0 ? (mt.count / (elapsed / 1000)).toFixed(1) : '0';
                return (
                  <tr key={mt.messageType} className="border-t border-border/20">
                    <td className="px-3 py-1.5 font-mono font-medium text-fg/90">{mt.messageType}</td>
                    <td className="px-3 py-1.5 text-fg/60">{mt.name}</td>
                    <td className="px-3 py-1.5">
                      {mt.constellation && (
                        <span className="text-[10px] font-semibold" style={{ color: CONSTELLATION_COLORS[mt.constellation] ?? '#94a3b8' }}>
                          {mt.constellation}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-fg/70 text-right font-mono tabular-nums">{mt.count.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-fg/50 text-right font-mono tabular-nums">{formatBytes(mt.totalBytes)}</td>
                    <td className="px-3 py-1.5 text-fg/50 text-right font-mono tabular-nums">{rate}/s</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
