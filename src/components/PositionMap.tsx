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
import type { Position } from '../types/position';
import { ecefToGeodetic, rad2deg, deg2rad } from 'gnss-js/coordinates';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const defaultIcon = new L.Icon({
  iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
  iconUrl: markerIcon.src ?? markerIcon,
  shadowUrl: markerShadow.src ?? markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const redIcon = new L.Icon({
  iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
  iconUrl: markerIcon.src ?? markerIcon,
  shadowUrl: markerShadow.src ?? markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'hue-rotate-180',
});

function toLatLng(position: Position): [number, number] {
  const [lat, lon] = ecefToGeodetic(position[0], position[1], position[2]);
  return [rad2deg(lat), rad2deg(lon)];
}

/** Interpolate N points along the great-circle arc between two lat/lon pairs (degrees). */
function greatCirclePoints(
  lat1Deg: number,
  lon1Deg: number,
  lat2Deg: number,
  lon2Deg: number,
  segments = 64,
): [number, number][] {
  const lat1 = deg2rad(lat1Deg),
    lon1 = deg2rad(lon1Deg);
  const lat2 = deg2rad(lat2Deg),
    lon2 = deg2rad(lon2Deg);

  const cosD =
    Math.sin(lat1) * Math.sin(lat2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const d = Math.acos(Math.max(-1, Math.min(1, cosD)));

  // If points are coincident or antipodal, just return the two endpoints
  if (d < 1e-10) {
    return [
      [lat1Deg, lon1Deg],
      [lat2Deg, lon2Deg],
    ];
  }

  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x =
      A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y =
      A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([
      rad2deg(Math.atan2(z, Math.sqrt(x * x + y * y))),
      rad2deg(Math.atan2(y, x)),
    ]);
  }
  return points;
}

/** Interpolate N points along the rhumb line (constant bearing) between two lat/lon pairs (degrees). */
function rhumbLinePoints(
  lat1Deg: number,
  lon1Deg: number,
  lat2Deg: number,
  lon2Deg: number,
  segments = 64,
): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    points.push([
      lat1Deg + f * (lat2Deg - lat1Deg),
      lon1Deg + f * (lon2Deg - lon1Deg),
    ]);
  }
  return points;
}

function FitBounds({
  position,
  refPosition,
}: {
  position: Position;
  refPosition: Position;
}) {
  const map = useMap();
  const pos = toLatLng(position);
  const ref = toLatLng(refPosition);
  const [posLat, posLon] = pos;
  const [refLat, refLon] = ref;

  useEffect(() => {
    const bounds = L.latLngBounds(
      [posLat, posLon] as L.LatLngTuple,
      [refLat, refLon] as L.LatLngTuple,
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [posLat, posLon, refLat, refLon, map]);

  return null;
}

export default function PositionMap({
  position,
  refPosition,
}: {
  position: Position;
  refPosition: Position;
}) {
  const pos = toLatLng(position);
  const ref = toLatLng(refPosition);
  const [posLat, posLon] = pos;
  const [refLat, refLon] = ref;

  const arcPoints = useMemo(
    () => greatCirclePoints(refLat, refLon, posLat, posLon),
    [posLat, posLon, refLat, refLon],
  );

  const rhumbPoints = useMemo(
    () => rhumbLinePoints(refLat, refLon, posLat, posLon),
    [posLat, posLon, refLat, refLon],
  );

  return (
    <div
      className="relative rounded-xl border border-border/60 overflow-hidden"
      role="region"
      aria-label="Position map"
      style={{ height: 350 }}
    >
      <MapContainer
        center={pos}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline
          positions={arcPoints}
          pathOptions={{ color: '#7c8aff', weight: 2, opacity: 0.8 }}
        />
        <Polyline
          positions={rhumbPoints}
          pathOptions={{
            color: '#ff7c7c',
            weight: 2,
            opacity: 0.6,
            dashArray: '6 4',
          }}
        />
        <Marker position={pos} icon={defaultIcon}>
          <Popup>Position</Popup>
        </Marker>
        <Marker position={ref} icon={redIcon}>
          <Popup>Reference Position</Popup>
        </Marker>
        <FitBounds position={position} refPosition={refPosition} />
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[1000] flex flex-col gap-1 rounded-lg bg-bg-raised/90 backdrop-blur-sm border border-border/60 px-2.5 py-1.5 text-[10px] font-medium text-fg/70">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-0.5 rounded-full"
            style={{ backgroundColor: '#7c8aff' }}
          />
          Orthodromic
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-0.5 rounded-full border-t border-dashed"
            style={{ borderColor: '#ff7c7c' }}
          />
          Loxodromic
        </div>
      </div>
    </div>
  );
}
