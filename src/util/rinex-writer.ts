/**
 * RINEX 3.04 observation file writer.
 *
 * Generates a valid RINEX 3 obs file from decoded MSM epochs.
 * Reference: RINEX 3.04 specification (IGS/RTCM).
 */

import type { MsmEpoch, MsmSatObs, MsmSignal } from './rtcm3-msm';
import { msmEpochToDate } from './rtcm3-msm';
import { padL, padR, fmtF, hdrLine } from './rinex-format';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface RinexObsHeader {
  markerName: string;
  markerNumber: string;
  observer: string;
  agency: string;
  receiverNumber: string;
  receiverType: string;
  receiverVersion: string;
  antennaNumber: string;
  antennaType: string;
  approxPosition: [number, number, number]; // ECEF X, Y, Z in meters
  antennaDelta: [number, number, number];   // H, E, N in meters
  comment: string;
}

interface EpochGroup {
  time: Date;
  observations: MsmSatObs[];
}

/* ================================================================== */
/*  Observation grouping                                               */
/* ================================================================== */

/**
 * Group MSM epochs into time-aligned observation epochs.
 * Multiple MSM messages from different constellations at the same time
 * are merged into a single epoch.
 */
function groupEpochs(epochs: MsmEpoch[], refTime: Date): EpochGroup[] {
  const groups = new Map<number, EpochGroup>();

  for (const epoch of epochs) {
    const date = msmEpochToDate(epoch.system, epoch.epochMs, refTime);
    // Round to nearest 10ms to group concurrent MSM messages
    const key = Math.round(date.getTime() / 10) * 10;

    let group = groups.get(key);
    if (!group) {
      group = { time: new Date(key), observations: [] };
      groups.set(key, group);
    }

    // Merge observations (replace existing sat data if same PRN)
    for (const obs of epoch.observations) {
      const existing = group.observations.find(o => o.prn === obs.prn);
      if (existing) {
        // Merge signals
        for (const sig of obs.signals) {
          const existingSig = existing.signals.find(s => s.rinexCode === sig.rinexCode);
          if (existingSig) {
            Object.assign(existingSig, sig);
          } else {
            existing.signals.push(sig);
          }
        }
      } else {
        group.observations.push({ ...obs, signals: [...obs.signals] });
      }
    }
  }

  return [...groups.values()].sort((a, b) => a.time.getTime() - b.time.getTime());
}

/**
 * Collect all observation types per system across all epochs.
 * Returns a map: system → sorted list of RINEX obs type strings (e.g., "C1C", "L1C", "S1C").
 */
function collectObsTypes(groups: EpochGroup[]): Map<string, string[]> {
  const typeSet = new Map<string, Set<string>>();

  for (const group of groups) {
    for (const obs of group.observations) {
      let sysTypes = typeSet.get(obs.system);
      if (!sysTypes) {
        sysTypes = new Set();
        typeSet.set(obs.system, sysTypes);
      }
      for (const sig of obs.signals) {
        // Generate all possible obs codes for this signal
        if (sig.pseudorange !== undefined) sysTypes.add(`C${sig.rinexCode}`);
        if (sig.phase !== undefined) sysTypes.add(`L${sig.rinexCode}`);
        if (sig.doppler !== undefined) sysTypes.add(`D${sig.rinexCode}`);
        if (sig.cn0 !== undefined) sysTypes.add(`S${sig.rinexCode}`);
      }
    }
  }

  // Sort: by band number, then by type letter (C, D, L, S), then by tracking code
  const result = new Map<string, string[]>();
  const sysOrder = ['G', 'R', 'E', 'C', 'J', 'I', 'S'];
  for (const sys of sysOrder) {
    const types = typeSet.get(sys);
    if (types && types.size > 0) {
      result.set(sys, [...types].sort((a, b) => {
        const bandA = a[1]!, bandB = b[1]!;
        if (bandA !== bandB) return bandA.localeCompare(bandB);
        const typeA = a[0]!, typeB = b[0]!;
        if (typeA !== typeB) return typeA.localeCompare(typeB);
        return a.localeCompare(b);
      }));
    }
  }
  return result;
}

