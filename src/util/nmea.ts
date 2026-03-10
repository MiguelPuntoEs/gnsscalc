// ── NMEA sentence parser ─────────────────────────────────
// Parses GGA and RMC sentences from NMEA 0183 log files.

export interface NmeaFix {
  time: Date | null;
  lat: number;
  lon: number;
  alt: number | null;
  satellites: number | null;
  fixQuality: number;
  speed: number | null;  // knots
  course: number | null; // degrees true
}

export interface NmeaStats {
  totalFixes: number;
  validFixes: number;
  duration: number | null;
  startTime: Date | null;
  endTime: Date | null;
  totalDistance: number | null;  // metres (sum of consecutive fix distances)
  maxSpeed: number | null;      // km/h
  cep: number | null;           // Circular Error Probable — 50th percentile horizontal radius (m)
  drms2: number | null;         // 2DRMS — ~95th percentile horizontal radius (m)
  hRms: number | null;          // horizontal RMS (m)
  vRms: number | null;          // vertical RMS (m)
  avgSatellites: number | null;
}

export interface NmeaTrack {
  fixes: NmeaFix[];
  stats: NmeaStats;
}

/** Convert NMEA latitude/longitude (ddmm.mmmm / dddmm.mmmm) to decimal degrees. */
export function nmeaCoordToDecimal(raw: string, direction: string): number {
  if (!raw || !direction) return NaN;
  // Latitude: first 2 digits are degrees; Longitude: first 3 digits are degrees
  const isLon = direction === 'E' || direction === 'W';
  const degLen = isLon ? 3 : 2;
  const degrees = parseInt(raw.substring(0, degLen), 10);
  const minutes = parseFloat(raw.substring(degLen));
  const decimal = degrees + minutes / 60;
  return direction === 'S' || direction === 'W' ? -decimal : decimal;
}

/** Verify XOR checksum between '$' and '*'. */
export function verifyChecksum(sentence: string): boolean {
  const starIdx = sentence.indexOf('*');
  if (starIdx === -1) return false; // no checksum present
  const body = sentence.substring(sentence.indexOf('$') + 1, starIdx);
  let xor = 0;
  for (let i = 0; i < body.length; i++) xor ^= body.charCodeAt(i);
  const expected = parseInt(sentence.substring(starIdx + 1, starIdx + 3), 16);
  return xor === expected;
}

/** Build a Date from NMEA time (HHMMSS.ss) and optional date (DDMMYY) fields. */
function buildDate(timeStr: string, dateStr?: string): Date | null {
  if (!timeStr || timeStr.length < 6) return null;
  const h = parseInt(timeStr.substring(0, 2), 10);
  const m = parseInt(timeStr.substring(2, 4), 10);
  const s = parseFloat(timeStr.substring(4));
  if (isNaN(h) || isNaN(m) || isNaN(s)) return null;

  let year = 2000, month = 0, day = 1;
  if (dateStr && dateStr.length >= 6) {
    day = parseInt(dateStr.substring(0, 2), 10);
    month = parseInt(dateStr.substring(2, 4), 10) - 1;
    const yy = parseInt(dateStr.substring(4, 6), 10);
    year = yy < 80 ? 2000 + yy : 1900 + yy;
  }

  const ms = Math.round((s % 1) * 1000);
  return new Date(Date.UTC(year, month, day, h, m, Math.floor(s), ms));
}

interface PartialFix {
  time: Date | null;
  timeKey: string;
  lat?: number;
  lon?: number;
  alt?: number | null;
  satellites?: number | null;
  fixQuality?: number;
  speed?: number | null;
  course?: number | null;
  hasDate?: boolean;
}

function parseGGA(fields: string[]): PartialFix | null {
  // $xxGGA,time,lat,N/S,lon,E/W,quality,numSV,hdop,alt,M,sep,M,diffAge,diffStation*cs
  if (fields.length < 10) return null;
  const quality = parseInt(fields[6], 10);
  if (isNaN(quality) || quality === 0) return null;

  const lat = nmeaCoordToDecimal(fields[2], fields[3]);
  const lon = nmeaCoordToDecimal(fields[4], fields[5]);
  if (isNaN(lat) || isNaN(lon)) return null;

  return {
    time: buildDate(fields[1]),
    timeKey: fields[1],
    lat,
    lon,
    alt: fields[9] ? parseFloat(fields[9]) : null,
    satellites: fields[7] ? parseInt(fields[7], 10) : null,
    fixQuality: quality,
  };
}

