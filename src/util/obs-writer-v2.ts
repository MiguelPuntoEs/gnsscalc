/**
 * RINEX 2.11 observation file writer.
 *
 * Converts RINEX 3 obs codes to RINEX 2 format and writes
 * a valid RINEX 2.11 observation file.
 */

import type { RinexHeader } from 'gnss-js/rinex';
import type { CompactEpoch } from './obs-writer';
import { padL, padR, fmtF, hdrLine } from 'gnss-js/rinex';

/* ── RINEX 3 → 2 code mapping ──────────────────────────────────── */

/**
 * Map RINEX 3 obs codes to RINEX 2 equivalents.
 * RINEX 2 uses 2-char codes: L1, L2, P1, P2, C1, C2, D1, D2, S1, S2, L5, etc.
 */
const V3_TO_V2: Record<string, string> = {
  // GPS
  C1C: 'C1',
  C1S: 'C1',
  C1L: 'C1',
  C1X: 'C1',
  C1W: 'P1',
  C1P: 'P1',
  C2C: 'C2',
  C2S: 'P2',
  C2L: 'P2',
  C2X: 'P2',
  C2W: 'P2',
  C2P: 'P2',
  C5I: 'C5',
  C5Q: 'C5',
  C5X: 'C5',
  L1C: 'L1',
  L1S: 'L1',
  L1L: 'L1',
  L1X: 'L1',
  L1W: 'L1',
  L1P: 'L1',
  L2C: 'L2',
  L2S: 'L2',
  L2L: 'L2',
  L2X: 'L2',
  L2W: 'L2',
  L2P: 'L2',
  L5I: 'L5',
  L5Q: 'L5',
  L5X: 'L5',
  D1C: 'D1',
  D1S: 'D1',
  D1L: 'D1',
  D1X: 'D1',
  D1W: 'D1',
  D1P: 'D1',
  D2C: 'D2',
  D2S: 'D2',
  D2L: 'D2',
  D2X: 'D2',
  D2W: 'D2',
  D2P: 'D2',
  D5I: 'D5',
  D5Q: 'D5',
  D5X: 'D5',
  S1C: 'S1',
  S1S: 'S1',
  S1L: 'S1',
  S1X: 'S1',
  S1W: 'S1',
  S1P: 'S1',
  S2C: 'S2',
  S2S: 'S2',
  S2L: 'S2',
  S2X: 'S2',
  S2W: 'S2',
  S2P: 'S2',
  S5I: 'S5',
  S5Q: 'S5',
  S5X: 'S5',
};

function v3ToV2Code(code3: string): string | null {
  return V3_TO_V2[code3] ?? null;
}

/**
 * Write RINEX 2.11 obs file from compact observations.
 * Only GPS+GLONASS satellites are included (RINEX 2 limitation).
 */
