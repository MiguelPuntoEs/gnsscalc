/**
 * RINEX 4.01 observation file writer.
 *
 * RINEX 4 is structurally very similar to RINEX 3 — same epoch record
 * format, same observation encoding. The main differences are:
 *   - Version line says 4.01
 *   - New header records (e.g. SYS / PHASE SHIFT, etc.) are optional
 *   - More satellite systems and signal codes are supported
 *
 * We produce a minimal valid RINEX 4.01 file.
 */

import type { RinexHeader } from './rinex';
import type { CompactEpoch } from './obs-writer';
import { padL, padR, fmtF, hdrLine } from './rinex-format';

/**
 * Write RINEX 4.01 obs file from compact observations.
 * Streams text through gzip compression.
 */
export async function writeRinex4ObsBlob(
  header: RinexHeader,
  epochs: CompactEpoch[],
  obsTypes: Map<string, string[]>,
): Promise<Blob> {
  if (epochs.length === 0) return new Blob([], { type: 'application/gzip' });

  const encoder = new TextEncoder();
  const compressor = new CompressionStream('gzip');
  const writer = compressor.writable.getWriter();

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
    `     4.01           OBSERVATION DATA    ${sysChar}`,
    'RINEX VERSION / TYPE',
  ));

  const now = new Date();
  const dateStr = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')} UTC`;
  batch.push(hdrLine(
    `${padL('GNSSCalc', 20)}${padL('', 20)}${dateStr}`,
    'PGM / RUN BY / DATE',
  ));

  batch.push(hdrLine('Converted to RINEX 4 by GNSSCalc', 'COMMENT'));
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

  // ── Epoch records (identical format to RINEX 3) ──
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

      const valArr = epoch.sats.get(prn)!;
      let line = prn;

      for (let i = 0; i < sysTypes.length; i++) {
        const val = i < valArr.length ? valArr[i]! : NaN;
        if (!isNaN(val)) {
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
