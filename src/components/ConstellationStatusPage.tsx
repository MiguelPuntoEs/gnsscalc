import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { EphemerisInfo } from '../util/rtcm3-ephemeris';
import { CONSTELLATION_COLORS } from '../util/gnss-constants';

/* ── Constants ────────────────────────────────────────────────── */

const API_URL = '/api/constellation-status';
const POLL_INTERVAL = 30_000;

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

/** GPS PRN → Block type mapping (source: NAVCEN, March 2026) */
const GPS_BLOCK: Record<number, string> = {
  1: 'III', 2: 'IIR', 3: 'IIF', 4: 'III', 5: 'IIR-M', 6: 'IIF',
  7: 'IIR-M', 8: 'IIF', 9: 'IIF', 10: 'IIF', 11: 'III', 12: 'IIR-M',
  13: 'IIR', 14: 'III', 15: 'IIR-M', 16: 'IIR', 17: 'IIR-M', 18: 'III',
  19: 'IIR', 20: 'IIR', 21: 'III', 22: 'IIR', 23: 'III', 24: 'IIF',
  25: 'IIF', 26: 'IIF', 27: 'IIF', 28: 'III', 29: 'IIR-M', 30: 'IIF',
  31: 'IIR-M', 32: 'IIF',
};

/** BeiDou PRN → generation/orbit mapping */
function bdsGeneration(prn: number): string {
  if (prn >= 1 && prn <= 5) return 'BDS-2 GEO';
  if (prn >= 6 && prn <= 10) return 'BDS-2 IGSO';
  if (prn >= 11 && prn <= 14) return 'BDS-2 MEO';
  if (prn === 16) return 'BDS-2 IGSO';
  if (prn >= 19 && prn <= 37) return 'BDS-3 MEO';
  if (prn >= 38 && prn <= 40) return 'BDS-3 IGSO';
  if (prn >= 41 && prn <= 46) return 'BDS-3 MEO';
  if (prn >= 56 && prn <= 63) return 'BDS-3';
  return '—';
}

/** Galileo PRN → generation mapping */
function galGeneration(prn: number): string {
  if ([11, 12, 19, 20].includes(prn)) return 'IOV';
  if ([14, 18].includes(prn)) return 'FOC (eccentric)';
  return 'FOC';
}

/** QZSS PRN → satellite mapping */
const QZSS_SAT: Record<number, string> = {
  1: 'QZS-1 (Block I)',
  2: 'QZS-2R (Block II)',
  3: 'QZS-3 (GEO)',
  4: 'QZS-4 (Block II)',
  7: 'QZS-1R (Block II)',
};

/** SBAS PRN → satellite/system mapping */
const SBAS_SAT: Record<number, string> = {
  120: 'EGNOS (PRN120)',
  121: 'EGNOS (Eutelsat 5WB)',
  122: 'SPAN (Inmarsat 4F2)',
  123: 'EGNOS (ASTRA 5B)',
  124: 'EGNOS',
  125: 'SDCM (Luch-5A)',
  126: 'EGNOS',
  127: 'GAGAN (GSAT-8)',
  128: 'GAGAN (GSAT-10)',
  129: 'MSAS (MTSAT-2)',
  130: 'BDSBAS',
  131: 'WAAS (Eutelsat 117WB)',
  133: 'WAAS (SES-15)',
  135: 'WAAS (Inmarsat 4F3)',
  136: 'EGNOS',
  137: 'MSAS (QZS-3)',
  138: 'WAAS (Anik F1R)',
  140: 'GAGAN (GSAT-15)',
  141: 'SDCM (Luch-5B)',
  143: 'BDSBAS',
  144: 'BDSBAS',
  147: 'KASS',
  148: 'KASS',
};

/** Ephemeris validity periods per constellation (from ICDs) */
const VALIDITY_MS: Record<string, number> = {
  G: 2 * 3600_000,    // GPS: 2 hours (IS-GPS-200N)
  E: 4 * 3600_000,    // Galileo: 4 hours (OS SIS ICD)
  R: 30 * 60_000,     // GLONASS: 30 minutes (ICD-GLONASS)
  C: 1 * 3600_000,    // BeiDou: 1 hour (BDS-SIS-ICD)
  J: 2 * 3600_000,    // QZSS: 2 hours (IS-QZSS-PNT-006)
  S: 10 * 60_000,     // SBAS: ~10 minutes
};

