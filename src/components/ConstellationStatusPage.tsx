import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { EphemerisInfo } from '../util/rtcm3-ephemeris';
import { CONSTELLATION_COLORS } from '../util/gnss-constants';

/* ── Constants ────────────────────────────────────────────────── */

const API_URL = '/api/constellation-status';
const POLL_INTERVAL = 30_000;
const USE_MOCK = false; // flip to false for live data

const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
const BDS_EPOCH_MS = Date.UTC(2006, 0, 1);

const CONSTELLATION_SLOTS: Record<string, { prefix: string; min: number; max: number; padWidth: number; label: string }> = {
  G: { prefix: 'G', min: 1, max: 32, padWidth: 2, label: 'GPS' },
  E: { prefix: 'E', min: 1, max: 36, padWidth: 2, label: 'Galileo' },
  R: { prefix: 'R', min: 1, max: 28, padWidth: 2, label: 'GLONASS' },
  C: { prefix: 'C', min: 1, max: 63, padWidth: 2, label: 'BeiDou' },
  J: { prefix: 'J', min: 1, max: 10, padWidth: 2, label: 'QZSS' },
  S: { prefix: 'S', min: 120, max: 158, padWidth: 3, label: 'SBAS' },
};

const SYSTEM_ORDER = ['G', 'E', 'R', 'C', 'J', 'S'] as const;

interface StatusData {
  updatedAt: number;
  satellites: Record<string, EphemerisInfo>;
}

/* ── Mock data ────────────────────────────────────────────────── */

