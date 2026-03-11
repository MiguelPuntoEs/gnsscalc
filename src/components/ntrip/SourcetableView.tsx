import { useState, useMemo } from 'react';
import type { NtripVersion, Sourcetable } from '../../util/ntrip';
import { CONSTELLATION_COLORS } from '../../util/gnss-constants';
import { SpinnerIcon, SignalIcon } from './Icons';

function formatBitrate(bps: number): string {
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(1)} kbps`;
  return `${Math.round(bps)} bps`;
}

const CARRIER_LABELS: Record<number, string> = { 0: 'No', 1: 'L1', 2: 'L1+L2' };
const AUTH_LABELS: Record<string, string> = { N: 'None', B: 'Basic', D: 'Digest' };

export interface SourcetableViewProps {
  sourcetable: Sourcetable;
  host: string;
  port: number;
  version: NtripVersion;
  username: string;
  password: string;
  onStreamConnect: (mountpoint: string) => void;
  streamConnecting: string | null;
}

export default function SourcetableView({ sourcetable, host, port, version, username, password, onStreamConnect, streamConnecting }: SourcetableViewProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'mountpoint' | 'format' | 'navSystem' | 'country' | 'bitrate'>('mountpoint');
  const [sortAsc, setSortAsc] = useState(true);

  const { streams, networks } = sourcetable;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = streams;
    if (q) {
      list = streams.filter(s =>
        s.mountpoint.toLowerCase().includes(q) ||
        s.identifier.toLowerCase().includes(q) ||
        s.format.toLowerCase().includes(q) ||
        s.navSystem.toLowerCase().includes(q) ||
        s.country.toLowerCase().includes(q) ||
        s.network.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'bitrate') {
        cmp = a.bitrate - b.bitrate;
      } else {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [streams, search, sortKey, sortAsc]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sortArrow = (key: typeof sortKey) => sortKey === key ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';

  // Summary stats
  const countries = new Set(streams.map(s => s.country));
  const formats = new Set(streams.map(s => s.format));
  const navSystems = new Set(streams.flatMap(s => s.navSystem.split('+')));
  navSystems.delete('');

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="card">
        <div className="card-fields">
          <label>Caster</label>
          <span className="text-sm text-fg/80 font-mono">{host}:{port}</span>
          <label>Protocol</label>
          <span className="text-sm text-fg/80">NTRIP {version}</span>
          <label>Streams</label>
          <span className="text-sm text-fg/80">{streams.length}</span>
          {networks.length > 0 && (<>
            <label>Networks</label>
            <span className="text-sm text-fg/80">{networks.map(n => n.identifier).join(', ')}</span>
          </>)}
          <label>Countries</label>
          <span className="text-sm text-fg/80">{countries.size}</span>
          <label>Formats</label>
          <span className="text-sm text-fg/80">{[...formats].sort().join(', ')}</span>
          <label>Systems</label>
          <span className="text-sm text-fg/80">{[...navSystems].sort().join(', ')}</span>
        </div>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter mountpoints…"
          className="w-full !text-left px-3 py-2 rounded-lg bg-input border border-border/40 text-sm text-fg placeholder:text-fg/30"
        />
      </div>

      {/* Stream table */}
      <div className="overflow-x-auto rounded-lg border border-border/40">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-bg-raised text-fg/50 text-left">
              <th className="px-3 py-2 cursor-pointer hover:text-fg/80 whitespace-nowrap" onClick={() => handleSort('mountpoint')}>
                Mountpoint{sortArrow('mountpoint')}
              </th>
              <th className="px-3 py-2 cursor-pointer hover:text-fg/80 whitespace-nowrap" onClick={() => handleSort('format')}>
                Format{sortArrow('format')}
              </th>
              <th className="px-3 py-2 cursor-pointer hover:text-fg/80 whitespace-nowrap" onClick={() => handleSort('navSystem')}>
                System{sortArrow('navSystem')}
              </th>
              <th className="px-3 py-2 cursor-pointer hover:text-fg/80 whitespace-nowrap" onClick={() => handleSort('country')}>
                Country{sortArrow('country')}
              </th>
              <th className="px-3 py-2 whitespace-nowrap">Carrier</th>
              <th className="px-3 py-2 cursor-pointer hover:text-fg/80 whitespace-nowrap text-right" onClick={() => handleSort('bitrate')}>
                Bitrate{sortArrow('bitrate')}
              </th>
              <th className="px-3 py-2 whitespace-nowrap">Auth</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.mountpoint} className="border-t border-border/20 hover:bg-bg-raised/50 transition-colors cursor-pointer" onClick={() => { if (!streamConnecting) onStreamConnect(s.mountpoint); }}>
                <td className="px-3 py-1.5 font-mono font-medium whitespace-nowrap">
                  <button
                    className="inline-flex items-center gap-1.5 hover:text-accent transition-colors disabled:opacity-40"
                    onClick={() => onStreamConnect(s.mountpoint)}
                    disabled={streamConnecting !== null}
                  >
                    {streamConnecting === s.mountpoint ? (
                      <SpinnerIcon className="size-3 animate-spin shrink-0" />
                    ) : (
                      <SignalIcon className="size-3 shrink-0 text-fg/30" />
                    )}
                    <span className="text-fg/90">{s.mountpoint}</span>
                  </button>
                  {s.identifier && <span className="font-normal text-fg/30 ml-1.5">{s.identifier}</span>}
                </td>
                <td className="px-3 py-1.5 text-fg/60 whitespace-nowrap">{s.format}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {s.navSystem.split('+').map(sys => (
                    <span key={sys} className="inline-block mr-1 text-[10px] font-semibold" style={{ color: CONSTELLATION_COLORS[sys.trim()] ?? '#94a3b8' }}>
                      {sys.trim()}
                    </span>
                  ))}
                </td>
                <td className="px-3 py-1.5 text-fg/60">{s.country}</td>
                <td className="px-3 py-1.5 text-fg/40">{CARRIER_LABELS[s.carrier] ?? s.carrier}</td>
                <td className="px-3 py-1.5 text-fg/50 text-right font-mono tabular-nums">{s.bitrate > 0 ? formatBitrate(s.bitrate) : '—'}</td>
                <td className="px-3 py-1.5 text-fg/40">{AUTH_LABELS[s.authentication] ?? s.authentication}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-fg/30">No streams matching "{search}"</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-fg/25 text-center">
        {filtered.length} of {streams.length} streams — click a mountpoint to connect
      </p>
    </div>
  );
}
