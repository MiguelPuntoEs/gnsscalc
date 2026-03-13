/**
 * Metadata JSON export.
 *
 * Extracts header info and summary statistics into a structured JSON.
 * Similar to GFZRNX -meta output.
 */

import type { RinexHeader, RinexStats } from './rinex';

export interface RinexMetadata {
  marker: {
    name: string;
    number: string;
  };
  receiver: {
    number: string;
    type: string;
    version: string;
  };
  antenna: {
    number: string;
    type: string;
    deltaHEN: [number, number, number];
  };
  approxPosition: {
    x: number;
    y: number;
    z: number;
  };
  observer: string;
  agency: string;
  version: number;
  obsTypes: Record<string, string[]>;
  timeOfFirstObs: string | null;
  timeOfLastObs: string | null;
  interval: number | null;
  systems: string[];
  statistics: {
    totalEpochs: number;
    duration: number | null;
    uniqueSatellites: number;
    uniqueSatsPerSystem: Record<string, number>;
    meanSatellites: number;
    meanSnr: number | null;
  };
}

export function buildMetadata(header: RinexHeader, stats: RinexStats): RinexMetadata {
  return {
    marker: {
      name: header.markerName || '',
      number: '',
    },
    receiver: {
      number: header.receiverNumber || '',
      type: header.receiverType || '',
      version: header.receiverVersion || '',
    },
    antenna: {
      number: header.antNumber || '',
      type: header.antType || '',
      deltaHEN: header.antDelta ?? [0, 0, 0],
    },
    approxPosition: {
      x: header.approxPosition?.[0] ?? 0,
      y: header.approxPosition?.[1] ?? 0,
      z: header.approxPosition?.[2] ?? 0,
    },
    observer: header.observer || '',
    agency: header.agency || '',
    version: header.version,
    obsTypes: header.obsTypes,
    timeOfFirstObs: stats.startTime?.toISOString() ?? null,
    timeOfLastObs: stats.endTime?.toISOString() ?? null,
    interval: stats.interval,
    systems: stats.systems,
    statistics: {
      totalEpochs: stats.totalEpochs,
      duration: stats.duration,
      uniqueSatellites: stats.uniqueSatellites,
      uniqueSatsPerSystem: stats.uniqueSatsPerSystem,
      meanSatellites: stats.meanSatellites,
      meanSnr: stats.meanSnr,
    },
  };
}

export function writeMetadataJson(header: RinexHeader, stats: RinexStats): string {
  return JSON.stringify(buildMetadata(header, stats), null, 2);
}
