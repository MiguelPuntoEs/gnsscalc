import { describe, it, expect } from 'vitest';
import { parseSourcetable } from 'gnss-js/ntrip';
import { Rtcm3Decoder } from 'gnss-js/rtcm3';

describe('parseSourcetable', () => {
  it('parses STR entries', () => {
    const text =
      'STR;FFMJ2;Frankfurt;RTCM 2.0;1(1),3(19),16(59);0;GPS;GREF;GER;50.12;8.68;0;1;GPSNet V1.9;none;N;N;560;Demo\nENDSOURCETABLE';
    const st = parseSourcetable(text);
    expect(st.streams).toHaveLength(1);
    expect(st.streams[0]!.mountpoint).toBe('FFMJ2');
    expect(st.streams[0]!.identifier).toBe('Frankfurt');
    expect(st.streams[0]!.format).toBe('RTCM 2.0');
    expect(st.streams[0]!.navSystem).toBe('GPS');
    expect(st.streams[0]!.country).toBe('GER');
    expect(st.streams[0]!.latitude).toBeCloseTo(50.12);
    expect(st.streams[0]!.longitude).toBeCloseTo(8.68);
    expect(st.streams[0]!.bitrate).toBe(560);
    expect(st.streams[0]!.authentication).toBe('N');
    expect(st.streams[0]!.solution).toBe(1);
  });

  it('parses CAS entries', () => {
    const text =
      'CAS;129.217.182.51;80;EUREF;BKG;0;GER;51.5;7.5;;0;Trial Broadcaster\nENDSOURCETABLE';
    const st = parseSourcetable(text);
    expect(st.casters).toHaveLength(1);
    expect(st.casters[0]!.host).toBe('129.217.182.51');
    expect(st.casters[0]!.port).toBe(80);
    expect(st.casters[0]!.identifier).toBe('EUREF');
    expect(st.casters[0]!.operator).toBe('BKG');
    expect(st.casters[0]!.country).toBe('GER');
  });

  it('parses NET entries', () => {
    const text =
      'NET;GREF;BKG;B;N;http://gref-ip.de/home.html;none;peter@bkg.bund.de;none\nENDSOURCETABLE';
    const st = parseSourcetable(text);
    expect(st.networks).toHaveLength(1);
    expect(st.networks[0]!.identifier).toBe('GREF');
    expect(st.networks[0]!.operator).toBe('BKG');
    expect(st.networks[0]!.authentication).toBe('B');
  });

  it('parses mixed sourcetable', () => {
    const text = [
      'CAS;caster.example.com;2101;Test;Org;0;USA;40.0;-74.0;;0;',
      'NET;TestNet;TestOrg;B;N;http://example.com;none;test@test.com;none',
      'STR;MOUNT1;Station1;RTCM 3.2;1077(1);2;GPS+GLO;TestNet;USA;40.1;-74.1;1;0;Trimble;none;B;N;5000;Test',
      'STR;MOUNT2;Station2;RTCM 3.3;1077(1),1087(1);2;GPS+GLO+GAL;TestNet;USA;41.0;-73.5;1;1;Leica;none;B;N;8000;RTK',
      'ENDSOURCETABLE',
    ].join('\n');
    const st = parseSourcetable(text);
    expect(st.casters).toHaveLength(1);
    expect(st.networks).toHaveLength(1);
    expect(st.streams).toHaveLength(2);
    expect(st.streams[0]!.mountpoint).toBe('MOUNT1');
    expect(st.streams[1]!.mountpoint).toBe('MOUNT2');
  });

  it('handles empty sourcetable', () => {
    const st = parseSourcetable('ENDSOURCETABLE');
    expect(st.streams).toHaveLength(0);
    expect(st.casters).toHaveLength(0);
    expect(st.networks).toHaveLength(0);
  });
});

describe('Rtcm3Decoder', () => {
  function crc24q(data: Uint8Array, length: number): number {
    let crc = 0;
    for (let i = 0; i < length; i++) {
      crc ^= data[i]! << 16;
      for (let j = 0; j < 8; j++) {
        crc <<= 1;
        if (crc & 0x1000000) crc ^= 0x1864cfb;
      }
    }
    return crc & 0xffffff;
  }

  function buildRtcm3Frame(
    messageType: number,
    payloadSize: number,
  ): Uint8Array {
    const length = payloadSize;
    const frame = new Uint8Array(3 + length + 3);
    // Sync byte
    frame[0] = 0xd3;
    // Reserved (6 bits = 0) + length (10 bits)
    frame[1] = (length >> 8) & 0x03;
    frame[2] = length & 0xff;
    // First 12 bits of payload = message type
    if (length >= 2) {
      frame[3] = (messageType >> 4) & 0xff;
      frame[4] = (messageType & 0x0f) << 4;
    }
    // Compute valid CRC-24Q over header + payload
    const crc = crc24q(frame, 3 + length);
    frame[3 + length] = (crc >> 16) & 0xff;
    frame[3 + length + 1] = (crc >> 8) & 0xff;
    frame[3 + length + 2] = crc & 0xff;
    return frame;
  }

  it('decodes a single RTCM3 frame', () => {
    const decoder = new Rtcm3Decoder();
    const frame = buildRtcm3Frame(1077, 50);
    const result = decoder.decode(frame);
    expect(result).toHaveLength(1);
    expect(result[0]!.messageType).toBe(1077);
    expect(result[0]!.length).toBe(50);
  });

  it('decodes multiple frames in one chunk', () => {
    const decoder = new Rtcm3Decoder();
    const frame1 = buildRtcm3Frame(1077, 30);
    const frame2 = buildRtcm3Frame(1087, 40);
    const combined = new Uint8Array(frame1.length + frame2.length);
    combined.set(frame1, 0);
    combined.set(frame2, frame1.length);
    const result = decoder.decode(combined);
    expect(result).toHaveLength(2);
    expect(result[0]!.messageType).toBe(1077);
    expect(result[1]!.messageType).toBe(1087);
  });

  it('handles frames split across chunks', () => {
    const decoder = new Rtcm3Decoder();
    const frame = buildRtcm3Frame(1005, 20);
    // Split in the middle
    const part1 = frame.slice(0, 10);
    const part2 = frame.slice(10);
    expect(decoder.decode(part1)).toHaveLength(0);
    const result = decoder.decode(part2);
    expect(result).toHaveLength(1);
    expect(result[0]!.messageType).toBe(1005);
  });

  it('skips garbage before sync byte', () => {
    const decoder = new Rtcm3Decoder();
    const frame = buildRtcm3Frame(1097, 25);
    const withGarbage = new Uint8Array(5 + frame.length);
    withGarbage.set([0x00, 0xff, 0xaa, 0xbb, 0xcc], 0);
    withGarbage.set(frame, 5);
    const result = decoder.decode(withGarbage);
    expect(result).toHaveLength(1);
    expect(result[0]!.messageType).toBe(1097);
  });

  it('resets state', () => {
    const decoder = new Rtcm3Decoder();
    // Feed partial frame
    const frame = buildRtcm3Frame(1005, 20);
    decoder.decode(frame.slice(0, 5));
    decoder.reset();
    // After reset, partial should be gone
    const result = decoder.decode(frame.slice(5));
    expect(result).toHaveLength(0);
  });
});
