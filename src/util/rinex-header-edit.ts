/**
 * RINEX header editor — parse raw header lines, modify fields, reconstruct file.
 *
 * Works with RINEX 2.x, 3.x, and 4.x observation and navigation files.
 * Operates on the raw text so the data section is preserved byte-for-byte.
 */

import { padL, fmtF, hdrLine } from 'gnss-js/rinex';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface EditableHeaderFields {
  markerName: string;
  markerType: string;
  receiverNumber: string;
  receiverType: string;
  receiverVersion: string;
  antNumber: string;
  antType: string;
  positionX: number;
  positionY: number;
  positionZ: number;
  antDeltaH: number;
  antDeltaE: number;
  antDeltaN: number;
  observer: string;
  agency: string;
}

export interface RawRinexFile {
  /** Raw header lines (including END OF HEADER). */
  headerLines: string[];
  /** Everything after END OF HEADER (preserved verbatim). */
  body: string;
}

/* ================================================================== */
/*  Parse raw file into header + body                                  */
/* ================================================================== */

/**
 * Split a RINEX file's text content into header lines and body.
 * Supports files read as a single string.
 */
export function splitRinexFile(text: string): RawRinexFile {
  const eohIndex = text.indexOf('END OF HEADER');
  if (eohIndex === -1) {
    throw new Error('No END OF HEADER found — not a valid RINEX file.');
  }

  // Find the end of the END OF HEADER line
  let lineEnd = text.indexOf('\n', eohIndex);
  if (lineEnd === -1) lineEnd = text.length;
  else lineEnd += 1; // include the newline

  const headerText = text.substring(0, lineEnd);
  const body = text.substring(lineEnd);

  const headerLines = headerText
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => (l.endsWith('\r') ? l : l)); // preserve as-is

  return { headerLines, body };
}

/* ================================================================== */
/*  Extract editable fields from raw header lines                      */
/* ================================================================== */

export function extractEditableFields(lines: string[]): EditableHeaderFields {
  const fields: EditableHeaderFields = {
    markerName: '',
    markerType: '',
    receiverNumber: '',
    receiverType: '',
    receiverVersion: '',
    antNumber: '',
    antType: '',
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    antDeltaH: 0,
    antDeltaE: 0,
    antDeltaN: 0,
    observer: '',
    agency: '',
  };

  for (const raw of lines) {
    if (raw.length < 61) continue;
    const label = raw.substring(60).trim();
    const data = raw.substring(0, 60);

    switch (label) {
      case 'MARKER NAME':
        fields.markerName = data.trim();
        break;
      case 'MARKER TYPE':
        fields.markerType = data.trim();
        break;
      case 'OBSERVER / AGENCY':
        fields.observer = data.substring(0, 20).trim();
        fields.agency = data.substring(20).trim();
        break;
      case 'REC # / TYPE / VERS':
        fields.receiverNumber = data.substring(0, 20).trim();
        fields.receiverType = data.substring(20, 40).trim();
        fields.receiverVersion = data.substring(40, 60).trim();
        break;
      case 'ANT # / TYPE':
        fields.antNumber = data.substring(0, 20).trim();
        fields.antType = data.substring(20).trim();
        break;
      case 'APPROX POSITION XYZ': {
        const p = data.trim().split(/\s+/).map(Number);
        if (p.length >= 3) {
          fields.positionX = p[0] ?? 0;
          fields.positionY = p[1] ?? 0;
          fields.positionZ = p[2] ?? 0;
        }
        break;
      }
      case 'ANTENNA: DELTA H/E/N': {
        const d = data.trim().split(/\s+/).map(Number);
        if (d.length >= 3) {
          fields.antDeltaH = d[0] ?? 0;
          fields.antDeltaE = d[1] ?? 0;
          fields.antDeltaN = d[2] ?? 0;
        }
        break;
      }
    }
  }

  return fields;
}

/* ================================================================== */
/*  Modify header lines with new field values                          */
/* ================================================================== */

/**
 * Format an antenna type string following IGS convention:
 * 20-char antenna model + radome code (space-padded).
 */
