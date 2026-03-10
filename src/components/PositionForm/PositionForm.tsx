import { useCallback, useId, useRef, useState } from 'react';
import { IMaskInput } from 'react-imask';
import {
  DECIMAL_PLACES_FOR_CARTESIAN,
  DECIMAL_PLACES_FOR_HEIGHT,
  DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE,
} from '../../constants/position';
import { usePositionCalculator, useCoordinateFormats } from '../../hooks/positioning';
import type { Position } from '../../types/position';
import {
  formatLatitudeDegMinSecs,
  formatLongitudeDegMinSecs,
  createNumberHandler,
} from '../../util/formats';
import {
  getPositionFromCartesian,
  getPositionFromGeodetic,
  getPositionFromGeodeticString,
} from '../../util/positioning';
import Field from '../Field';
import CopyableInput from '../CopyableInput';
import CopyIcon, { useCopyFeedback } from '../CopyIcon';
import AddressSearch from './AddressSearch';

function MaskedField({
  label,
  value,
  onCommit,
  mask,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => unknown;
  mask: string;
}) {
  const id = useId();
  const [error, setError] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const displayRef = useRef(value);

  const commit = () => {
    const result = onCommit(displayRef.current);
    setError(result === undefined);
  };

  const getValue = useCallback(() => displayRef.current, []);
  const { copied, copy } = useCopyFeedback(getValue);

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <span className="relative min-w-0 group">
        <IMaskInput
          id={id}
          mask={mask}
          definitions={{ '0': /\d/ }}
          lazy={false}
          overwrite
          value={value}
          onAccept={(val: string) => {
            displayRef.current = val;
            if (error) setError(false);
          }}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter') commit();
          }}
          onBlur={commit}
          aria-invalid={error || undefined}
          className={`w-full ${error ? 'border-2 border-red-500 text-red-500' : ''}`}
        />
        <CopyIcon copied={copied} onCopy={copy} />
      </span>
    </>
  );
}

function CollapsibleSection({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card-fields">
      <button
        type="button"
        className="section-label !flex items-center gap-1 bg-transparent border-0 p-0 m-0 cursor-pointer hover:text-fg/50 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`size-2.5 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        {label}
      </button>
      {open && children}
    </div>
  );
}

export default function PositionForm({
  title = '',
  position = [4263871.9243, 722591.1075, 4672988.8878],
  onPositionChange,
}: {
  title?: string;
  position: Position;
  onPositionChange: (position: Position) => void;
}) {
  const { latitude, longitude, height } = usePositionCalculator(position);
  const { utm, maidenhead, geohash } = useCoordinateFormats(position);

  const x = position[0].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);
  const y = position[1].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);
  const z = position[2].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);

  const latitudeString = formatLatitudeDegMinSecs(latitude);
  const longitudeString = formatLongitudeDegMinSecs(longitude);
  const heightString = height.toFixed(DECIMAL_PLACES_FOR_HEIGHT);

  const computationHandle = (func: () => Position | undefined) => {
    const resultPosition = func();
    if (resultPosition) {
      onPositionChange(resultPosition);
    }
    return resultPosition;
  };

  return (
    <form className="card flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90 m-0">{title}</h3>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-fg/50 hover:text-fg transition-colors bg-transparent border-0 p-0 m-0 cursor-pointer"
          onClick={() => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                ({ coords: { latitude, longitude, altitude } }) =>
                  onPositionChange(
                    getPositionFromGeodetic(latitude, longitude, altitude ?? 0)
                  ),
                (error) => {
                  const messages: Record<number, string> = {
                    [GeolocationPositionError.PERMISSION_DENIED]:
                      'Location permission denied. Please allow location access in your browser settings.',
                    [GeolocationPositionError.POSITION_UNAVAILABLE]:
                      'Location unavailable. Please try again.',
                    [GeolocationPositionError.TIMEOUT]:
                      'Location request timed out. Please try again.',
                  };
                  alert(messages[error.code] ?? 'Could not get your location.');
                },
                { enableHighAccuracy: true, timeout: 10000 }
              );
            }
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          My location
        </button>
      </div>

      {/* Address search */}
      <AddressSearch
        onSelect={(lat, lon) =>
          onPositionChange(getPositionFromGeodetic(lat, lon, height))
        }
      />

      {/* ECEF */}
      <div className="card-fields">
        <span className="section-label">ECEF</span>
        <Field
          label="X"
          numeric
          value={x}
          onCommit={(value) =>
            computationHandle(() => getPositionFromCartesian(value, y, z))
          }
        />
        <Field
          label="Y"
          numeric
          value={y}
          onCommit={(value) =>
            computationHandle(() => getPositionFromCartesian(x, value, z))
          }
        />
        <Field
          label="Z"
          numeric
          value={z}
          onCommit={(value) =>
            computationHandle(() => getPositionFromCartesian(x, y, value))
          }
        />
      </div>

      {/* Geodetic decimal */}
      <div className="card-fields">
        <span className="section-label">Geodetic</span>
        <Field
          label="Lat"
          numeric
          value={(latitude.value ?? 0).toFixed(
            DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE
          )}
          onCommit={createNumberHandler((value) =>
            computationHandle(() =>
              getPositionFromGeodetic(value, longitude.value ?? 0, height)
            )
          )}
        />
        <Field
          label="Lon"
          numeric
          value={(longitude.value ?? 0).toFixed(
            DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE
          )}
          onCommit={createNumberHandler((value) =>
            computationHandle(() =>
              getPositionFromGeodetic(latitude.value ?? 0, value, height)
            )
          )}
        />
        <Field
          label="Height"
          numeric
          value={height.toFixed(DECIMAL_PLACES_FOR_HEIGHT)}
          onCommit={createNumberHandler((value) =>
            computationHandle(() =>
              getPositionFromGeodetic(
                latitude.value ?? 0,
                longitude.value ?? 0,
                value
              )
            )
          )}
        />
      </div>

      {/* DMS */}
      <div className="card-fields">
        <span className="section-label">DMS</span>
        <MaskedField
          label="Lat"
          value={latitudeString}
          mask={`00º 00' 00.000" N`}
          onCommit={(value) =>
            computationHandle(() =>
              getPositionFromGeodeticString(value, longitudeString, heightString)
            )
          }
        />
        <MaskedField
          label="Lon"
          value={longitudeString}
          mask={`000º 00' 00.000" E`}
          onCommit={(value) =>
            computationHandle(() =>
              getPositionFromGeodeticString(latitudeString, value, heightString)
            )
          }
        />
      </div>

      {/* UTM (collapsible) */}
      <CollapsibleSection label="UTM">
        <label>Zone</label>
        <CopyableInput value={`${utm.zone}${utm.hemisphere}`} />
        <label>Easting</label>
        <CopyableInput value={`${utm.easting.toFixed(2)} m`} />
        <label>Northing</label>
        <CopyableInput value={`${utm.northing.toFixed(2)} m`} />
      </CollapsibleSection>

      {/* Other formats (collapsible) */}
      <CollapsibleSection label="Other">
        <label title="Maidenhead grid locator">Maidenhead</label>
        <CopyableInput value={maidenhead} />
        <label title="Geohash spatial encoding">Geohash</label>
        <CopyableInput value={geohash} />
      </CollapsibleSection>
    </form>
  );
}