function parseRMC(fields: string[]): PartialFix | null {
  // $xxRMC,time,status,lat,N/S,lon,E/W,speed,course,date,magVar,magDir,mode*cs
  if (fields.length < 10) return null;
  if (fields[2] !== 'A') return null; // V = void / invalid

  const lat = nmeaCoordToDecimal(fields[3], fields[4]);
  const lon = nmeaCoordToDecimal(fields[5], fields[6]);
  if (isNaN(lat) || isNaN(lon)) return null;

  return {
    time: buildDate(fields[1], fields[9]),
    timeKey: fields[1],
    lat,
    lon,
    speed: fields[7] ? parseFloat(fields[7]) : null,
    course: fields[8] ? parseFloat(fields[8]) : null,
    hasDate: true,
  };
}

export function computeStats(fixes: NmeaFix[]): NmeaStats {
  const valid = fixes.filter(f => f.fixQuality > 0);
  const withTime = valid.filter(f => f.time !== null) as (NmeaFix & { time: Date })[];
  const withSat = valid.filter(f => f.satellites !== null).map(f => f.satellites!);

  // Time span
  let startTime: Date | null = null;
  let endTime: Date | null = null;
  let duration: number | null = null;
  if (withTime.length >= 2) {
    startTime = withTime[0].time;
    endTime = withTime[withTime.length - 1].time;
    duration = (endTime.getTime() - startTime.getTime()) / 1000;
  } else if (withTime.length === 1) {
    startTime = endTime = withTime[0].time;
  }

  // Total distance (sum of haversine segments between consecutive fixes)
  let totalDistance: number | null = null;
  if (valid.length >= 2) {
    let dist = 0;
    for (let i = 1; i < valid.length; i++) {
      const prev = valid[i - 1]!, curr = valid[i]!;
      dist += haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    }
    totalDistance = dist;
  }

  // Max speed
  const speeds = valid.filter(f => f.speed !== null).map(f => f.speed! * 1.852); // knots → km/h
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;

  // Precision metrics (CEP, 2DRMS, hRMS, vRMS) using ENU from mean position
  let cep: number | null = null;
  let drms2: number | null = null;
  let hRms: number | null = null;
  let vRms: number | null = null;

  if (valid.length >= 2) {
    const toRad = (d: number) => d * Math.PI / 180;

    // Convert all fixes to ECEF
    const R = 6378137.0; // WGS84 semi-major axis
    const e2 = 0.00669437999014;
    const ecef = valid.map(f => {
      const lat = toRad(f.lat), lon = toRad(f.lon), h = f.alt ?? 0;
      const N = R / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
      return [
        (N + h) * Math.cos(lat) * Math.cos(lon),
        (N + h) * Math.cos(lat) * Math.sin(lon),
        ((1 - e2) * N + h) * Math.sin(lat),
      ] as [number, number, number];
    });

    // Mean ECEF
    const n = ecef.length;
    const mx = ecef.reduce((s, p) => s + p[0], 0) / n;
    const my = ecef.reduce((s, p) => s + p[1], 0) / n;
    const mz = ecef.reduce((s, p) => s + p[2], 0) / n;

    // Reference lat/lon for ENU rotation
    const refLon = Math.atan2(my, mx);
    const refP = Math.sqrt(mx * mx + my * my);
    const refLat = Math.atan2(mz, refP * (1 - e2)); // approximate

    // Compute ENU deltas
    const sinLat = Math.sin(refLat), cosLat = Math.cos(refLat);
    const sinLon = Math.sin(refLon), cosLon = Math.cos(refLon);

    const enu = ecef.map(p => {
      const dx = p[0] - mx, dy = p[1] - my, dz = p[2] - mz;
      return {
        e: -sinLon * dx + cosLon * dy,
        n: -cosLon * sinLat * dx - sinLon * sinLat * dy + cosLat * dz,
        u: cosLon * cosLat * dx + sinLon * cosLat * dy + sinLat * dz,
      };
    });

    // Horizontal distances from centroid
    const hDist = enu.map(p => Math.sqrt(p.e * p.e + p.n * p.n));
    hDist.sort((a, b) => a - b);

    // CEP = median horizontal distance (50th percentile)
    const medIdx = Math.floor(hDist.length * 0.5);
    cep = hDist[medIdx]!;

    // hRMS = sqrt(mean(e² + n²))
    const hSqSum = enu.reduce((s, p) => s + p.e * p.e + p.n * p.n, 0);
    hRms = Math.sqrt(hSqSum / n);

    // 2DRMS = 2 × hRMS
    drms2 = 2 * hRms;

    // vRMS = sqrt(mean(u²))
    const vSqSum = enu.reduce((s, p) => s + p.u * p.u, 0);
    vRms = Math.sqrt(vSqSum / n);
  }

  return {
    totalFixes: fixes.length,
    validFixes: valid.length,
    duration,
    startTime,
    endTime,
    totalDistance,
    maxSpeed,
    cep,
    drms2,
    hRms,
    vRms,
    avgSatellites: withSat.length > 0 ? withSat.reduce((a, b) => a + b, 0) / withSat.length : null,
  };
}

