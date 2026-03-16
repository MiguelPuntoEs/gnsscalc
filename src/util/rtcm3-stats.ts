/**
 * RTCM3 stream statistics — tracks message types, satellite C/N0,
 * ephemerides, and station metadata from a live NTRIP stream.
 */

import type { Rtcm3Frame } from './rtcm3-decoder';
import type { EphemerisInfo } from './rtcm3-ephemeris';
import { decodeEphemeris } from './rtcm3-ephemeris';
import type { StationMeta } from './rtcm3-station';
import { createStationMeta, updateStationMeta } from './rtcm3-station';
import { decodeMsmFull } from './rtcm3-msm';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/** Per-signal C/N0 for one satellite */
export interface SignalCn0 {
  /** RINEX 2-char obs code, e.g. "1C", "5X" */
  code: string;
  /** C/N0 in dB-Hz */
  cn0: number;
}

export interface SatCn0 {
  prn: string;
  system: string;  // single letter: G, R, E, C, J, I, S
  cn0: number;     // dB-Hz (best signal across all codes)
  lastSeen: number;
  /** Per-signal C/N0 values */
  signals: SignalCn0[];
}

export interface MessageTypeStats {
  messageType: number;
  name: string;
  count: number;
  lastSeen: number;       // timestamp ms
  constellation: string | null;
  totalBytes: number;
}

export interface StreamStats {
  totalBytes: number;
  totalFrames: number;
  startTime: number;
  messageTypes: Map<number, MessageTypeStats>;
  bytesPerSecond: number;
  framesPerSecond: number;
  /** Per-satellite C/N0 from MSM messages. Key = PRN (e.g. "G01"). */
  satellites: Map<string, SatCn0>;
  /** Per-satellite ephemeris data. Key = PRN (e.g. "G01"). */
  ephemerides: Map<string, EphemerisInfo>;
  /** Observed RINEX codes per system (e.g. G → ["C1C","L1C","S1C"]). */
  obsTypes: Record<string, Set<string>>;
  /** Station metadata from RTCM3 descriptor messages. */
  stationMeta: StationMeta;
}

/* ================================================================== */
/*  Message name lookup                                                */
/* ================================================================== */

/** Known RTCM3 message type names. */
export const RTCM3_MESSAGE_NAMES: Record<number, string> = {
  // GPS
  1001: 'GPS L1 Code',
  1002: 'GPS L1 Code+Phase',
  1003: 'GPS L1/L2 Code',
  1004: 'GPS L1/L2 Code+Phase',
  1005: 'Station ARP (no height)',
  1006: 'Station ARP (with height)',
  1007: 'Antenna Descriptor',
  1008: 'Antenna Descriptor+Serial',
  1009: 'GLONASS L1 Code',
  1010: 'GLONASS L1 Code+Phase',
  1011: 'GLONASS L1/L2 Code',
  1012: 'GLONASS L1/L2 Code+Phase',
  1013: 'System Parameters',
  1014: 'Network Aux Station Data',
  1015: 'GPS Ionospheric Corrections',
  1016: 'GPS Geometric Corrections',
  1017: 'GPS Combined Corrections',
  1019: 'GPS Ephemeris',
  1020: 'GLONASS Ephemeris',
  1029: 'Unicode Text String',
  1030: 'GPS Network RTK Residual',
  1031: 'GLONASS Network RTK Residual',
  1032: 'Physical Reference Station',
  1033: 'Receiver+Antenna Descriptor',
  1042: 'BeiDou Ephemeris',
  1043: 'SBAS Ephemeris',
  1044: 'QZSS Ephemeris',
  1045: 'Galileo F/NAV Ephemeris',
  1046: 'Galileo I/NAV Ephemeris',
  // MSM
  1071: 'GPS MSM1', 1072: 'GPS MSM2', 1073: 'GPS MSM3',
  1074: 'GPS MSM4', 1075: 'GPS MSM5', 1076: 'GPS MSM6', 1077: 'GPS MSM7',
  1081: 'GLONASS MSM1', 1082: 'GLONASS MSM2', 1083: 'GLONASS MSM3',
  1084: 'GLONASS MSM4', 1085: 'GLONASS MSM5', 1086: 'GLONASS MSM6', 1087: 'GLONASS MSM7',
  1091: 'Galileo MSM1', 1092: 'Galileo MSM2', 1093: 'Galileo MSM3',
  1094: 'Galileo MSM4', 1095: 'Galileo MSM5', 1096: 'Galileo MSM6', 1097: 'Galileo MSM7',
  1101: 'SBAS MSM1', 1102: 'SBAS MSM2', 1103: 'SBAS MSM3',
  1104: 'SBAS MSM4', 1105: 'SBAS MSM5', 1106: 'SBAS MSM6', 1107: 'SBAS MSM7',
  1111: 'QZSS MSM1', 1112: 'QZSS MSM2', 1113: 'QZSS MSM3',
  1114: 'QZSS MSM4', 1115: 'QZSS MSM5', 1116: 'QZSS MSM6', 1117: 'QZSS MSM7',
  1121: 'BeiDou MSM1', 1122: 'BeiDou MSM2', 1123: 'BeiDou MSM3',
  1124: 'BeiDou MSM4', 1125: 'BeiDou MSM5', 1126: 'BeiDou MSM6', 1127: 'BeiDou MSM7',
  1131: 'NavIC MSM1', 1132: 'NavIC MSM2', 1133: 'NavIC MSM3',
  1134: 'NavIC MSM4', 1135: 'NavIC MSM5', 1136: 'NavIC MSM6', 1137: 'NavIC MSM7',
  // SSR
  1057: 'GPS SSR Orbit', 1058: 'GPS SSR Clock',
  1059: 'GPS SSR Code Bias', 1060: 'GPS SSR Orbit+Clock',
  1063: 'GLONASS SSR Orbit', 1064: 'GLONASS SSR Clock',
  1065: 'GLONASS SSR Code Bias', 1066: 'GLONASS SSR Orbit+Clock',
  // IGS SSR
  4076: 'IGS SSR',
};