/* ================================================================== */
/*  Writer                                                             */
/* ================================================================== */

const SYS_NAMES: Record<string, string> = {
  G: 'GPS', R: 'GLO', E: 'GAL', C: 'BDS', J: 'QZS', I: 'IRN', S: 'SBS',
};

/**
 * Write RINEX 3.04 observation file from decoded MSM epochs.
 */
export function writeRinexObs(
  msmEpochs: MsmEpoch[],
  header: Partial<RinexObsHeader> = {},
  refTime: Date = new Date(),
): string {
  if (msmEpochs.length === 0) return '';

  const groups = groupEpochs(msmEpochs, refTime);
  if (groups.length === 0) return '';

  const obsTypes = collectObsTypes(groups);
  const lines: string[] = [];

  // ── Header ──

  // Version line
  const systems = [...obsTypes.keys()];
  const sysChar = systems.length === 1 ? systems[0]! : 'M'; // M for mixed
  lines.push(hdrLine(
    `     3.04           OBSERVATION DATA    ${sysChar}`,
    'RINEX VERSION / TYPE',
  ));

  // Program / run by / date
  const now = new Date();
  const dateStr = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')} UTC`;
  lines.push(hdrLine(
    `${'GNSSCalc'.padEnd(20)}${''.padEnd(20)}${dateStr}`,
    'PGM / RUN BY / DATE',
  ));

  // Comment
  if (header.comment) {
    lines.push(hdrLine(header.comment, 'COMMENT'));
  }
  lines.push(hdrLine('Generated from live NTRIP RTCM3 stream', 'COMMENT'));

  // Marker
  lines.push(hdrLine(header.markerName ?? 'UNKNOWN', 'MARKER NAME'));
  lines.push(hdrLine(header.markerNumber ?? '', 'MARKER NUMBER'));

  // Observer / Agency
  lines.push(hdrLine(
    `${padL(header.observer ?? '', 20)}${padL(header.agency ?? '', 40)}`,
    'OBSERVER / AGENCY',
  ));

  // Receiver
  lines.push(hdrLine(
    `${padL(header.receiverNumber ?? '', 20)}${padL(header.receiverType ?? 'NTRIP', 20)}${padL(header.receiverVersion ?? '', 20)}`,
    'REC # / TYPE / VERS',
  ));

  // Antenna
  lines.push(hdrLine(
    `${padL(header.antennaNumber ?? '', 20)}${padL(header.antennaType ?? '', 20)}`,
    'ANT # / TYPE',
  ));

  // Approx position
  const pos = header.approxPosition ?? [0, 0, 0];
  lines.push(hdrLine(
    `${fmtF(pos[0], 14, 4)}${fmtF(pos[1], 14, 4)}${fmtF(pos[2], 14, 4)}`,
    'APPROX POSITION XYZ',
  ));

  // Antenna delta
  const delta = header.antennaDelta ?? [0, 0, 0];
  lines.push(hdrLine(
    `${fmtF(delta[0], 14, 4)}${fmtF(delta[1], 14, 4)}${fmtF(delta[2], 14, 4)}`,
    'ANTENNA: DELTA H/E/N',
  ));

  // Observation types per system
  for (const [sys, types] of obsTypes) {
    // Max 13 obs types per line
    for (let i = 0; i < types.length; i += 13) {
      const chunk = types.slice(i, i + 13);
      let content: string;
      if (i === 0) {
        content = `${sys}  ${padR(String(types.length), 3)}`;
      } else {
        content = '      ';
      }
      content += chunk.map(t => ` ${padL(t, 3)}`).join('');
      lines.push(hdrLine(content, 'SYS / # / OBS TYPES'));
    }
  }

  // Time system
  const timeSys = systems.includes('R') && systems.length === 1 ? 'GLO' : 'GPS';
  lines.push(hdrLine(`${padL(timeSys, 3)}`, 'TIME OF FIRST OBS'));

  // Interval (estimate from first two epochs)
  if (groups.length >= 2) {
    const interval = (groups[1]!.time.getTime() - groups[0]!.time.getTime()) / 1000;
    if (interval > 0 && interval < 3600) {
      lines.push(hdrLine(fmtF(interval, 10, 3), 'INTERVAL'));
    }
  }

  // Time of first obs
  const first = groups[0]!.time;
  lines.push(hdrLine(
    `  ${first.getUTCFullYear()}    ${String(first.getUTCMonth() + 1).padStart(2)}    ${String(first.getUTCDate()).padStart(2)}    ${String(first.getUTCHours()).padStart(2)}    ${String(first.getUTCMinutes()).padStart(2)}   ${first.getUTCSeconds().toFixed(7).padStart(10)}     ${timeSys}`,
    'TIME OF FIRST OBS',
  ));

  // Time of last obs
  const last = groups[groups.length - 1]!.time;
  lines.push(hdrLine(
    `  ${last.getUTCFullYear()}    ${String(last.getUTCMonth() + 1).padStart(2)}    ${String(last.getUTCDate()).padStart(2)}    ${String(last.getUTCHours()).padStart(2)}    ${String(last.getUTCMinutes()).padStart(2)}   ${last.getUTCSeconds().toFixed(7).padStart(10)}     ${timeSys}`,
    'TIME OF LAST OBS',
  ));

  // GLONASS slot/freq
  // (would need external data; skip for now)

  lines.push(hdrLine('', 'END OF HEADER'));

  // ── Epoch records ──

  for (const group of groups) {
    const t = group.time;
    const sec = t.getUTCSeconds() + t.getUTCMilliseconds() / 1000;

    // Sort observations by PRN
    const sorted = [...group.observations].sort((a, b) => a.prn.localeCompare(b.prn));

    // Epoch header line
    const epochLine = `> ${t.getUTCFullYear()} ${String(t.getUTCMonth() + 1).padStart(2, '0')} ${String(t.getUTCDate()).padStart(2, '0')} ${String(t.getUTCHours()).padStart(2, '0')} ${String(t.getUTCMinutes()).padStart(2, '0')}${fmtF(sec, 11, 7)}  0${padR(String(sorted.length), 3)}`;
    lines.push(epochLine);

    // One line per satellite
    for (const obs of sorted) {
      const sysTypes = obsTypes.get(obs.system);
      if (!sysTypes) continue;

      let line = obs.prn;

      for (const obsType of sysTypes) {
        const typeChar = obsType[0]!;   // C, L, D, S
        const rinexCode = obsType.slice(1); // "1C", "5X", etc.
        const sig = obs.signals.find(s => s.rinexCode === rinexCode);

        let value: number | undefined;
        let lli = 0;  // Loss of Lock Indicator
        let ssi = 0;  // Signal Strength Indicator

        if (sig) {
          switch (typeChar) {
            case 'C': value = sig.pseudorange; break;
            case 'L':
              value = sig.phase;
              if (sig.halfCycle) lli |= 1; // half-cycle ambiguity
              break;
            case 'D': value = sig.doppler; break;
            case 'S': value = sig.cn0; break;
          }
          // SSI from C/N0 (RINEX convention: 1-9, roughly cn0/6)
          if (sig.cn0 !== undefined && sig.cn0 > 0) {
            ssi = Math.min(9, Math.max(1, Math.round(sig.cn0 / 6)));
          }
        }

        if (value !== undefined) {
          line += fmtF(value, 14, 3);
          // LLI and SSI (only for L and C/S)
          if (typeChar === 'L') {
            line += lli > 0 ? String(lli) : ' ';
            line += ssi > 0 ? String(ssi) : ' ';
          } else {
            line += '  ';
          }
        } else {
          line += ' '.repeat(16); // blank observation (14 + 2)
        }
      }

      lines.push(line);
    }
  }

  return lines.join('\n') + '\n';
}
