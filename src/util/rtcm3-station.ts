/**
 * RTCM3 station metadata decoders (messages 1005/1006, 1007/1008, 1029, 1033).
 */

import { BitReader } from './rtcm3-decoder';
import type { Rtcm3Frame } from './rtcm3-decoder';
import { readString } from './rtcm3-ephemeris';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface StationMeta {
  stationId: number | null;
  itrf: number | null;           // ITRF realization year
  position: [number, number, number] | null;  // ECEF [x,y,z] meters
  antennaHeight: number | null;  // meters (from 1006)
  antennaType: string | null;    // from 1008/1033
  antennaSerial: string | null;  // from 1008/1033
  antennaSetupId: number | null; // from 1007/1008/1033
  receiverType: string | null;   // from 1033
  receiverFirmware: string | null; // from 1033
  receiverSerial: string | null; // from 1033
  description: string | null;    // from 1029 (Unicode text)
}

export function createStationMeta(): StationMeta {
  return {
    stationId: null, itrf: null, position: null, antennaHeight: null,
    antennaType: null, antennaSerial: null, antennaSetupId: null,
    receiverType: null, receiverFirmware: null, receiverSerial: null,
    description: null,
  };
}

/* ================================================================== */
/*  Decoders                                                           */
/* ================================================================== */

/** Decode station position + ID from message 1005 or 1006. */
function decodeStationARP(payload: Uint8Array, msgType: number, meta: StationMeta): void {
  if (payload.length < 19) return;
  const r = new BitReader(payload);
  r.skip(12);                          // message type
  meta.stationId = r.readU(12);
  meta.itrf = r.readU(6);
  r.skip(4);                           // GPS/GLO/GAL/ref station indicators
  const x = r.readS(38) * 0.0001;
  r.skip(1);                           // single receiver oscillator
  r.skip(1);                           // reserved
  const y = r.readS(38) * 0.0001;
  r.skip(2);                           // quarter cycle indicator + reserved
  const z = r.readS(38) * 0.0001;
  if (x !== 0 || y !== 0 || z !== 0) {
    meta.position = [x, y, z];
  }
  // 1006 adds antenna height
  if (msgType === 1006) {
    meta.antennaHeight = r.readU(16) * 0.0001;
  }
}

/** Decode antenna descriptor from message 1007 or 1008. */
function decodeAntennaDescriptor(payload: Uint8Array, msgType: number, meta: StationMeta): void {
  if (payload.length < 5) return;
  const r = new BitReader(payload);
  r.skip(12);                          // message type
  meta.stationId = r.readU(12);
  const descLen = r.readU(8);
  if (descLen > 0 && descLen <= 31) {
    meta.antennaType = readString(r, descLen);
  }
  meta.antennaSetupId = r.readU(8);
  // 1008 adds serial number
  if (msgType === 1008) {
    const serialLen = r.readU(8);
    if (serialLen > 0 && serialLen <= 31) {
      meta.antennaSerial = readString(r, serialLen);
    }
  }
}

/** Decode receiver + antenna descriptor from message 1033. */
function decodeReceiverAntennaDescriptor(payload: Uint8Array, meta: StationMeta): void {
  if (payload.length < 8) return;
  const r = new BitReader(payload);
  r.skip(12);                          // message type
  meta.stationId = r.readU(12);
  // Antenna descriptor
  const antDescLen = r.readU(8);
  if (antDescLen > 0 && antDescLen <= 31) {
    meta.antennaType = readString(r, antDescLen);
  } else {
    r.skip(antDescLen * 8);
  }
  meta.antennaSetupId = r.readU(8);
  // Antenna serial
  const antSerLen = r.readU(8);
  if (antSerLen > 0 && antSerLen <= 31) {
    meta.antennaSerial = readString(r, antSerLen);
  } else {
    r.skip(antSerLen * 8);
  }
  // Receiver type
  const rcvTypeLen = r.readU(8);
  if (rcvTypeLen > 0 && rcvTypeLen <= 31) {
    meta.receiverType = readString(r, rcvTypeLen);
  } else {
    r.skip(rcvTypeLen * 8);
  }
  // Receiver firmware
  const rcvFwLen = r.readU(8);
  if (rcvFwLen > 0 && rcvFwLen <= 31) {
    meta.receiverFirmware = readString(r, rcvFwLen);
  } else {
    r.skip(rcvFwLen * 8);
  }
  // Receiver serial
  const rcvSerLen = r.readU(8);
  if (rcvSerLen > 0 && rcvSerLen <= 31) {
    meta.receiverSerial = readString(r, rcvSerLen);
  } else {
    r.skip(rcvSerLen * 8);
  }
}

/** Decode Unicode text string from message 1029. */
function decodeTextString(payload: Uint8Array, meta: StationMeta): void {
  if (payload.length < 6) return;
  const r = new BitReader(payload);
  r.skip(12);                          // message type
  meta.stationId = r.readU(12);
  r.skip(16);                          // modified Julian day
  r.skip(17);                          // seconds of day
  r.skip(7);                           // number of UTF-8 characters
  const nBytes = r.readU(8);
  if (nBytes > 0 && nBytes <= 127) {
    const bytes: number[] = [];
    for (let i = 0; i < nBytes; i++) bytes.push(r.readU(8));
    try {
      meta.description = new TextDecoder('utf-8').decode(new Uint8Array(bytes)).trim();
    } catch {
      meta.description = String.fromCharCode(...bytes).trim();
    }
  }
}

/** Update station metadata from an RTCM3 frame. Returns true if the frame was a metadata message. */
export function updateStationMeta(meta: StationMeta, frame: Rtcm3Frame): boolean {
  try {
    switch (frame.messageType) {
      case 1005:
      case 1006:
        decodeStationARP(frame.payload, frame.messageType, meta);
        return true;
      case 1007:
      case 1008:
        decodeAntennaDescriptor(frame.payload, frame.messageType, meta);
        return true;
      case 1033:
        decodeReceiverAntennaDescriptor(frame.payload, meta);
        return true;
      case 1029:
        decodeTextString(frame.payload, meta);
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