function formatAntennaType(antType: string): string {
  const trimmed = antType.trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(' ');
  if (parts.length <= 1) return padL(trimmed, 20);
  // Model (left-aligned in first part) + radome (right-aligned to fill 20 chars)
  const model = parts[0]!;
  const radome = parts.slice(1).join(' ');
  const gap = Math.max(1, 20 - model.length - radome.length);
  return (model + ' '.repeat(gap) + radome).substring(0, 20);
}

export function modifyHeaderLines(
  lines: string[],
  fields: EditableHeaderFields,
): string[] {
  const result = [...lines];
  const found = new Set<string>();

  for (let i = 0; i < result.length; i++) {
    const raw = result[i]!;
    if (raw.length < 61) continue;
    const label = raw.substring(60).trim();

    switch (label) {
      case 'MARKER NAME':
        result[i] = hdrLine(fields.markerName, 'MARKER NAME');
        found.add('MARKER NAME');
        break;
      case 'MARKER TYPE':
        result[i] = hdrLine(fields.markerType, 'MARKER TYPE');
        found.add('MARKER TYPE');
        break;
      case 'OBSERVER / AGENCY':
        result[i] = hdrLine(
          `${padL(fields.observer, 20)}${padL(fields.agency, 40)}`,
          'OBSERVER / AGENCY',
        );
        found.add('OBSERVER / AGENCY');
        break;
      case 'REC # / TYPE / VERS':
        result[i] = hdrLine(
          `${padL(fields.receiverNumber, 20)}${padL(fields.receiverType, 20)}${padL(fields.receiverVersion, 20)}`,
          'REC # / TYPE / VERS',
        );
        found.add('REC # / TYPE / VERS');
        break;
      case 'ANT # / TYPE':
        result[i] = hdrLine(
          `${padL(fields.antNumber, 20)}${formatAntennaType(fields.antType)}`,
          'ANT # / TYPE',
        );
        found.add('ANT # / TYPE');
        break;
      case 'APPROX POSITION XYZ':
        result[i] = hdrLine(
          `${fmtF(fields.positionX, 14, 4)}${fmtF(fields.positionY, 14, 4)}${fmtF(fields.positionZ, 14, 4)}`,
          'APPROX POSITION XYZ',
        );
        found.add('APPROX POSITION XYZ');
        break;
      case 'ANTENNA: DELTA H/E/N':
        result[i] = hdrLine(
          `${fmtF(fields.antDeltaH, 14, 4)}${fmtF(fields.antDeltaE, 14, 4)}${fmtF(fields.antDeltaN, 14, 4)}`,
          'ANTENNA: DELTA H/E/N',
        );
        found.add('ANTENNA: DELTA H/E/N');
        break;
    }
  }

  // Insert missing fields before END OF HEADER
  const eohIdx = result.findIndex(
    (l) => l.substring(60).trim() === 'END OF HEADER',
  );
  if (eohIdx !== -1) {
    const toInsert: string[] = [];
    if (!found.has('MARKER NAME') && fields.markerName)
      toInsert.push(hdrLine(fields.markerName, 'MARKER NAME'));
    if (!found.has('MARKER TYPE') && fields.markerType)
      toInsert.push(hdrLine(fields.markerType, 'MARKER TYPE'));
    if (
      !found.has('REC # / TYPE / VERS') &&
      (fields.receiverNumber || fields.receiverType)
    )
      toInsert.push(
        hdrLine(
          `${padL(fields.receiverNumber, 20)}${padL(fields.receiverType, 20)}${padL(fields.receiverVersion, 20)}`,
          'REC # / TYPE / VERS',
        ),
      );
    if (!found.has('ANT # / TYPE') && (fields.antNumber || fields.antType))
      toInsert.push(
        hdrLine(
          `${padL(fields.antNumber, 20)}${formatAntennaType(fields.antType)}`,
          'ANT # / TYPE',
        ),
      );
    if (toInsert.length > 0) {
      result.splice(eohIdx, 0, ...toInsert);
    }
  }

  return result;
}

/* ================================================================== */
/*  Reconstruct full file text                                         */
/* ================================================================== */

export function reconstructFile(
  raw: RawRinexFile,
  fields: EditableHeaderFields,
): string {
  const modified = modifyHeaderLines(raw.headerLines, fields);
  return modified.join('\n') + '\n' + raw.body;
}
