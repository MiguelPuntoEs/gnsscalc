/**
 * RINEX 3.04 observation file writer from parsed RINEX data.
 *
 * Re-parses obs files using the SatObsCallback to capture raw observations,
 * then writes a merged RINEX 3 obs file.
 */

import { parseRinexStream } from './rinex';
import type { RinexHeader } from './rinex';
import { padL, padR, fmtF, hdrLine } from './rinex-format';
import { downloadText } from './nav-writer';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface RawEpoch {
  time: number; // unix ms
  sats: Map<string, Map<string, number | null>>; // PRN → obsCode → value
}

/* ================================================================== */
/*  Collect raw observations by re-parsing                             */
/* ================================================================== */

/**
 * Re-parse obs files and collect raw observation data for writing.
 * Returns merged epochs sorted chronologically.
 */
export async function collectRawObs(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<{ header: RinexHeader; epochs: RawEpoch[]; obsTypes: Map<string, string[]> }> {
  const epochMap = new Map<number, RawEpoch>();
  const obsTypeSets = new Map<string, Set<string>>();
  let baseHeader: RinexHeader | null = null;

  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi]!;

    const result = await parseRinexStream(
      file,
      onProgress ? (p) => {
        const overall = (fi + p / 100) / files.length * 100;
        onProgress(Math.round(overall));
      } : undefined,
      undefined,
      // SatObsCallback: capture raw observation values
      (time, prn, codes, values) => {
        let epoch = epochMap.get(time);
        if (!epoch) {
          epoch = { time, sats: new Map() };
          epochMap.set(time, epoch);
        }

        let satObs = epoch.sats.get(prn);
        if (!satObs) {
          satObs = new Map();
          epoch.sats.set(prn, satObs);
        }

        const sys = prn[0]!;
        let typeSet = obsTypeSets.get(sys);
        if (!typeSet) {
          typeSet = new Set();
          obsTypeSets.set(sys, typeSet);
        }

        for (let i = 0; i < codes.length; i++) {
          const code = codes[i]!;
          const val = values[i] ?? null;
          typeSet.add(code);
          if (val !== null) satObs.set(code, val);
        }
      },
    );

    if (!baseHeader) baseHeader = result.header;
  }

  if (!baseHeader) throw new Error('No observation data found');

  // Sort epochs chronologically
  const epochs = [...epochMap.values()].sort((a, b) => a.time - b.time);

  // Sort obs types per system
  const sysOrder = ['G', 'R', 'E', 'C', 'J', 'I', 'S'];
  const obsTypes = new Map<string, string[]>();
  for (const sys of sysOrder) {
    const types = obsTypeSets.get(sys);
    if (types && types.size > 0) {
      obsTypes.set(sys, [...types].sort((a, b) => {
        // Sort by band number, then type letter, then tracking code
        const bandA = a[1]!, bandB = b[1]!;
        if (bandA !== bandB) return bandA.localeCompare(bandB);
        const typeA = a[0]!, typeB = b[0]!;
        if (typeA !== typeB) return typeA.localeCompare(typeB);
        return a.localeCompare(b);
      }));
    }
  }

  return { header: baseHeader, epochs, obsTypes };
}

/* ================================================================== */
/*  Writer                                                             */
/* ================================================================== */

/**
 * Write RINEX 3.04 obs file from collected raw observations.
 * Streams text through gzip compression so we never hold the full
 * uncompressed output in memory. Returns a gzip-compressed Blob.
 */
