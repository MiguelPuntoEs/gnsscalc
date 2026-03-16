/**
 * RTCM3 frame decoder with CRC-24Q validation and bit-level payload reader.
 */

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/** Decoded RTCM3 frame header (we only parse the message type, not full content). */
export interface Rtcm3Frame {
  messageType: number;
  length: number;
  payload: Uint8Array;
}

/* ================================================================== */
/*  BitReader                                                          */
/* ================================================================== */

/** Simple bit reader for parsing RTCM3 payloads at bit level. */
export class BitReader {
  private data: Uint8Array;
  private bitPos = 0;

  constructor(data: Uint8Array) { this.data = data; }

  /** Read `n` bits as unsigned integer (max 32). */
  readU(n: number): number {
    if (n === 0) return 0;
    let val = 0;
    for (let i = 0; i < n; i++) {
      const byteIdx = (this.bitPos + i) >> 3;
      const bitIdx = 7 - ((this.bitPos + i) & 7);
      if (byteIdx < this.data.length) {
        val = (val << 1) | ((this.data[byteIdx]! >> bitIdx) & 1);
      } else {
        val <<= 1;
      }
    }
    this.bitPos += n;
    return val >>> 0;
  }

  /** Read `n` bits as signed (two's complement) integer. */
  readS(n: number): number {
    const val = this.readU(n);
    const half = 2 ** (n - 1);
    return val >= half ? val - 2 ** n : val;
  }

  /** Read `n` bits as sign-magnitude integer (MSB = sign, rest = magnitude). */
  readSM(n: number): number {
    const val = this.readU(n);
    const sign = val >> (n - 1);
    const mag = val & ((1 << (n - 1)) - 1);
    return sign ? -mag : mag;
  }

  /** Skip `n` bits. */
  skip(n: number): void { this.bitPos += n; }

  get bitsLeft(): number { return this.data.length * 8 - this.bitPos; }
}

/* ================================================================== */
/*  CRC-24Q                                                            */
/* ================================================================== */

/** Compute CRC-24Q over `length` bytes of `data`. Polynomial: 0x1864CFB. */
function crc24q(data: Uint8Array, length: number): number {
  let crc = 0;
  for (let i = 0; i < length; i++) {
    crc ^= data[i]! << 16;
    for (let j = 0; j < 8; j++) {
      crc <<= 1;
      if (crc & 0x1000000) crc ^= 0x1864CFB;
    }
  }
  return crc & 0xFFFFFF;
}

/* ================================================================== */
/*  Rtcm3Decoder                                                       */
/* ================================================================== */

/**
 * Streaming RTCM3 frame decoder.
 *
 * RTCM3 frames: [0xD3] [6 reserved bits + 10 bit length] [payload] [3 byte CRC-24Q]
 * Total frame = 3 (header) + length + 3 (CRC) = length + 6
 */
export class Rtcm3Decoder {
  private buffer = new Uint8Array(0);

  /** Feed raw bytes and extract any complete RTCM3 frames. */
  decode(data: Uint8Array): Rtcm3Frame[] {
    // Append new data to buffer
    const combined = new Uint8Array(this.buffer.length + data.length);
    combined.set(this.buffer);
    combined.set(data, this.buffer.length);
    this.buffer = combined;

    const frames: Rtcm3Frame[] = [];

    while (this.buffer.length >= 6) {
      // Find sync byte 0xD3
      const syncIdx = this.buffer.indexOf(0xD3);
      if (syncIdx === -1) {
        this.buffer = new Uint8Array(0);
        break;
      }
      if (syncIdx > 0) {
        this.buffer = this.buffer.slice(syncIdx);
      }

      if (this.buffer.length < 3) break;

      // Length: 6 reserved bits (must be 0) + 10-bit message length
      const reservedBits = (this.buffer[1]! >> 2) & 0x3F;
      if (reservedBits !== 0) {
        // Not a valid frame — skip this byte
        this.buffer = this.buffer.slice(1);
        continue;
      }

      const length = ((this.buffer[1]! & 0x03) << 8) | this.buffer[2]!;

      if (length > 1023) {
        // Invalid length — skip this sync byte
        this.buffer = this.buffer.slice(1);
        continue;
      }

      const frameSize = 3 + length + 3; // header + payload + CRC
      if (this.buffer.length < frameSize) break; // need more data

      // CRC-24Q validation: compute over header + payload, compare with trailing 3 bytes
      const crcComputed = crc24q(this.buffer, 3 + length);
      const crcReceived =
        (this.buffer[3 + length]! << 16) |
        (this.buffer[3 + length + 1]! << 8) |
        this.buffer[3 + length + 2]!;
      if (crcComputed !== crcReceived) {
        // CRC mismatch — not a valid frame, skip this sync byte and keep searching
        this.buffer = this.buffer.slice(1);
        continue;
      }

      const payload = this.buffer.slice(3, 3 + length);

      // Extract message type from first 12 bits of payload
      if (length >= 2) {
        const messageType = (payload[0]! << 4) | (payload[1]! >> 4);
        frames.push({ messageType, length, payload });
      }

      this.buffer = this.buffer.slice(frameSize);
    }

    // Prevent buffer from growing unbounded — find the next sync byte and truncate
    if (this.buffer.length > 16384) {
      const nextSync = this.buffer.indexOf(0xD3, 1);
      this.buffer = nextSync !== -1
        ? this.buffer.slice(nextSync)
        : new Uint8Array(0);
    }

    return frames;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }
}