function generateMockData(): StatusData {
  const satellites: Record<string, EphemerisInfo> = {};
  const now = Date.now();

  // GPS: all 32 healthy
  for (let i = 1; i <= 32; i++) {
    const prn = `G${String(i).padStart(2, '0')}`;
    satellites[prn] = {
      prn, constellation: 'GPS', health: 0, lastReceived: now, messageType: 1019,
      week: 2356, toe: 7200 * Math.floor(Math.random() * 12), toc: 7200 * Math.floor(Math.random() * 12),
      sqrtA: 5153.6 + Math.random() * 0.5, eccentricity: 0.005 + Math.random() * 0.015,
      inclination: 0.96 + Math.random() * 0.02, omega0: Math.random() * Math.PI * 2 - Math.PI,
      omegaDot: -8.0e-9, argPerigee: Math.random() * Math.PI * 2 - Math.PI,
      meanAnomaly: Math.random() * Math.PI * 2 - Math.PI, deltaN: 4.5e-9,
      idot: -2e-10, crs: Math.random() * 40 - 20, crc: Math.random() * 300,
      cuc: Math.random() * 1e-6, cus: Math.random() * 1e-5,
      cic: Math.random() * 1e-7, cis: Math.random() * 1e-7,
      af0: Math.random() * 1e-4 - 5e-5, af1: Math.random() * 1e-11, af2: 0,
      ura: 2, iode: Math.floor(Math.random() * 255),
    };
  }

  // Galileo: 28 healthy, 4 unhealthy
  const galUnhealthy = new Set([14, 18, 28, 32]);
  for (const id of [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19,21,23,25,26,27,28,29,30,31,32,33,34,36]) {
    const prn = `E${String(id).padStart(2, '0')}`;
    satellites[prn] = {
      prn, constellation: 'Galileo', health: galUnhealthy.has(id) ? (id === 28 || id === 32 ? 3 : 1) : 0,
      lastReceived: now, messageType: 1046, week: 1356,
      toe: 600 * Math.floor(Math.random() * 144), toc: 600 * Math.floor(Math.random() * 144),
      sqrtA: 5440.5 + Math.random() * 0.3, eccentricity: 0.0002 + Math.random() * 0.001,
      inclination: 0.977 + Math.random() * 0.01, omega0: Math.random() * Math.PI * 2 - Math.PI,
      omegaDot: -5.4e-9, argPerigee: Math.random() * Math.PI * 2 - Math.PI,
      meanAnomaly: Math.random() * Math.PI * 2 - Math.PI, deltaN: 3.1e-9,
      idot: -1.5e-10, crs: Math.random() * 20 - 10, crc: Math.random() * 200,
      cuc: Math.random() * 5e-7, cus: Math.random() * 5e-6,
      cic: Math.random() * 5e-8, cis: Math.random() * 5e-8,
      af0: Math.random() * 1e-5, af1: Math.random() * 1e-12, af2: 0,
      ura: 3, iode: Math.floor(Math.random() * 1023),
    };
  }

  // GLONASS: 24 healthy, 3 unhealthy
  const gloUnhealthy = new Set([20, 26, 27]);
  for (let i = 1; i <= 27; i++) {
    const prn = `R${String(i).padStart(2, '0')}`;
    satellites[prn] = {
      prn, constellation: 'GLONASS', health: gloUnhealthy.has(i) ? 1 : 0,
      lastReceived: now, messageType: 1020,
      freqChannel: (i % 14) - 7, tb: Math.floor(Math.random() * 96),
      x: 10000 + Math.random() * 15000, y: -10000 + Math.random() * 20000, z: Math.random() * 20000 - 10000,
      vx: Math.random() * 4 - 2, vy: Math.random() * 4 - 2, vz: Math.random() * 4 - 2,
      ax: 0, ay: 0, az: 0,
      af0: Math.random() * 1e-4, gammaN: Math.random() * 1e-10,
    };
  }

  // BeiDou: 48 healthy
  for (const id of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,16,19,20,21,22,23,24,25,26,27,28,29,30,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,56,59]) {
    const prn = `C${String(id).padStart(2, '0')}`;
    satellites[prn] = {
      prn, constellation: 'BeiDou', health: 0, lastReceived: now, messageType: 1042,
      week: 956, toe: 3600 * Math.floor(Math.random() * 24), toc: 3600 * Math.floor(Math.random() * 24),
      sqrtA: id <= 5 ? 6493.5 : 5282.6 + Math.random() * 0.3,
      eccentricity: 0.001 + Math.random() * 0.01,
      inclination: id <= 5 ? 0.0087 : 0.96 + Math.random() * 0.02,
      omega0: Math.random() * Math.PI * 2 - Math.PI, omegaDot: -6e-9,
      argPerigee: Math.random() * Math.PI * 2 - Math.PI,
      meanAnomaly: Math.random() * Math.PI * 2 - Math.PI, deltaN: 4e-9,
      idot: -1e-10, crs: Math.random() * 30, crc: Math.random() * 250,
      cuc: 0, cus: 0, cic: 0, cis: 0,
      af0: Math.random() * 1e-5, af1: Math.random() * 1e-12, af2: 0,
      ura: 2, iode: Math.floor(Math.random() * 255),
    };
  }

  // SBAS: 20 satellites
  for (const id of [121,122,123,125,127,128,129,130,131,132,133,134,135,136,137,139,140,141,142,143]) {
    const prn = `S${String(id).padStart(3, '0')}`;
    satellites[prn] = {
      prn, constellation: 'SBAS', health: 0, lastReceived: now, messageType: 1043,
      toc: Math.floor(Math.random() * 86400), ura: 3, iode: Math.floor(Math.random() * 255),
      x: 36000 + Math.random() * 6000, y: Math.random() * 40000 - 20000, z: Math.random() * 4000 - 2000,
      vx: 0.001 * Math.random(), vy: 0.001 * Math.random(), vz: 0.001 * Math.random(),
      ax: 0, ay: 0, az: 0,
      af0: Math.random() * 1e-7, af1: Math.random() * 1e-11,
    };
  }

  return { updatedAt: now, satellites };
}

/* ── Helpers ──────────────────────────────────────────────────── */

