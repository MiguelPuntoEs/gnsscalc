import { useState, useCallback, useMemo, useRef } from 'react';
import type { EditableHeaderFields, RawRinexFile } from '../util/rinex-header-edit';
import { extractEditableFields, splitRinexFile, reconstructFile } from '../util/rinex-header-edit';
import type { RinexHeader, RinexStats } from '../util/rinex';
import InlineField from './InlineField';
import ObsTypeMatrix from './ObsTypeMatrix';
import { PencilIcon, DownloadIcon, UndoIcon, ChevronIcon } from './HeaderEditorIcons';

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

export interface RinexHeaderEditorProps {
  header: RinexHeader;
  stats: RinexStats;
  file: File;
  readFileText: (file: File) => Promise<string>;
}

export default function RinexHeaderEditor({
  header,
  stats,
  file,
  readFileText,
}: RinexHeaderEditorProps) {

  const [rawFile, setRawFile] = useState<RawRinexFile | null>(null);
  const [fields, setFields] = useState<EditableHeaderFields | null>(null);
  const [editing, setEditing] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const loadRawFile = useCallback(async () => {
    if (rawFile) return;
    const text = await readFileText(file);
    const raw = splitRinexFile(text);
    const f = extractEditableFields(raw.headerLines);
    setRawFile(raw);
    setFields(f);
  }, [rawFile, file, readFileText]);

  const handleEditToggle = useCallback(async () => {
    if (!editing) {
      await loadRawFile();
      setEditing(true);
      setDownloaded(false);
      if (detailsRef.current) detailsRef.current.open = true;
    } else {
      setEditing(false);
    }
  }, [editing, loadRawFile]);

  const updateField = useCallback(<K extends keyof EditableHeaderFields>(
    key: K,
    value: EditableHeaderFields[K],
  ) => {
    setFields(prev => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const originalFields = useMemo(() => {
    if (!rawFile) return null;
    return extractEditableFields(rawFile.headerLines);
  }, [rawFile]);

  const hasChanges = useMemo(() => {
    if (!fields || !originalFields) return false;
    return JSON.stringify(fields) !== JSON.stringify(originalFields);
  }, [fields, originalFields]);

  const handleDownload = useCallback(() => {
    if (!rawFile || !fields) return;
    const text = reconstructFile(rawFile, fields);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.replace(/\.gz$/i, '');
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }, [rawFile, fields, file.name]);

  const handleRevert = useCallback(() => {
    if (originalFields) {
      setFields({ ...originalFields });
      setDownloaded(false);
    }
  }, [originalFields]);

  const changedCount = useMemo(() => {
    if (!fields || !originalFields) return 0;
    let count = 0;
    for (const key of Object.keys(fields) as (keyof EditableHeaderFields)[]) {
      if (String(fields[key]) !== String(originalFields[key])) count++;
    }
    return count;
  }, [fields, originalFields]);

  const f = fields ?? null;
  const orig = originalFields;

  const hasReceiver = !!(header.receiverType || header.receiverNumber);
  const hasAntenna = !!(header.antType || header.antNumber);
  const hasPosition = !!(header.approxPosition && (header.approxPosition[0] !== 0 || header.approxPosition[1] !== 0 || header.approxPosition[2] !== 0));
  const hasObserver = !!(header.observer || header.agency);

  const summaryParts: string[] = [];
  if (hasReceiver) summaryParts.push(header.receiverType || 'Receiver');
  if (hasAntenna) summaryParts.push(header.antType || 'Antenna');
  if (hasPosition) summaryParts.push('Position');
  if (hasObserver) summaryParts.push(header.agency || header.observer || 'Observer');

  return (
    <details ref={detailsRef} className="group rounded-xl bg-bg-raised/60 border border-border/40 overflow-hidden">
      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <ChevronIcon className="size-4 text-fg/30 shrink-0 transition-transform group-open:rotate-90" />
        <span className="text-sm font-semibold text-fg shrink-0">Header & Observation Types</span>
        {!editing && summaryParts.length > 0 && (
          <span className="text-[10px] text-fg/30 truncate min-w-0">
            {summaryParts.join(' · ')}
          </span>
        )}
        {editing && hasChanges && (
          <span className="text-[10px] text-accent shrink-0">
            {changedCount} field{changedCount !== 1 ? 's' : ''} changed
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {editing && hasChanges && (
            <>
              <button
                type="button"
                className="btn-secondary flex items-center gap-1 !py-0.5 !px-2 !text-[11px]"
                onClick={(e) => { e.preventDefault(); handleRevert(); }}
                title="Revert all changes"
              >
                <UndoIcon className="size-2.5" />
                Revert
              </button>
              <button
                type="button"
                className="btn flex items-center gap-1 !py-0.5 !px-2 !text-[11px]"
                onClick={(e) => { e.preventDefault(); handleDownload(); }}
              >
                <DownloadIcon className="size-3" />
                {downloaded ? 'Download again' : 'Download'}
              </button>
            </>
          )}
          <button
            type="button"
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              editing
                ? 'text-accent hover:text-accent/80'
                : 'text-fg/40 hover:text-fg/70'
            }`}
            onClick={(e) => { e.preventDefault(); handleEditToggle(); }}
            title={editing ? 'Stop editing' : 'Edit header fields'}
          >
            <PencilIcon className="size-3" />
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </summary>

      <div className="px-4 pb-4">
        <div className="card-fields">
          <InlineField
            label="Marker"
            value={f ? f.markerName : (header.markerName || '—')}
            originalValue={orig?.markerName}
            editing={editing}
            onChange={v => updateField('markerName', v)}
            maxLength={60}
          />

          {(editing || header.markerType) && (
            <InlineField
              label="Marker type"
              value={f ? f.markerType : header.markerType}
              originalValue={orig?.markerType}
              editing={editing}
              onChange={v => updateField('markerType', v)}
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
                  originalValue={orig?.receiverNumber}
                  editing={editing}
                  onChange={v => updateField('receiverNumber', v)}
                  maxLength={20}
                />
              )}
              <InlineField
                label="Type"
                value={f ? f.receiverType : header.receiverType}
                originalValue={orig?.receiverType}
                editing={editing}
                onChange={v => updateField('receiverType', v)}
                autocomplete={editing ? { getSuggestions: getReceivers, placeholder: 'e.g. LEICA GR25' } : undefined}
              />
              {(editing || header.receiverVersion) && (
                <InlineField
                  label="Firmware"
                  value={f ? f.receiverVersion : header.receiverVersion}
                  originalValue={orig?.receiverVersion}
                  editing={editing}
                  onChange={v => updateField('receiverVersion', v)}
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
                  originalValue={orig?.antNumber}
                  editing={editing}
                  onChange={v => updateField('antNumber', v)}
                  maxLength={20}
                />
              )}
              <InlineField
                label="Type"
                value={f ? f.antType : header.antType}
                originalValue={orig?.antType}
                editing={editing}
                onChange={v => updateField('antType', v)}
                autocomplete={editing ? { getSuggestions: getAntennas, placeholder: 'e.g. LEIAR25.R4      LEIT' } : undefined}
              />
            </>
          )}

          {(editing || (header.antDelta && (header.antDelta[0] !== 0 || header.antDelta[1] !== 0 || header.antDelta[2] !== 0))) && (
            <>
              {!hasAntenna && <><div className="section-divider" /><div className="section-label">Antenna</div></>}
              <InlineField
                label="Offset H"
                value={f ? numStr(f.antDeltaH) : numStr(header.antDelta?.[0] ?? 0)}
                originalValue={orig ? numStr(orig.antDeltaH) : undefined}
                editing={editing}
                onChange={v => updateField('antDeltaH', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Offset E"
                value={f ? numStr(f.antDeltaE) : numStr(header.antDelta?.[1] ?? 0)}
                originalValue={orig ? numStr(orig.antDeltaE) : undefined}
                editing={editing}
                onChange={v => updateField('antDeltaE', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Offset N"
                value={f ? numStr(f.antDeltaN) : numStr(header.antDelta?.[2] ?? 0)}
                originalValue={orig ? numStr(orig.antDeltaN) : undefined}
                editing={editing}
                onChange={v => updateField('antDeltaN', parseFloat(v) || 0)}
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
                value={f ? numStr(f.positionX) : numStr(header.approxPosition?.[0] ?? 0)}
                originalValue={orig ? numStr(orig.positionX) : undefined}
                editing={editing}
                onChange={v => updateField('positionX', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Y (m)"
                value={f ? numStr(f.positionY) : numStr(header.approxPosition?.[1] ?? 0)}
                originalValue={orig ? numStr(orig.positionY) : undefined}
                editing={editing}
                onChange={v => updateField('positionY', parseFloat(v) || 0)}
                type="number"
              />
              <InlineField
                label="Z (m)"
                value={f ? numStr(f.positionZ) : numStr(header.approxPosition?.[2] ?? 0)}
                originalValue={orig ? numStr(orig.positionZ) : undefined}
                editing={editing}
                onChange={v => updateField('positionZ', parseFloat(v) || 0)}
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
                originalValue={orig?.observer}
                editing={editing}
                onChange={v => updateField('observer', v)}
                maxLength={20}
              />
              <InlineField
                label="Agency"
                value={f ? f.agency : header.agency}
                originalValue={orig?.agency}
                editing={editing}
                onChange={v => updateField('agency', v)}
                maxLength={40}
              />
            </>
          )}

          {header.obsTypes && Object.keys(header.obsTypes).length > 0 && (
            <ObsTypeMatrix obsTypes={header.obsTypes} systems={stats.systems} />
          )}
        </div>

      </div>
    </details>
  );
}