/** RTCM3 message type to constellation mapping. */
export function rtcm3Constellation(msgType: number): string | null {
  if (msgType >= 1001 && msgType <= 1004) return 'GPS';
  if (msgType >= 1009 && msgType <= 1012) return 'GLONASS';
  if (msgType === 1019) return 'GPS';
  if (msgType === 1020) return 'GLONASS';
  if (msgType === 1042) return 'BeiDou';
  if (msgType === 1043) return 'SBAS';
  if (msgType === 1044) return 'QZSS';
  if (msgType === 1045 || msgType === 1046) return 'Galileo';
  if (msgType >= 1071 && msgType <= 1077) return 'GPS';
  if (msgType >= 1081 && msgType <= 1087) return 'GLONASS';
  if (msgType >= 1091 && msgType <= 1097) return 'Galileo';
  if (msgType >= 1101 && msgType <= 1107) return 'SBAS';
  if (msgType >= 1111 && msgType <= 1117) return 'QZSS';
  if (msgType >= 1121 && msgType <= 1127) return 'BeiDou';
  if (msgType >= 1131 && msgType <= 1137) return 'NavIC';
  return null;
}

/* ================================================================== */
/*  Stream stats                                                       */
/* ================================================================== */

export function createStreamStats(): StreamStats {
  return {
    totalBytes: 0,
    totalFrames: 0,
    startTime: Date.now(),
    messageTypes: new Map(),
    bytesPerSecond: 0,
    framesPerSecond: 0,
    satellites: new Map(),
    ephemerides: new Map(),
    obsTypes: {},
    stationMeta: createStationMeta(),
  };
}

export function updateStreamStats(stats: StreamStats, frames: Rtcm3Frame[], rawBytes: number): void {
  const now = Date.now();
  stats.totalBytes += rawBytes;
  stats.totalFrames += frames.length;

  for (const frame of frames) {
    let entry = stats.messageTypes.get(frame.messageType);
    if (!entry) {
      entry = {
        messageType: frame.messageType,
        name: RTCM3_MESSAGE_NAMES[frame.messageType] ?? `Unknown (${frame.messageType})`,
        count: 0,
        lastSeen: now,
        constellation: rtcm3Constellation(frame.messageType),
        totalBytes: 0,
      };
      stats.messageTypes.set(frame.messageType, entry);
    }
    entry.count++;
    entry.lastSeen = now;
    entry.totalBytes += frame.length + 6;

    // Decode full MSM observations (C/N0, obs types)
    const msmEpoch = decodeMsmFull(frame);
    if (msmEpoch) {
      const now2 = Date.now();
      for (const obs of msmEpoch.observations) {
        const signals: SignalCn0[] = [];
        let bestCn0 = 0;
        for (const sig of obs.signals) {
          if (sig.cn0 !== undefined && sig.cn0 > 0) {
            signals.push({ code: sig.rinexCode, cn0: sig.cn0 });
            if (sig.cn0 > bestCn0) bestCn0 = sig.cn0;
          }
        }
        if (signals.length > 0) {
          stats.satellites.set(obs.prn, {
            prn: obs.prn,
            system: obs.system,
            cn0: bestCn0,
            lastSeen: now2,
            signals,
          });
        }
        // Track obs types
        let sysSet = stats.obsTypes[obs.system];
        if (!sysSet) {
          sysSet = new Set();
          stats.obsTypes[obs.system] = sysSet;
        }
        for (const sig of obs.signals) {
          if (sig.pseudorange !== undefined) sysSet.add(`C${sig.rinexCode}`);
          if (sig.phase !== undefined) sysSet.add(`L${sig.rinexCode}`);
          if (sig.doppler !== undefined) sysSet.add(`D${sig.rinexCode}`);
          if (sig.cn0 !== undefined) sysSet.add(`S${sig.rinexCode}`);
        }
      }
    }

    // Decode ephemeris
    const eph = decodeEphemeris(frame);
    if (eph) {
      stats.ephemerides.set(eph.prn, eph);
    }

    // Decode station metadata (1005/1006/1007/1008/1029/1033)
    updateStationMeta(stats.stationMeta, frame);
  }

  // Remove stale satellites (not seen in 30s)
  for (const [prn, sat] of stats.satellites) {
    if (now - sat.lastSeen > 30_000) stats.satellites.delete(prn);
  }

  const elapsed = (now - stats.startTime) / 1000;
  if (elapsed > 0) {
    stats.bytesPerSecond = stats.totalBytes / elapsed;
    stats.framesPerSecond = stats.totalFrames / elapsed;
  }
}
