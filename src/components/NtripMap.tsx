import { useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { NtripStream } from 'gnss-js/ntrip';

function FitBounds({ streams }: { streams: NtripStream[] }) {
  const map = useMap();
  useMemo(() => {
    if (streams.length === 0) return;
    const lats = streams.map((s) => s.latitude);
    const lngs = streams.map((s) => s.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    map.fitBounds(
      [
        [minLat, minLng],
        [maxLat, maxLng],
      ],
      { padding: [30, 30], maxZoom: 12 },
    );
  }, [streams, map]);
  return null;
}

const FORMAT_COLORS: Record<string, string> = {
  'RTCM 3': '#4ade80',
  'RTCM 3.0': '#4ade80',
  'RTCM 3.1': '#4ade80',
  'RTCM 3.2': '#4ade80',
  'RTCM 3.3': '#4ade80',
  RTCM3: '#4ade80',
  'RTCM 2': '#fbbf24',
  'RTCM 2.0': '#fbbf24',
  'RTCM 2.1': '#fbbf24',
  'RTCM 2.2': '#fbbf24',
  'RTCM 2.3': '#fbbf24',
  RAW: '#60a5fa',
  BINEX: '#a78bfa',
};

function getColor(format: string): string {
  const key = Object.keys(FORMAT_COLORS).find((k) =>
    format.toUpperCase().startsWith(k.toUpperCase()),
  );
  return key ? FORMAT_COLORS[key]! : '#94a3b8';
}

export default function NtripMap({ streams }: { streams: NtripStream[] }) {
  return (
    <div className="rounded-lg overflow-hidden border border-border/40">
      <MapContainer
        center={[48, 10]}
        zoom={4}
        scrollWheelZoom
        style={{ height: 400, width: '100%', background: '#1a1a2e' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds streams={streams} />
        {streams.map((s) => (
          <CircleMarker
            key={s.mountpoint}
            center={[s.latitude, s.longitude]}
            radius={5}
            pathOptions={{
              color: getColor(s.format),
              fillColor: getColor(s.format),
              fillOpacity: 0.7,
              weight: 1,
            }}
          >
            <Popup>
              <div className="text-xs leading-relaxed text-gray-900">
                <strong className="font-semibold">{s.mountpoint}</strong>
                {s.identifier && (
                  <div className="text-gray-500">{s.identifier}</div>
                )}
                <div>
                  {s.format} {s.formatDetails && `(${s.formatDetails})`}
                </div>
                <div>{s.navSystem}</div>
                <div>
                  {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                </div>
                {s.bitrate > 0 && <div>{s.bitrate} bps</div>}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {/* Legend */}
      <div className="bg-bg-raised/60 px-3 py-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-fg/50">
        {[
          ['RTCM 3.x', '#4ade80'],
          ['RTCM 2.x', '#fbbf24'],
          ['RAW', '#60a5fa'],
          ['Other', '#94a3b8'],
        ].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