/** Check if ephemeris has expired based on constellation-specific validity period. */
function isEphExpired(eph: EphemerisInfo): boolean {
  const sys = eph.prn.charAt(0);
  const validity = VALIDITY_MS[sys] ?? 2 * 3600_000;
  return Date.now() - eph.lastReceived > validity;
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
    // tb is already in minutes (decoder multiplies by 15), Moscow time
    const now = new Date(eph.lastReceived);
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return new Date(utcMidnight + (eph.tb * 60 - 3 * 3600) * 1000);
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
 * GPS:  MSB=0 & 5-bit signal code=0 → healthy (IS-GPS-200N §20.3.3.3.1.4)
 * QZSS: only the MSB (bit 5) indicates L1 health (IS-QZSS-PNT-006 Table 4.1.2-5-1)
 * Galileo: SHS 2-bit field, 0 = OK (Galileo OS SIS ICD Table 84)
 * Others: 0 = healthy
 */
function isSatHealthy(eph: EphemerisInfo): boolean {
  const sys = eph.prn.charAt(0);
  if (sys === 'J') return (eph.health & 0b100000) === 0; // MSB only
  return eph.health === 0;
}

/** GPS 5-bit signal health codes (IS-GPS-200N Table 20-VIII) */
const GPS_SIGNAL_HEALTH: Record<number, string> = {
  0: 'All Signals OK',
  1: 'All Signals Weak',
  2: 'All Signals Dead',
  3: 'All Signals — No Data Modulation',
  4: 'L1 P Signal Weak',
  5: 'L1 P Signal Dead',
  6: 'L1 P Signal — No Data Modulation',
  7: 'L2 P Signal Weak',
  8: 'L2 P Signal Dead',
  9: 'L2 P Signal — No Data Modulation',
  10: 'L1C Signal Weak',
  11: 'L1C Signal Dead',
  12: 'L1C Signal — No Data Modulation',
  13: 'L2C Signal Weak',
  14: 'L2C Signal Dead',
  15: 'L2C Signal — No Data Modulation',
  16: 'L1 & L2 P Signal Weak',
  17: 'L1 & L2 P Signal Dead',
  18: 'L1 & L2 P Signal — No Data Modulation',
  19: 'L1 & L2C Signal Weak',
  20: 'L1 & L2C Signal Dead',
  21: 'L1 & L2C Signal — No Data Modulation',
  22: 'L1 Signal Weak',
  23: 'L1 Signal Dead',
  24: 'L1 Signal — No Data Modulation',
  25: 'L2 Signal Weak',
  26: 'L2 Signal Dead',
  27: 'L2 Signal — No Data Modulation',
  28: 'SV Temporarily Out',
  29: 'SV Will Be Temporarily Out',
  30: 'Signals Deformed (URA valid)',
  31: 'Multiple Anomalies',
};

/** Galileo Signal Health Status (Galileo OS SIS ICD Table 84) */
const GAL_SHS: Record<number, string> = {
  0: 'Signal OK',
  1: 'Signal Out of Service',
  2: 'Extended Operations Mode',
  3: 'Signal in Test',
};

/** Galileo Data Validity Status (Galileo OS SIS ICD Table 81) */
function galDvs(v: number | undefined): string {
  if (v === undefined) return '—';
  return v === 0 ? 'Valid' : 'No guarantee';
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
          {isEphExpired(eph) && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
              Expired
            </span>
          )}
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
            {/* GPS/QZSS: MSB = LNAV health, 5 LSBs = signal component code */}
            {(sys === 'G' || sys === 'J') && (
              <>
                <Field name="LNAV health" value={(eph.health >> 5) === 0 ? 'OK' : 'Bad'} />
                <Field name="Signal health" value={GPS_SIGNAL_HEALTH[eph.health & 0x1F] ?? `Unknown (${eph.health & 0x1F})`} />
                {sys === 'G' && <Field name="Block" value={GPS_BLOCK[parseInt(eph.prn.slice(1), 10)] ?? '—'} />}
                {sys === 'J' && <Field name="Satellite" value={QZSS_SAT[parseInt(eph.prn.slice(1), 10)] ?? '—'} />}
              </>
            )}
            {/* Galileo: 2-bit SHS */}
            {sys === 'E' && (
              <>
                <Field name="SHS" value={GAL_SHS[eph.health] ?? `Unknown (${eph.health})`} />
                <Field name="Generation" value={galGeneration(parseInt(eph.prn.slice(1), 10))} />
              </>
            )}
            {/* BeiDou: 1-bit */}
            {sys === 'C' && (
              <>
                <Field name="Health" value={eph.health === 0 ? 'OK' : 'Unhealthy'} />
                <Field name="Generation" value={bdsGeneration(parseInt(eph.prn.slice(1), 10))} />
              </>
            )}
            {eph.iodc !== undefined && <Field name="IODC" value={String(eph.iodc)} />}
            {eph.tgd !== undefined && <Field name="TGD" value={`${fmtSci(eph.tgd)} s`} />}
            {(sys === 'G') && eph.l2Codes !== undefined && <Field name="L2 codes" value={String(eph.l2Codes)} />}
            {(sys === 'G') && eph.l2PFlag !== undefined && <Field name="L2P flag" value={String(eph.l2PFlag)} />}
            {eph.fitInterval !== undefined && <Field name="Fit int." value={String(eph.fitInterval)} />}
          </FieldGroup>

          {/* Galileo-specific group delay & validity */}
          {sys === 'E' && (
            <FieldGroup label="Group delay & validity">
              {eph.bgdE5aE1 !== undefined && <Field name="BGD E5a/E1" value={`${fmtSci(eph.bgdE5aE1)} s`} />}
              {eph.bgdE5bE1 !== undefined && <Field name="BGD E5b/E1" value={`${fmtSci(eph.bgdE5bE1)} s`} />}
              {eph.e5aDataInvalid !== undefined && <Field name="E5a DVS" value={galDvs(eph.e5aDataInvalid)} />}
              {eph.e5bDataInvalid !== undefined && <Field name="E5b DVS" value={galDvs(eph.e5bDataInvalid)} />}
              {eph.e1bHealth !== undefined && <Field name="E1B SHS" value={GAL_SHS[eph.e1bHealth] ?? String(eph.e1bHealth)} />}
              {eph.e1bDataInvalid !== undefined && <Field name="E1B DVS" value={galDvs(eph.e1bDataInvalid)} />}
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

          <FieldGroup label="Acceleration">
            <Field name="Ax" value={eph.ax !== undefined ? `${fmtSci(eph.ax)} km/s²` : '—'} />
            <Field name="Ay" value={eph.ay !== undefined ? `${fmtSci(eph.ay)} km/s²` : '—'} />
            <Field name="Az" value={eph.az !== undefined ? `${fmtSci(eph.az)} km/s²` : '—'} />
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
                <Field name="Satellite" value={SBAS_SAT[parseInt(eph.prn.slice(1), 10)] ?? '—'} />
                <Field name="af₀" value={eph.af0 !== undefined ? `${fmtSci(eph.af0)} s` : '—'} />
                <Field name="af₁" value={eph.af1 !== undefined ? `${fmtSci(eph.af1)} s/s` : '—'} />
                <Field name="t₀" value={eph.toc !== undefined ? `${eph.toc} s` : '—'} />
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
              {eph.satType !== undefined && <Field name="Type" value={eph.satType === 0 ? 'GLONASS' : eph.satType === 1 ? 'GLONASS-M' : `Unknown (${eph.satType})`} />}
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
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPrn, setSelectedPrn] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
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

  // Tick the "Updated Xs ago" display every 5 seconds
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  const updatedAge = data?.updatedAt ? now - data.updatedAt : null;

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
        const unhealthy = sysEphs.filter(e => !isSatHealthy(e)).length;

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
                const expired = eph ? isEphExpired(eph) : false;
                const isHealthy = eph ? isSatHealthy(eph) : false;
                const isSelected = prn === selectedPrn;
                const date = eph ? ephDate(eph) : null;

                // Three visual states: healthy (green), unhealthy (red), expired (amber/dimmed)
                const cellStyle = isSelected
                  ? 'ring-2 ring-accent bg-accent/10 border border-accent/30 scale-105'
                  : !hasEph
                    ? 'bg-fg/[0.03] border border-fg/[0.06] cursor-default'
                    : expired
                      ? 'bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 hover:scale-105 hover:shadow-md hover:shadow-amber-500/5'
                      : isHealthy
                        ? 'bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 hover:scale-105 hover:shadow-md hover:shadow-green-500/5'
                        : 'bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:scale-105 hover:shadow-md hover:shadow-red-500/5';

                const prnColor = isSelected ? 'text-accent'
                  : !hasEph ? 'text-fg/20'
                    : expired ? 'text-amber-300/60'
                      : isHealthy ? 'text-green-300' : 'text-red-300';

                const timeColor = isSelected ? 'text-accent/60'
                  : expired ? 'text-amber-400/40'
                    : isHealthy ? 'text-green-400/60' : 'text-red-400/60';

                return (
                  <button
                    key={prn}
                    type="button"
                    disabled={!hasEph}
                    onClick={() => setSelectedPrn(isSelected ? null : prn)}
                    className={`rounded-md px-2 py-1.5 text-center transition-all duration-100 ${cellStyle} ${hasEph ? 'cursor-pointer' : ''}`}
                  >
                    <div className={`text-xs font-mono font-semibold ${prnColor}`}>
                      {prn}
                    </div>
                    {hasEph && (
                      <div className={`text-[10px] ${timeColor}`}>
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
            <span className="inline-block size-3 rounded bg-amber-500/10 border border-amber-500/20" />
            Expired
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