export async function writeRinexObsBlob(
  header: RinexHeader,
  epochs: RawEpoch[],
  obsTypes: Map<string, string[]>,
): Promise<Blob> {
  if (epochs.length === 0) return new Blob([], { type: 'application/gzip' });

  const encoder = new TextEncoder();
  const compressor = new CompressionStream('gzip');
  const writer = compressor.writable.getWriter();

  // Collect compressed output asynchronously
  const compressedChunks: Uint8Array[] = [];
  const readerDone = (async () => {
    const reader = compressor.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      compressedChunks.push(value);
    }
  })();

  const BATCH = 200;
  let batch: string[] = [];

  async function flush() {
    if (batch.length === 0) return;
    await writer.write(encoder.encode(batch.join('\n') + '\n'));
    batch = [];
  }

  const systems = [...obsTypes.keys()];
  const sysChar = systems.length === 1 ? systems[0]! : 'M';

  // ── Header ──

  batch.push(hdrLine(
    `     3.04           OBSERVATION DATA    ${sysChar}`,
    'RINEX VERSION / TYPE',
  ));

  const now = new Date();
  const dateStr = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')} UTC`;
  batch.push(hdrLine(
    `${padL('GNSSCalc', 20)}${padL('', 20)}${dateStr}`,
    'PGM / RUN BY / DATE',
  ));

  batch.push(hdrLine('Merged from multiple RINEX files', 'COMMENT'));
  batch.push(hdrLine(header.markerName || 'UNKNOWN', 'MARKER NAME'));
  batch.push(hdrLine('', 'MARKER NUMBER'));

  batch.push(hdrLine(
    `${padL(header.observer || '', 20)}${padL(header.agency || '', 40)}`,
    'OBSERVER / AGENCY',
  ));

  batch.push(hdrLine(
    `${padL(header.receiverNumber || '', 20)}${padL(header.receiverType || '', 20)}${padL(header.receiverVersion || '', 20)}`,
    'REC # / TYPE / VERS',
  ));

  batch.push(hdrLine(
    `${padL(header.antNumber || '', 20)}${padL(header.antType || '', 20)}`,
    'ANT # / TYPE',
  ));

  const pos = header.approxPosition ?? [0, 0, 0];
  batch.push(hdrLine(
    `${fmtF(pos[0], 14, 4)}${fmtF(pos[1], 14, 4)}${fmtF(pos[2], 14, 4)}`,
    'APPROX POSITION XYZ',
  ));

  const delta = header.antDelta ?? [0, 0, 0];
  batch.push(hdrLine(
    `${fmtF(delta[0], 14, 4)}${fmtF(delta[1], 14, 4)}${fmtF(delta[2], 14, 4)}`,
    'ANTENNA: DELTA H/E/N',
  ));

  for (const [sys, types] of obsTypes) {
    for (let i = 0; i < types.length; i += 13) {
      const chunk = types.slice(i, i + 13);
      let content: string;
      if (i === 0) {
        content = `${sys}  ${padR(String(types.length), 3)}`;
      } else {
        content = '      ';
      }
      content += chunk.map(t => ` ${padL(t, 3)}`).join('');
      batch.push(hdrLine(content, 'SYS / # / OBS TYPES'));
    }
  }

  const first = new Date(epochs[0]!.time);
  const timeSys = systems.includes('R') && systems.length === 1 ? 'GLO' : 'GPS';
  batch.push(hdrLine(
    `  ${first.getUTCFullYear()}    ${String(first.getUTCMonth() + 1).padStart(2)}    ${String(first.getUTCDate()).padStart(2)}    ${String(first.getUTCHours()).padStart(2)}    ${String(first.getUTCMinutes()).padStart(2)}   ${(first.getUTCSeconds() + first.getUTCMilliseconds() / 1000).toFixed(7).padStart(10)}     ${timeSys}`,
    'TIME OF FIRST OBS',
  ));

  const last = new Date(epochs[epochs.length - 1]!.time);
  batch.push(hdrLine(
    `  ${last.getUTCFullYear()}    ${String(last.getUTCMonth() + 1).padStart(2)}    ${String(last.getUTCDate()).padStart(2)}    ${String(last.getUTCHours()).padStart(2)}    ${String(last.getUTCMinutes()).padStart(2)}   ${(last.getUTCSeconds() + last.getUTCMilliseconds() / 1000).toFixed(7).padStart(10)}     ${timeSys}`,
    'TIME OF LAST OBS',
  ));

  if (epochs.length >= 2) {
    const interval = (epochs[1]!.time - epochs[0]!.time) / 1000;
    if (interval > 0 && interval < 3600) {
      batch.push(hdrLine(fmtF(interval, 10, 3), 'INTERVAL'));
    }
  }

  if (header.glonassSlots && Object.keys(header.glonassSlots).length > 0) {
    const entries = Object.entries(header.glonassSlots).sort(([a], [b]) => Number(a) - Number(b));
    for (let i = 0; i < entries.length; i += 8) {
      const chunk = entries.slice(i, i + 8);
      let content = i === 0 ? padR(String(entries.length), 3) + ' ' : '    ';
      for (const [slot, freq] of chunk) {
        content += `R${padR(slot, 2)} ${padR(String(freq), 2)} `;
      }
      batch.push(hdrLine(content, 'GLONASS SLOT / FRQ #'));
    }
  }

  batch.push(hdrLine('', 'END OF HEADER'));
  await flush();

  // ── Epoch records (flushed in batches → compressed immediately) ──

  let epochCount = 0;
  for (const epoch of epochs) {
    const t = new Date(epoch.time);
    const sec = t.getUTCSeconds() + t.getUTCMilliseconds() / 1000;
    const prns = [...epoch.sats.keys()].sort();

    batch.push(`> ${t.getUTCFullYear()} ${String(t.getUTCMonth() + 1).padStart(2, '0')} ${String(t.getUTCDate()).padStart(2, '0')} ${String(t.getUTCHours()).padStart(2, '0')} ${String(t.getUTCMinutes()).padStart(2, '0')}${fmtF(sec, 11, 7)}  0${padR(String(prns.length), 3)}`);

    for (const prn of prns) {
      const sys = prn[0]!;
      const sysTypes = obsTypes.get(sys);
      if (!sysTypes) continue;

      const satObs = epoch.sats.get(prn)!;
      let line = prn;

      for (const obsType of sysTypes) {
        const val = satObs.get(obsType);
        if (val != null) {
          line += fmtF(val, 14, 3) + '  ';
        } else {
          line += ' '.repeat(16);
        }
      }
      batch.push(line);
    }

    epochCount++;
    if (epochCount % BATCH === 0) await flush();
  }

  await flush();
  await writer.close();
  await readerDone;

  return new Blob(compressedChunks as BlobPart[], { type: 'application/gzip' });
}

export { downloadText };
