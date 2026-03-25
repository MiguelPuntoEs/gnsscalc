import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { NmeaFix } from 'gnss-js/nmea';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const startIcon = new L.Icon({
  iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
  iconUrl: markerIcon.src ?? markerIcon,
  shadowUrl: markerShadow.src ?? markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const endIcon = new L.Icon({
  iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
  iconUrl: markerIcon.src ?? markerIcon,
  shadowUrl: markerShadow.src ?? markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'hue-rotate-180',
});

function FixPopup({ label, fix }: { label: string; fix: NmeaFix }) {
  return (
    <div className="text-xs leading-relaxed">
      <strong>{label}</strong>
      {fix.time && (
        <div>
          {fix.time.toISOString().replace('T', ' ').replace('Z', ' UTC')}
        </div>
      )}
      <div>
        {fix.lat.toFixed(6)}°, {fix.lon.toFixed(6)}°
      </div>
      {fix.alt !== null && <div>Alt: {fix.alt.toFixed(1)} m</div>}
      {fix.satellites !== null && <div>Sats: {fix.satellites}</div>}
    </div>
  );
}

// Color ramp: red (few sats) → yellow → green (many sats)
function satColor(sats: number | null): string {
  if (sats === null) return '#7c8aff'; // fallback accent
  // Clamp to [4, 12] range for coloring
  const t = Math.min(1, Math.max(0, (sats - 4) / 8));
  // red → yellow → green
  if (t < 0.5) {
    const r = 255;
    const g = Math.round(255 * (t * 2));
    return `rgb(${r},${g},60)`;
  }
  const r = Math.round(255 * (1 - (t - 0.5) * 2));
  const g = 220;
  return `rgb(${r},${g},60)`;
}

interface ColoredSegment {
  positions: [number, number][];
  color: string;
}

function FitBounds({ fixes }: { fixes: NmeaFix[] }) {
  const map = useMap();

  const bounds = useMemo(() => {
    const lats = fixes.map((f) => f.lat);
    const lons = fixes.map((f) => f.lon);
    return L.latLngBounds(
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    );
  }, [fixes]);

  useEffect(() => {
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
  }, [bounds, map]);

  return null;
}

export default function NmeaTrackMap({ fixes }: { fixes: NmeaFix[] }) {
  const hasSatData = fixes.some((f) => f.satellites !== null);

  // Build colored segments — each segment gets the color of its starting fix
  const segments = useMemo<ColoredSegment[]>(() => {
    if (!hasSatData || fixes.length < 2) {
      // No sat data: single segment with accent color
      return [
        {
          positions: fixes.map((f) => [f.lat, f.lon] as [number, number]),
          color: '#7c8aff',
        },
      ];
    }

    const segs: ColoredSegment[] = [];
    for (let i = 0; i < fixes.length - 1; i++) {
      const f = fixes[i]!;
      const next = fixes[i + 1]!;
      const color = satColor(f.satellites);
      // Merge consecutive segments of the same color
      const last = segs[segs.length - 1];
      if (last && last.color === color) {
        last.positions.push([next.lat, next.lon]);
      } else {
        segs.push({
          positions: [
            [f.lat, f.lon],
            [next.lat, next.lon],
          ],
          color,
        });
      }
    }
    return segs;
  }, [fixes, hasSatData]);

  const first = fixes[0]!;
  const last = fixes[fixes.length - 1]!;

  return (
    <div
      className="relative rounded-xl border border-border/60 overflow-hidden"
      role="region"
      aria-label="NMEA track map"
      style={{ height: 420 }}
    >
      <MapContainer
        center={[first.lat, first.lon]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {segments.map((seg, i) => (
          <Polyline
            key={i}
            positions={seg.positions}
            pathOptions={{ color: seg.color, weight: 3, opacity: 0.85 }}
          />
        ))}
        <Marker position={[first.lat, first.lon]} icon={startIcon}>
          <Popup>
            <FixPopup label="Start" fix={first} />
          </Popup>
        </Marker>
        <Marker position={[last.lat, last.lon]} icon={endIcon}>
          <Popup>
            <FixPopup label="End" fix={last} />
          </Popup>
        </Marker>
        <FitBounds fixes={fixes} />
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[1000] flex flex-col gap-1 rounded-lg bg-bg-raised/90 backdrop-blur-sm border border-border/60 px-2.5 py-1.5 text-[10px] font-medium text-fg/70">
        {hasSatData ? (
          <>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-4 h-0.5 rounded-full"
                style={{ backgroundColor: satColor(4) }}
              />
              ≤4 sats
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-4 h-0.5 rounded-full"
                style={{ backgroundColor: satColor(8) }}
              />
              8 sats
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-4 h-0.5 rounded-full"
                style={{ backgroundColor: satColor(12) }}
              />
              ≥12 sats
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 h-0.5 rounded-full"
              style={{ backgroundColor: '#7c8aff' }}
            />
            Track ({fixes.length} fixes)
          </div>
        )}
      </div>
    </div>
  );
}