export async function writeRinex2ObsBlob(
  header: RinexHeader,
  epochs: CompactEpoch[],
  obsTypes: Map<string, string[]>,
): Promise<Blob> {
  if (epochs.length === 0) return new Blob([], { type: 'application/gzip' });

  // Build v2 obs type list from v3 codes (GPS codes, deduplicated)
  const gpsCodes = obsTypes.get('G') ?? obsTypes.get('R') ?? [];
  const v2Codes: string[] = [];
  const v2CodeSet = new Set<string>();
  const v3ToV2Map = new Map<string, number>(); // v3 code → v2 index

  for (const code3 of gpsCodes) {
    const code2 = v3ToV2Code(code3);
    if (!code2) continue;
    if (!v2CodeSet.has(code2)) {
      v2CodeSet.add(code2);
      v3ToV2Map.set(code3, v2Codes.length);
      v2Codes.push(code2);
    } else {
      // Map to existing index
      v3ToV2Map.set(code3, v2Codes.indexOf(code2));
    }
  }

  // Also map GLONASS codes
  const gloCodes = obsTypes.get('R') ?? [];
  for (const code3 of gloCodes) {
    const code2 = v3ToV2Code(code3);
    if (!code2) continue;
    if (!v2CodeSet.has(code2)) {
      v2CodeSet.add(code2);
      v3ToV2Map.set(code3, v2Codes.length);
      v2Codes.push(code2);
    } else if (!v3ToV2Map.has(code3)) {
      v3ToV2Map.set(code3, v2Codes.indexOf(code2));
    }
  }

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

  // Determine satellite system character
  const hasSystems = new Set<string>();
  for (const epoch of epochs) {
    for (const prn of epoch.sats.keys()) {
      const sys = prn[0]!;
      if (sys === 'G' || sys === 'R') hasSystems.add(sys);
    }
  }
  const sysChar =
    hasSystems.has('G') && hasSystems.has('R')
      ? 'M'
      : hasSystems.has('R')
        ? 'R'
        : 'G';

  // ── Header ──
  batch.push(
    hdrLine(
      `     2.11           OBSERVATION DATA    ${sysChar}`,
      'RINEX VERSION / TYPE',
    ),
  );

  const now = new Date();
  const dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
  batch.push(
    hdrLine(
      `${padL('GNSSCalc', 20)}${padL('', 20)}${dateStr}`,
      'PGM / RUN BY / DATE',
    ),
  );

  batch.push(hdrLine('Converted from RINEX 3 by GNSSCalc', 'COMMENT'));
  batch.push(hdrLine(header.markerName || 'UNKNOWN', 'MARKER NAME'));
  batch.push(hdrLine('', 'MARKER NUMBER'));

  batch.push(
    hdrLine(
      `${padL(header.observer || '', 20)}${padL(header.agency || '', 40)}`,
      'OBSERVER / AGENCY',
    ),
  );

  batch.push(
    hdrLine(
      `${padL(header.receiverNumber || '', 20)}${padL(header.receiverType || '', 20)}${padL(header.receiverVersion || '', 20)}`,
      'REC # / TYPE / VERS',
    ),
  );

  batch.push(
    hdrLine(
      `${padL(header.antNumber || '', 20)}${padL(header.antType || '', 20)}`,
      'ANT # / TYPE',
    ),
  );

  const pos = header.approxPosition ?? [0, 0, 0];
  batch.push(
    hdrLine(
      `${fmtF(pos[0], 14, 4)}${fmtF(pos[1], 14, 4)}${fmtF(pos[2], 14, 4)}`,
      'APPROX POSITION XYZ',
    ),
  );

  const delta = header.antDelta ?? [0, 0, 0];
  batch.push(
    hdrLine(
      `${fmtF(delta[0], 14, 4)}${fmtF(delta[1], 14, 4)}${fmtF(delta[2], 14, 4)}`,
      'ANTENNA: DELTA H/E/N',
    ),
  );

  batch.push(hdrLine('     1     1', 'WAVELENGTH FACT L1/2'));

  // # / TYPES OF OBSERV
  for (let i = 0; i < v2Codes.length; i += 9) {
    const chunk = v2Codes.slice(i, i + 9);
    let content: string;
    if (i === 0) {
      content = padR(String(v2Codes.length), 6);
    } else {
      content = '      ';
    }
    content += chunk.map((c) => padR(c, 6)).join('');
    batch.push(hdrLine(content, '# / TYPES OF OBSERV'));
  }

  const first = new Date(epochs[0]!.time);
  const timeSys = sysChar === 'R' ? 'GLO' : 'GPS';
  batch.push(
    hdrLine(
      `  ${first.getUTCFullYear()}    ${String(first.getUTCMonth() + 1).padStart(2)}    ${String(first.getUTCDate()).padStart(2)}    ${String(first.getUTCHours()).padStart(2)}    ${String(first.getUTCMinutes()).padStart(2)}   ${(first.getUTCSeconds() + first.getUTCMilliseconds() / 1000).toFixed(7).padStart(10)}     ${timeSys}`,
      'TIME OF FIRST OBS',
    ),
  );

  batch.push(hdrLine('', 'END OF HEADER'));
  await flush();

  // ── Epoch records ──
  let epochCount = 0;
  for (const epoch of epochs) {
    const t = new Date(epoch.time);
    const sec = t.getUTCSeconds() + t.getUTCMilliseconds() / 1000;

    // Only GPS + GLONASS in v2
    const prns = [...epoch.sats.keys()]
      .filter((p) => p[0] === 'G' || p[0] === 'R')
      .sort();
    if (prns.length === 0) continue;

    // Epoch header line: yy mm dd hh mm ss.sssssss  flag numSats PRN list
    const yy = t.getUTCFullYear() % 100;
    const yyS = padR(String(yy), 2);
    const moS = padR(String(t.getUTCMonth() + 1), 2);
    const ddS = padR(String(t.getUTCDate()), 2);
    const hhS = padR(String(t.getUTCHours()), 2);
    const mmS = padR(String(t.getUTCMinutes()), 2);
    const secS = fmtF(sec, 11, 7);
    const nSats = padR(String(prns.length), 3);
    let epochLine = ` ${yyS} ${moS} ${ddS} ${hhS} ${mmS}${secS}  0${nSats}`;

    // PRN list on epoch header (max 12 per line)
    for (let i = 0; i < prns.length; i++) {
      if (i > 0 && i % 12 === 0) {
        batch.push(epochLine);
        epochLine = ' '.repeat(32);
      }
      epochLine += prns[i]!;
    }
    batch.push(epochLine);

    // Observation lines (max 5 obs per line, 16 chars each)
    for (const prn of prns) {
      const sys = prn[0]!;
      const sysCodes3 = obsTypes.get(sys) ?? [];
      const valArr = epoch.sats.get(prn)!;

      // Build v2 values array
      const v2Vals: number[] = new Array<number>(v2Codes.length).fill(NaN);
      for (let j = 0; j < sysCodes3.length; j++) {
        const v2Idx = v3ToV2Map.get(sysCodes3[j]!);
        if (v2Idx != null && j < valArr.length && !isNaN(valArr[j]!)) {
          v2Vals[v2Idx] = valArr[j]!;
        }
      }

      // Write in groups of 5
      let line = '';
      for (let j = 0; j < v2Codes.length; j++) {
        const val = v2Vals[j]!;
        if (!isNaN(val)) {
          line += fmtF(val, 14, 3) + '  ';
        } else {
          line += ' '.repeat(16);
        }
        if ((j + 1) % 5 === 0 || j === v2Codes.length - 1) {
          batch.push(line);
          line = '';
        }
      }
    }

    epochCount++;
    if (epochCount % BATCH === 0) await flush();
  }

  await flush();
  await writer.close();
  await readerDone;

  return new Blob(compressedChunks as BlobPart[], { type: 'application/gzip' });
}