/** Fast haversine distance in metres between two points in decimal degrees. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Parse an NMEA log file and return a track with fixes and statistics. */
export function parseNmeaFile(content: string): NmeaTrack {
  const lines = content.split(/\r?\n/);
  const fixMap = new Map<string, NmeaFix>();
  const fixOrder: string[] = [];

  // Track the latest RMC date so GGA-only fixes can inherit it
  let lastDate: string | undefined;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('$')) continue;

    // Checksum validation (lenient: skip lines with bad checksum, accept lines without one)
    if (line.includes('*') && !verifyChecksum(line)) continue;

    const fields = line.split('*')[0].split(',');
    const sentenceId = fields[0].substring(3); // strip talker ID (e.g. $GP, $GN)

    let partial: PartialFix | null = null;
    if (sentenceId === 'GGA') partial = parseGGA(fields);
    else if (sentenceId === 'RMC') partial = parseRMC(fields);

    if (!partial) continue;

    // Use the time field as a key to merge GGA+RMC from the same epoch
    const key = partial.timeKey || `line-${fixOrder.length}`;

    if (partial.hasDate && partial.time) {
      // Extract date part from RMC for GGA-only fixes
      const d = partial.time;
      lastDate = `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCFullYear() % 100).padStart(2, '0')}`;
    }

    const existing = fixMap.get(key);
    if (existing) {
      // Merge: prefer non-null values from the new partial
      if (partial.alt !== undefined && partial.alt !== null) existing.alt = partial.alt;
      if (partial.satellites !== undefined && partial.satellites !== null) existing.satellites = partial.satellites;
      if (partial.fixQuality !== undefined) existing.fixQuality = partial.fixQuality;
      if (partial.speed !== undefined && partial.speed !== null) existing.speed = partial.speed;
      if (partial.course !== undefined && partial.course !== null) existing.course = partial.course;
      if (partial.hasDate && partial.time) existing.time = partial.time;
    } else {
      // Reconstruct GGA time with the last known date from RMC
      let time = partial.time;
      if (!partial.hasDate && time && lastDate) {
        time = buildDate(partial.timeKey, lastDate);
      }

      fixMap.set(key, {
        time,
        lat: partial.lat ?? 0,
        lon: partial.lon ?? 0,
        alt: partial.alt ?? null,
        satellites: partial.satellites ?? null,
        fixQuality: partial.fixQuality ?? 0,
        speed: partial.speed ?? null,
        course: partial.course ?? null,
      });
      fixOrder.push(key);
    }
  }

  const fixes = fixOrder.map(k => fixMap.get(k)!);
  return { fixes, stats: computeStats(fixes) };
}