function formatAge(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${(seconds / 3600).toFixed(1)}h ago`;
}

function ephDate(eph: EphemerisInfo): Date | null {
  const sys = eph.prn.charAt(0);
  if (sys === 'R' && eph.tb !== undefined) {
    const now = new Date(eph.lastReceived);
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return new Date(utcMidnight + (eph.tb * 900 - 3 * 3600) * 1000);
  }
  if (sys === 'S' && eph.toc !== undefined) {
    const now = new Date(eph.lastReceived);
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return new Date(utcMidnight + eph.toc * 1000);
  }
  if (eph.week !== undefined && eph.toe !== undefined) {
    const epoch = sys === 'C' ? BDS_EPOCH_MS : GPS_EPOCH_MS;
    return new Date(epoch + eph.week * 7 * 86400_000 + eph.toe * 1000);
  }
  return null;
}

/**
 * Determine if a satellite is healthy based on constellation-specific rules.
 * QZSS: only the MSB (bit 5) indicates L1 health. Lower 5 bits indicate
 * per-signal availability (L1C/A, L2C, L5, L1C, L1C/B) — non-zero is normal.
 * See IS-QZSS-PNT-006 Table 4.1.2-5-1/5-2.
 */
function isSatHealthy(eph: EphemerisInfo): boolean {
  const sys = eph.prn.charAt(0);
  if (sys === 'J') return (eph.health & 0b100000) === 0; // MSB only
  return isSatHealthy(eph);
}

function formatEphTime(d: Date | null): string {
  if (!d) return '—';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function formatEphDateFull(d: Date | null): string {
  if (!d) return '—';
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function fmtSec(s: number | undefined): string {
  if (s === undefined) return '—';
  return `${s.toFixed(0)} s`;
}

function fmtSci(v: number | undefined, digits = 4): string {
  if (v === undefined) return '—';
  if (v === 0) return '0';
  return v.toExponential(digits);
}

function fmtDeg(rad: number | undefined): string {
  if (rad === undefined) return '—';
  return `${(rad * 180 / Math.PI).toFixed(6)}°`;
}

function fmtM(v: number | undefined): string {
  if (v === undefined) return '—';
  return `${v.toFixed(4)} m`;
}

/* ── Detail panel ─────────────────────────────────────────────── */

function EphemerisDetail({ eph, onClose }: { eph: EphemerisInfo; onClose: () => void }) {
  const sys = eph.prn.charAt(0);
  const isGlonass = sys === 'R';
  const isSbas = sys === 'S';
  const isStateVector = isGlonass || isSbas;
  const date = ephDate(eph);
  const color = CONSTELLATION_COLORS[sys] ?? '#7c8aff';

  return (
    <div className="rounded-lg border border-border bg-bg-raised/50 p-4 animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold font-mono" style={{ color }}>{eph.prn}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${isSatHealthy(eph) ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
            {isSatHealthy(eph) ? 'Healthy' : `Unhealthy (${eph.health})`}
          </span>
          <span className="text-xs text-fg/30">msg {eph.messageType}</span>
        </div>
        <button
          className="text-fg/30 hover:text-fg text-sm p-1 -m-1"
          onClick={onClose}
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      <div className="text-xs text-fg/50 mb-3">
        Ephemeris epoch: <span className="text-fg/70 font-mono">{formatEphDateFull(date)}</span>
      </div>

      {!isStateVector && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <FieldGroup label="Keplerian elements">
            <Field name="Week" value={eph.week !== undefined ? String(eph.week) : '—'} />
            <Field name="TOE" value={fmtSec(eph.toe)} />
            <Field name="TOC" value={fmtSec(eph.toc)} />
            <Field name="IODE" value={eph.iode !== undefined ? String(eph.iode) : '—'} />
            <Field name="√a" value={eph.sqrtA !== undefined ? `${eph.sqrtA.toFixed(4)} m^½` : '—'} />
            <Field name="e" value={fmtSci(eph.eccentricity)} />
            <Field name="i₀" value={fmtDeg(eph.inclination)} />
            <Field name="Ω₀" value={fmtDeg(eph.omega0)} />
            <Field name="Ω̇" value={eph.omegaDot !== undefined ? `${fmtSci(eph.omegaDot)} rad/s` : '—'} />
            <Field name="ω" value={fmtDeg(eph.argPerigee)} />
            <Field name="M₀" value={fmtDeg(eph.meanAnomaly)} />
            <Field name="Δn" value={eph.deltaN !== undefined ? `${fmtSci(eph.deltaN)} rad/s` : '—'} />
            <Field name="IDOT" value={eph.idot !== undefined ? `${fmtSci(eph.idot)} rad/s` : '—'} />
          </FieldGroup>

          <FieldGroup label="Perturbation corrections">
            <Field name="Crs" value={fmtM(eph.crs)} />
            <Field name="Crc" value={fmtM(eph.crc)} />
            <Field name="Cuc" value={eph.cuc !== undefined ? `${fmtSci(eph.cuc)} rad` : '—'} />
            <Field name="Cus" value={eph.cus !== undefined ? `${fmtSci(eph.cus)} rad` : '—'} />
            <Field name="Cic" value={eph.cic !== undefined ? `${fmtSci(eph.cic)} rad` : '—'} />
            <Field name="Cis" value={eph.cis !== undefined ? `${fmtSci(eph.cis)} rad` : '—'} />
          </FieldGroup>

          <FieldGroup label="Clock corrections">
            <Field name="af₀" value={eph.af0 !== undefined ? `${fmtSci(eph.af0)} s` : '—'} />
            <Field name="af₁" value={eph.af1 !== undefined ? `${fmtSci(eph.af1)} s/s` : '—'} />
            <Field name="af₂" value={eph.af2 !== undefined ? `${fmtSci(eph.af2)} s/s²` : '—'} />
            <Field name="URA/SISA" value={eph.ura !== undefined ? String(eph.ura) : '—'} />
            <Field name="Health" value={`${eph.health} (0x${eph.health.toString(16).toUpperCase()})`} />
            {eph.iodc !== undefined && <Field name="IODC" value={String(eph.iodc)} />}
            {eph.tgd !== undefined && <Field name="TGD" value={`${fmtSci(eph.tgd)} s`} />}
            {eph.l2Codes !== undefined && <Field name="L2 codes" value={String(eph.l2Codes)} />}
            {eph.l2PFlag !== undefined && <Field name="L2P flag" value={String(eph.l2PFlag)} />}
            {eph.fitInterval !== undefined && <Field name="Fit int." value={String(eph.fitInterval)} />}
          </FieldGroup>

          {/* Galileo-specific group delay */}
          {sys === 'E' && (
            <FieldGroup label="Group delay">
              {eph.bgdE5aE1 !== undefined && <Field name="BGD E5a/E1" value={`${fmtSci(eph.bgdE5aE1)} s`} />}
              {eph.bgdE5bE1 !== undefined && <Field name="BGD E5b/E1" value={`${fmtSci(eph.bgdE5bE1)} s`} />}
              {eph.e5aDataInvalid !== undefined && <Field name="E5a valid" value={eph.e5aDataInvalid === 0 ? 'Yes' : 'No'} />}
              {eph.e5bDataInvalid !== undefined && <Field name="E5b valid" value={eph.e5bDataInvalid === 0 ? 'Yes' : 'No'} />}
              {eph.e1bHealth !== undefined && <Field name="E1B health" value={String(eph.e1bHealth)} />}
              {eph.e1bDataInvalid !== undefined && <Field name="E1B valid" value={eph.e1bDataInvalid === 0 ? 'Yes' : 'No'} />}
            </FieldGroup>
          )}

          {/* BeiDou-specific */}
          {sys === 'C' && (
            <FieldGroup label="Group delay">
              {eph.aodc !== undefined && <Field name="AODC" value={String(eph.aodc)} />}
              {eph.tgd1 !== undefined && <Field name="TGD1" value={`${fmtSci(eph.tgd1)} s`} />}
              {eph.tgd2 !== undefined && <Field name="TGD2" value={`${fmtSci(eph.tgd2)} s`} />}
            </FieldGroup>
          )}

          {/* QZSS-specific signal health breakdown */}
          {sys === 'J' && (
            <FieldGroup label="Signal health">
              <Field name="L1 (MSB)" value={(eph.health & 0b100000) ? 'Unhealthy' : 'OK'} />
              <Field name="L1C/A" value={(eph.health & 0b010000) ? 'Unhealthy' : 'OK'} />
              <Field name="L2C" value={(eph.health & 0b001000) ? 'Unhealthy' : 'OK'} />
              <Field name="L5" value={(eph.health & 0b000100) ? 'Unhealthy' : 'OK'} />
              <Field name="L1C" value={(eph.health & 0b000010) ? 'Unhealthy' : 'OK'} />
              <Field name="L1C/B" value={(eph.health & 0b000001) ? 'Unhealthy' : 'OK'} />
            </FieldGroup>
          )}
        </div>
      )}

      {isStateVector && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <FieldGroup label="Position">
            <Field name="X" value={eph.x !== undefined ? `${eph.x.toFixed(3)} km` : '—'} />
            <Field name="Y" value={eph.y !== undefined ? `${eph.y.toFixed(3)} km` : '—'} />
            <Field name="Z" value={eph.z !== undefined ? `${eph.z.toFixed(3)} km` : '—'} />
          </FieldGroup>

          <FieldGroup label="Velocity">
            <Field name="Vx" value={eph.vx !== undefined ? `${eph.vx.toFixed(6)} km/s` : '—'} />
            <Field name="Vy" value={eph.vy !== undefined ? `${eph.vy.toFixed(6)} km/s` : '—'} />
            <Field name="Vz" value={eph.vz !== undefined ? `${eph.vz.toFixed(6)} km/s` : '—'} />
          </FieldGroup>

          <FieldGroup label="Clock">
            {isGlonass && (
              <>
                <Field name="τₙ" value={eph.af0 !== undefined ? `${fmtSci(eph.af0)} s` : '—'} />
                <Field name="γₙ" value={eph.gammaN !== undefined ? fmtSci(eph.gammaN) : '—'} />
                {eph.deltaTauN !== undefined && <Field name="Δτₙ" value={`${fmtSci(eph.deltaTauN)} s`} />}
                <Field name="Freq. ch." value={eph.freqChannel !== undefined ? String(eph.freqChannel) : '—'} />
                <Field name="tb" value={eph.tb !== undefined ? `${eph.tb} min` : '—'} />
                {eph.tk !== undefined && <Field name="tk" value={`${eph.tk} s`} />}
                <Field name="Bn (health)" value={String(eph.health)} />
              </>
            )}
            {isSbas && (
              <>
                <Field name="af₀" value={eph.af0 !== undefined ? `${fmtSci(eph.af0)} s` : '—'} />
                <Field name="af₁" value={eph.af1 !== undefined ? `${fmtSci(eph.af1)} s/s` : '—'} />
                <Field name="IODN" value={eph.iode !== undefined ? String(eph.iode) : '—'} />
                <Field name="URA" value={eph.ura !== undefined ? String(eph.ura) : '—'} />
              </>
            )}
          </FieldGroup>

          {isGlonass && (
            <FieldGroup label="Additional">
              {eph.ft !== undefined && <Field name="FT (URA)" value={String(eph.ft)} />}
              {eph.en !== undefined && <Field name="En (age)" value={`${eph.en} d`} />}
              {eph.nt !== undefined && <Field name="NT (day)" value={String(eph.nt)} />}
              {eph.n4 !== undefined && <Field name="N4 (4-yr)" value={String(eph.n4)} />}
              {eph.satType !== undefined && <Field name="Type (M)" value={String(eph.satType)} />}
              {eph.tauC !== undefined && <Field name="τc" value={`${fmtSci(eph.tauC)} s`} />}
              {eph.tauGPS !== undefined && <Field name="τGPS" value={`${fmtSci(eph.tauGPS)} s`} />}
            </FieldGroup>
          )}
        </div>
      )}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-fg/30 mb-1.5">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Field({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-fg/40">{name}</span>
      <span className="font-mono text-fg/70 text-right">{value}</span>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────── */

export default function ConstellationStatusPage() {
  const [data, setData] = useState<StatusData | null>(USE_MOCK ? generateMockData() : null);
  const [loading, setLoading] = useState(!USE_MOCK);
  const [error, setError] = useState<string | null>(null);
  const [selectedPrn, setSelectedPrn] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (USE_MOCK) return;
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as StatusData;
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (USE_MOCK) return;
    timerRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  const satellites = useMemo(() => {
    if (!data) return new Map<string, EphemerisInfo>();
    return new Map(Object.entries(data.satellites));
  }, [data]);

  const totalSats = satellites.size;
  const healthySats = [...satellites.values()].filter(e => isSatHealthy(e)).length;
  const unhealthySats = totalSats - healthySats;
  const updatedAge = data?.updatedAt ? Date.now() - data.updatedAt : null;

  // Which constellation owns the selected PRN?
  const selectedSys = selectedPrn?.charAt(0) ?? null;
  const selectedEph = selectedPrn ? satellites.get(selectedPrn) ?? null : null;

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap text-sm">
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="text-fg/40">Loading…</span>
          ) : totalSats > 0 ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-green-400" />
                <span className="text-fg/60">{totalSats} satellites broadcasting</span>
              </span>
              {unhealthySats > 0 && (
                <span className="text-red-400">{unhealthySats} unhealthy</span>
              )}
              <span className="text-fg/25 hidden sm:inline">— tap a satellite for details</span>
            </>
          ) : (
            <span className="text-fg/40">No data available yet</span>
          )}
        </div>
        {updatedAge != null && updatedAge > 0 && (
          <span className="text-xs text-fg/30">
            Updated {formatAge(updatedAge)}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Constellation grids */}
      {SYSTEM_ORDER.map(sys => {
        const slots = CONSTELLATION_SLOTS[sys]!;
        const color = CONSTELLATION_COLORS[sys] ?? '#7c8aff';
        const sysEphs = [...satellites.values()].filter(e => e.prn.startsWith(sys));
        const unhealthy = sysEphs.filter(e => e.health !== 0).length;

        return (
          <section key={sys} className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold" style={{ color }}>
                {slots.label}
              </h3>
              {sysEphs.length > 0 && (
                <span className="text-xs text-fg/40">
                  {sysEphs.length} tracked
                  {unhealthy > 0 && (
                    <span className="text-red-400 ml-1">({unhealthy} unhealthy)</span>
                  )}
                </span>
              )}
            </div>

            <div className="grid gap-1.5" style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(4.5rem, 1fr))',
            }}>
              {Array.from({ length: slots.max - slots.min + 1 }, (_, i) => {
                const prn = `${slots.prefix}${String(slots.min + i).padStart(slots.padWidth, '0')}`;
                const eph = satellites.get(prn);
                const hasEph = !!eph;
                const isHealthy = eph ? isSatHealthy(eph) : false;
                const isSelected = prn === selectedPrn;
                const date = eph ? ephDate(eph) : null;

                return (
                  <button
                    key={prn}
                    type="button"
                    disabled={!hasEph}
                    onClick={() => setSelectedPrn(isSelected ? null : prn)}
                    className={`rounded-md px-2 py-1.5 text-center transition-all duration-100 ${
                      isSelected
                        ? 'ring-2 ring-accent bg-accent/10 border border-accent/30 scale-105'
                        : hasEph
                          ? isHealthy
                            ? 'bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 hover:scale-105 hover:shadow-md hover:shadow-green-500/5'
                            : 'bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:scale-105 hover:shadow-md hover:shadow-red-500/5'
                          : 'bg-fg/[0.03] border border-fg/[0.06] cursor-default'
                    } ${hasEph ? 'cursor-pointer' : ''}`}
                  >
                    <div className={`text-xs font-mono font-semibold ${
                      isSelected ? 'text-accent'
                        : hasEph
                          ? isHealthy ? 'text-green-300' : 'text-red-300'
                          : 'text-fg/20'
                    }`}>
                      {prn}
                    </div>
                    {hasEph && (
                      <div className={`text-[10px] ${
                        isSelected ? 'text-accent/60'
                          : isHealthy ? 'text-green-400/60' : 'text-red-400/60'
                      }`}>
                        {formatEphTime(date)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Detail panel — appears below the constellation that owns the selected sat */}
            {selectedSys === sys && selectedEph && (
              <EphemerisDetail eph={selectedEph} onClose={() => setSelectedPrn(null)} />
            )}
          </section>
        );
      })}

      {/* Legend */}
      {totalSats > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-fg/40 pt-2 border-t border-border/30">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-green-500/10 border border-green-500/20" />
            Healthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-red-500/10 border border-red-500/20" />
            Unhealthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-fg/[0.03] border border-fg/[0.06]" />
            No ephemeris
          </span>
          <span className="ml-auto">
            Source: IGS BCEP00BKG0 broadcast ephemeris
          </span>
        </div>
      )}
    </div>
  );
}
