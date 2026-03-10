import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Position } from '../types/position';
import { car2geo } from '../util/positioning';
import { rad2deg } from '../util/units';

// Fix default marker icons (Leaflet assets aren't bundled by default)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
  iconUrl: markerIcon.src ?? markerIcon,
  shadowUrl: markerShadow.src ?? markerShadow,
});

function toLatLng(position: Position): [number, number] {
  const [lat, lon] = car2geo(position[0], position[1], position[2]);
  return [rad2deg(lat), rad2deg(lon)];
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

  useEffect(() => {
    const bounds = L.latLngBounds([pos, ref]);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [pos[0], pos[1], ref[0], ref[1], map]);

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

  return (
    <div className="w-full rounded-lg border border-border overflow-hidden" style={{ height: 350 }}>
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
        <Marker position={pos}>
          <Popup>Position</Popup>
        </Marker>
        <Marker position={ref}>
          <Popup>Reference Position</Popup>
        </Marker>
        <FitBounds position={position} refPosition={refPosition} />
      </MapContainer>
    </div>
  );
}
