import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { EditableHeaderFields } from '../util/rinex-header-edit';
import type { RinexHeader } from 'gnss-js/rinex';
import InlineField from './InlineField';
import { PencilIcon, UndoIcon, ChevronIcon } from './HeaderEditorIcons';

let _antennas: string[] | null = null;
let _receivers: string[] | null = null;

async function getAntennas(): Promise<string[]> {
  if (_antennas) return _antennas;
  const mod = await import('../data/igs-equipment');
  _antennas = mod.IGS_ANTENNAS;
  return _antennas;
}

async function getReceivers(): Promise<string[]> {
  if (_receivers) return _receivers;
  const mod = await import('../data/igs-equipment');
  _receivers = mod.IGS_RECEIVERS;
  return _receivers;
}

function numStr(v: number): string {
  return v.toFixed(4);
}

/** Build EditableHeaderFields from a RinexHeader (no raw file needed). */
function fieldsFromHeader(header: RinexHeader): EditableHeaderFields {
  return {
    markerName: header.markerName,
    markerType: header.markerType,
    receiverNumber: header.receiverNumber,
    receiverType: header.receiverType,
    receiverVersion: header.receiverVersion,
    antNumber: header.antNumber,
    antType: header.antType,
    positionX: header.approxPosition?.[0] ?? 0,
    positionY: header.approxPosition?.[1] ?? 0,
    positionZ: header.approxPosition?.[2] ?? 0,
    antDeltaH: header.antDelta?.[0] ?? 0,
    antDeltaE: header.antDelta?.[1] ?? 0,
    antDeltaN: header.antDelta?.[2] ?? 0,
    observer: header.observer,
    agency: header.agency,
  };
}

export interface RinexHeaderEditorProps {
  header: RinexHeader;
  onFieldsChange?: (fields: EditableHeaderFields | null) => void;
}

