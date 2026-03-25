import { useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Popup,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SatAzEl } from 'gnss-js/orbit';
import { systemName, systemCmp } from 'gnss-js/rinex';
import { SYSTEM_COLORS } from '../util/gnss-constants';
import type { TrackSegments } from './PolarSkyPlot';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const rxIcon = new L.Icon({
  iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
  iconUrl: markerIcon.src ?? markerIcon,
  shadowUrl: markerShadow.src ?? markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const RAD2DEG = 180 / Math.PI;

function splitAtAntimeridian(
  seg: { lat: number; lon: number }[],
): [number, number][][] {
  const result: [number, number][][] = [[]];
  for (let i = 0; i < seg.length; i++) {
    const lat = seg[i]!.lat * RAD2DEG;
    const lon = seg[i]!.lon * RAD2DEG;
    if (i > 0) {
      const prevLon = seg[i - 1]!.lon * RAD2DEG;
      if (Math.abs(lon - prevLon) > 180) {
        result.push([]);
      }
    }
    result.at(-1)!.push([lat, lon]);
  }
  return result;
}

export default function GroundTrackMap({
  tracks,
  currentPositions,
  rxLat,
  rxLon,
}: {
  tracks: TrackSegments;
  currentPositions: Record<string, SatAzEl>;
  rxLat?: number;
  rxLon?: number;
}) {
  const polylines = useMemo(() => {
    const lines: {
      positions: [number, number][][];
      color: string;
      prn: string;
    }[] = [];
    for (const [prn, segments] of Object.entries(tracks)) {
      const color = SYSTEM_COLORS[prn.charAt(0)] ?? '#7c8aff';
      const splitSegs: [number, number][][] = [];
      for (const seg of segments) {
        splitSegs.push(...splitAtAntimeridian(seg));
      }
      lines.push({ positions: splitSegs, color, prn });
    }
    return lines;
  }, [tracks]);

  const markers = useMemo(() => {
    return Object.entries(currentPositions).map(([prn, sat]) => ({
      prn,
      lat: sat.lat * RAD2DEG,
      lon: sat.lon * RAD2DEG,
      color: SYSTEM_COLORS[prn.charAt(0)] ?? '#7c8aff',
    }));
  }, [currentPositions]);

  return (
    <div
      className="relative rounded-xl border border-border/60 overflow-hidden"
      role="region"
      aria-label="Satellite ground track map"
      style={{ height: 380 }}
    >
      <MapContainer
        center={[
          rxLat != null ? rxLat * RAD2DEG : 20,
          rxLon != null ? rxLon * RAD2DEG : 0,
        ]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        worldCopyJump
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {polylines.map((line) =>
          line.positions.map((seg, j) => (
            <Polyline
              key={`${line.prn}-${j}`}
              positions={seg}
              pathOptions={{ color: line.color, weight: 1.5, opacity: 0.35 }}
            />
          )),
        )}
        {markers.map((m) => (
          <CircleMarker
            key={m.prn}
            center={[m.lat, m.lon]}
            radius={4}
            pathOptions={{
              color: m.color,
              fillColor: m.color,
              fillOpacity: 0.9,
              weight: 1,
            }}
          >
            <Popup>
              <span className="text-xs font-mono">
                {m.prn}: {m.lat.toFixed(2)}°, {m.lon.toFixed(2)}°
              </span>
            </Popup>
          </CircleMarker>
        ))}
        {rxLat != null && rxLon != null && (
          <Marker position={[rxLat * RAD2DEG, rxLon * RAD2DEG]} icon={rxIcon}>
            <Popup>Receiver</Popup>
          </Marker>
        )}
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[1000] flex flex-col gap-1 rounded-lg bg-bg-raised/90 backdrop-blur-sm border border-border/60 px-2.5 py-1.5 text-[10px] font-medium text-fg/70">
        {Object.entries(
          Object.keys(currentPositions).reduce<Record<string, number>>(
            (acc, prn) => {
              const sys = prn.charAt(0);
              acc[sys] = (acc[sys] ?? 0) + 1;
              return acc;
            },
            {},
          ),
        )
          .sort(([a], [b]) => systemCmp(a, b))
          .map(([sys, count]) => (
            <div key={sys} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: SYSTEM_COLORS[sys] ?? '#7c8aff' }}
              />
              {systemName(sys)} ({count})
            </div>
          ))}
      </div>
    </div>
  );
}
