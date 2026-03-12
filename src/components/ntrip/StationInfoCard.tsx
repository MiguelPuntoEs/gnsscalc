import { useMemo } from 'react';
import type { StationMeta } from '../../util/ntrip';
import { ecefToGeodetic } from '../../util/positioning';

export default function StationInfoCard({ meta, streamEntry }: { meta: StationMeta; streamEntry?: { latitude: number; longitude: number; network: string; country: string; identifier: string; navSystem: string } | null }) {
  const hasAny = meta.stationId !== null || meta.receiverType || meta.antennaType || meta.position || meta.description;
  if (!hasAny && !streamEntry) return null;

  const geo = useMemo(() => {
    if (meta.position) {
      const [lat, lon, alt] = ecefToGeodetic(...meta.position);
      return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI, alt };
    }
    if (streamEntry && (streamEntry.latitude !== 0 || streamEntry.longitude !== 0)) {
      return { lat: streamEntry.latitude, lon: streamEntry.longitude, alt: null as number | null };
    }
    return null;
  }, [meta.position, streamEntry]);

  const rows: [string, string][] = [];
  if (meta.stationId !== null) rows.push(['Station ID', String(meta.stationId)]);
  if (streamEntry?.identifier) rows.push(['Identifier', streamEntry.identifier]);
  if (streamEntry?.network) rows.push(['Network', streamEntry.network]);
  if (streamEntry?.country) rows.push(['Country', streamEntry.country]);
  if (streamEntry?.navSystem) rows.push(['Systems', streamEntry.navSystem]);
  if (meta.description) rows.push(['Description', meta.description]);
  if (geo) {
    const latStr = `${Math.abs(geo.lat).toFixed(6)}° ${geo.lat >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(geo.lon).toFixed(6)}° ${geo.lon >= 0 ? 'E' : 'W'}`;
    rows.push(['Position', `${latStr}, ${lonStr}${geo.alt !== null ? `, ${geo.alt.toFixed(1)} m` : ''}`]);
    if (meta.position) rows.push(['ECEF', `${meta.position[0].toFixed(4)}, ${meta.position[1].toFixed(4)}, ${meta.position[2].toFixed(4)} m`]);
  }
  if (meta.itrf !== null && meta.itrf > 0) rows.push(['ITRF', `${meta.itrf < 100 ? '20' : ''}${meta.itrf}`]);
  if (meta.antennaHeight !== null) rows.push(['Antenna Height', `${meta.antennaHeight.toFixed(4)} m`]);
  if (meta.antennaType) rows.push(['Antenna', meta.antennaType + (meta.antennaSerial ? ` (${meta.antennaSerial})` : '')]);
  if (meta.receiverType) rows.push(['Receiver', meta.receiverType + (meta.receiverFirmware ? ` / ${meta.receiverFirmware}` : '')]);
  if (meta.receiverSerial) rows.push(['Receiver S/N', meta.receiverSerial]);

  return (
    <div className="rounded-lg border border-border/40 bg-bg-raised/30 p-3">
      <span className="text-xs font-medium text-fg/60 mb-2 block">Station Information</span>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <span className="text-[11px] text-fg/40">{label}</span>
            <span className="text-[11px] text-fg/80 font-mono truncate">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