export default function RinexHeaderEditor({
  header,
  onFieldsChange,
}: RinexHeaderEditorProps) {
  const [fields, setFields] = useState<EditableHeaderFields | null>(null);
  const [editing, setEditing] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const originalFields = useMemo(() => fieldsFromHeader(header), [header]);

  const handleEditToggle = useCallback(() => {
    if (!editing) {
      if (!fields) setFields(fieldsFromHeader(header));
      setEditing(true);
      if (detailsRef.current) detailsRef.current.open = true;
    } else {
      setEditing(false);
    }
  }, [editing, header, fields]);

  const updateField = useCallback(
    <K extends keyof EditableHeaderFields>(
      key: K,
      value: EditableHeaderFields[K],
    ) => {
      setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  // Notify parent when fields change (edits persist after closing edit mode)
  useEffect(() => {
    if (!fields) {
      onFieldsChange?.(null);
      return;
    }
    const hasChanges =
      JSON.stringify(fields) !== JSON.stringify(originalFields);
    onFieldsChange?.(hasChanges ? fields : null);
  }, [fields, originalFields, onFieldsChange]);

  const hasChanges = useMemo(() => {
    if (!fields) return false;
    return JSON.stringify(fields) !== JSON.stringify(originalFields);
  }, [fields, originalFields]);

  const handleRevert = useCallback(() => {
    setFields({ ...originalFields });
  }, [originalFields]);

  const changedCount = useMemo(() => {
    if (!fields) return 0;
    let count = 0;
    for (const key of Object.keys(
      originalFields,
    ) as (keyof EditableHeaderFields)[]) {
      if (String(fields[key]) !== String(originalFields[key])) count++;
    }
    return count;
  }, [fields, originalFields]);

  const f = fields ?? null;
  const orig = originalFields;

  const hasReceiver = !!(header.receiverType || header.receiverNumber);
  const hasAntenna = !!(header.antType || header.antNumber);
  const hasPosition = !!(
    header.approxPosition &&
    (header.approxPosition[0] !== 0 ||
      header.approxPosition[1] !== 0 ||
      header.approxPosition[2] !== 0)
  );
  const hasObserver = !!(header.observer || header.agency);

  const summaryParts: string[] = [];
  if (hasReceiver) summaryParts.push(header.receiverType || 'Receiver');
  if (hasAntenna) summaryParts.push(header.antType || 'Antenna');
  if (hasPosition) summaryParts.push('Position');
  if (hasObserver)
    summaryParts.push(header.agency || header.observer || 'Observer');

  return (
    <details ref={detailsRef} className="group overflow-hidden">
      <summary className="flex items-center gap-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <ChevronIcon className="size-4 text-fg/30 shrink-0 transition-transform group-open:rotate-90" />
        <span className="text-sm font-semibold text-fg shrink-0">
          Station & Header
        </span>
        {!editing && !hasChanges && summaryParts.length > 0 && (
          <span className="text-[10px] text-fg/30 truncate min-w-0">
            {summaryParts.join(' · ')}
          </span>
        )}
        {hasChanges && (
          <span className="text-[10px] text-accent shrink-0">
            {changedCount} field{changedCount !== 1 ? 's' : ''} edited — applied
            on export
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {editing && hasChanges && (
            <button
              type="button"
              className="btn-secondary flex items-center gap-1 !py-0.5 !px-2 !text-[11px]"
              onClick={(e) => {
                e.preventDefault();
                handleRevert();
              }}
              title="Revert all changes"
            >
              <UndoIcon className="size-2.5" />
              Revert
            </button>
          )}
          <button
            type="button"
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              editing
                ? 'text-accent hover:text-accent/80'
                : 'text-fg/40 hover:text-fg/70'
            }`}
            onClick={(e) => {
              e.preventDefault();
              handleEditToggle();
            }}
            title={editing ? 'Stop editing' : 'Edit header fields'}
          >
            <PencilIcon className="size-3" />
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </summary>

      <div className="pt-2">
        <div className="card-fields">
          <InlineField
            label="Marker"
            value={f ? f.markerName : header.markerName || '—'}
            originalValue={editing ? orig.markerName : undefined}
            editing={editing}
            onChange={(v) => updateField('markerName', v)}
            maxLength={60}
          />

          {(editing || header.markerType) && (
            <InlineField
              label="Marker type"
              value={f ? f.markerType : header.markerType}
              originalValue={editing ? orig.markerType : undefined}
              editing={editing}
              onChange={(v) => updateField('markerType', v)}
              maxLength={60}
            />
          )}

          {(editing || hasReceiver) && (
            <>
              <div className="section-divider" />
              <div className="section-label">Receiver</div>
              {(editing || header.receiverNumber) && (
                <InlineField
                  label="Serial"
                  value={f ? f.receiverNumber : header.receiverNumber}
                  originalValue={editing ? orig.receiverNumber : undefined}
                  editing={editing}
                  onChange={(v) => updateField('receiverNumber', v)}
                  maxLength={20}
                />
              )}
              <InlineField
                label="Type"
                value={f ? f.receiverType : header.receiverType}
                originalValue={editing ? orig.receiverType : undefined}
                editing={editing}
                onChange={(v) => updateField('receiverType', v)}
                autocomplete={
                  editing
                    ? {
                        getSuggestions: getReceivers,
                        placeholder: 'e.g. LEICA GR25',
                      }
                    : undefined
                }
              />
              {(editing || header.receiverVersion) && (
                <InlineField
                  label="Firmware"
                  value={f ? f.receiverVersion : header.receiverVersion}
                  originalValue={editing ? orig.receiverVersion : undefined}
                  editing={editing}
                  onChange={(v) => updateField('receiverVersion', v)}
                  maxLength={20}
                />
              )}
            </>
          )}

          {(editing || hasAntenna) && (
            <>
              <div className="section-divider" />
              <div className="section-label">Antenna</div>
              {(editing || header.antNumber) && (
                <InlineField
                  label="Serial"
                  value={f ? f.antNumber : header.antNumber}
                  originalValue={editing ? orig.antNumber : undefined}
                  editing={editing}
                  onChange={(v) => updateField('antNumber', v)}
                  maxLength={20}
                />
              )}
              <InlineField
                label="Type"
                value={f ? f.antType : header.antType}
                originalValue={editing ? orig.antType : undefined}
                editing={editing}
                onChange={(v) => updateField('antType', v)}
                autocomplete={
                  editing
                    ? {
                        getSuggestions: getAntennas,
                        placeholder: 'e.g. LEIAR25.R4      LEIT',
                      }
                    : undefined
                }
              />
            </>
          )}

          {(editing ||
            (header.antDelta &&
              (header.antDelta[0] !== 0 ||
                header.antDelta[1] !== 0 ||
                header.antDelta[2] !== 0))) && (
            <>
              {!hasAntenna && (
                <>
                  <div className="section-divider" />
                  <div className="section-label">Antenna</div>
                </>
              )}
              <InlineField
                label="Offset H"
                value={
                  f ? numStr(f.antDeltaH) : numStr(header.antDelta?.[0] ?? 0)
                }
                originalValue={editing ? numStr(orig.antDeltaH) : undefined}
                editing={editing}
                onChange={(v) => updateField('antDeltaH', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Offset E"
                value={
                  f ? numStr(f.antDeltaE) : numStr(header.antDelta?.[1] ?? 0)
                }
                originalValue={editing ? numStr(orig.antDeltaE) : undefined}
                editing={editing}
                onChange={(v) => updateField('antDeltaE', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Offset N"
                value={
                  f ? numStr(f.antDeltaN) : numStr(header.antDelta?.[2] ?? 0)
                }
                originalValue={editing ? numStr(orig.antDeltaN) : undefined}
                editing={editing}
                onChange={(v) => updateField('antDeltaN', parseFloat(v) || 0)}
                type="number"
              />
            </>
          )}

          {(editing || hasPosition) && (
            <>
              <div className="section-divider" />
              <div className="section-label">Approx position (ECEF)</div>
              <InlineField
                label="X (m)"
                value={
                  f
                    ? numStr(f.positionX)
                    : numStr(header.approxPosition?.[0] ?? 0)
                }
                originalValue={editing ? numStr(orig.positionX) : undefined}
                editing={editing}
                onChange={(v) => updateField('positionX', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Y (m)"
                value={
                  f
                    ? numStr(f.positionY)
                    : numStr(header.approxPosition?.[1] ?? 0)
                }
                originalValue={editing ? numStr(orig.positionY) : undefined}
                editing={editing}
                onChange={(v) => updateField('positionY', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Z (m)"
                value={
                  f
                    ? numStr(f.positionZ)
                    : numStr(header.approxPosition?.[2] ?? 0)
                }
                originalValue={editing ? numStr(orig.positionZ) : undefined}
                editing={editing}
                onChange={(v) => updateField('positionZ', parseFloat(v) || 0)}
                type="number"
              />
            </>
          )}

          {(editing || hasObserver) && (
            <>
              <div className="section-divider" />
              <div className="section-label">Observer</div>
              <InlineField
                label="Name"
                value={f ? f.observer : header.observer}
                originalValue={editing ? orig.observer : undefined}
                editing={editing}
                onChange={(v) => updateField('observer', v)}
                maxLength={20}
              />
              <InlineField
                label="Agency"
                value={f ? f.agency : header.agency}
                originalValue={editing ? orig.agency : undefined}
                editing={editing}
                onChange={(v) => updateField('agency', v)}
                maxLength={40}
              />
            </>
          )}
        </div>
      </div>
    </details>
  );
}
