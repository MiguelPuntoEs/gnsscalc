import type { EphemerisInfo } from 'gnss-js/rtcm3';
import { CONSTELLATION_COLORS } from '../util/gnss-constants';
import {
  GPS_BLOCK,
  QZSS_SAT,
  SBAS_SAT,
  GPS_SIGNAL_HEALTH,
  GAL_SHS,
  isSatHealthy,
  isEphExpired,
  ephDate,
  bdsGeneration,
  galGeneration,
  galDvs,
  formatEphDateFull,
  fmtSec,
  fmtSci,
  fmtDeg,
  fmtM,
} from '../util/constellation-helpers';

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-fg/30 mb-1.5">
        {label}
      </div>
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

export default function EphemerisDetail({
  eph,
  onClose,
}: {
  eph: EphemerisInfo;
  onClose: () => void;
}) {
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
          <span className="text-sm font-bold font-mono" style={{ color }}>
            {eph.prn}
          </span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${isSatHealthy(eph) ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}
          >
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-4"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      <div className="text-xs text-fg/50 mb-3">
        Ephemeris epoch:{' '}
        <span className="text-fg/70 font-mono">{formatEphDateFull(date)}</span>
      </div>

      {!isStateVector && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <FieldGroup label="Keplerian elements">
            <Field
              name="Week"
              value={eph.week !== undefined ? String(eph.week) : '—'}
            />
            <Field name="TOE" value={fmtSec(eph.toe)} />
            <Field name="TOC" value={fmtSec(eph.toc)} />
            <Field
              name="IODE"
              value={eph.iode !== undefined ? String(eph.iode) : '—'}
            />
            <Field
              name="√a"
              value={
                eph.sqrtA !== undefined ? `${eph.sqrtA.toFixed(4)} m^½` : '—'
              }
            />
            <Field name="e" value={fmtSci(eph.eccentricity)} />
            <Field name="i₀" value={fmtDeg(eph.inclination)} />
            <Field name="Ω₀" value={fmtDeg(eph.omega0)} />
            <Field
              name="Ω̇"
              value={
                eph.omegaDot !== undefined
                  ? `${fmtSci(eph.omegaDot)} rad/s`
                  : '—'
              }
            />
            <Field name="ω" value={fmtDeg(eph.argPerigee)} />
            <Field name="M₀" value={fmtDeg(eph.meanAnomaly)} />
            <Field
              name="Δn"
              value={
                eph.deltaN !== undefined ? `${fmtSci(eph.deltaN)} rad/s` : '—'
              }
            />
            <Field
              name="IDOT"
              value={eph.idot !== undefined ? `${fmtSci(eph.idot)} rad/s` : '—'}
            />
          </FieldGroup>

          <FieldGroup label="Perturbation corrections">
            <Field name="Crs" value={fmtM(eph.crs)} />
            <Field name="Crc" value={fmtM(eph.crc)} />
            <Field
              name="Cuc"
              value={eph.cuc !== undefined ? `${fmtSci(eph.cuc)} rad` : '—'}
            />
            <Field
              name="Cus"
              value={eph.cus !== undefined ? `${fmtSci(eph.cus)} rad` : '—'}
            />
            <Field
              name="Cic"
              value={eph.cic !== undefined ? `${fmtSci(eph.cic)} rad` : '—'}
            />
            <Field
              name="Cis"
              value={eph.cis !== undefined ? `${fmtSci(eph.cis)} rad` : '—'}
            />
          </FieldGroup>

          <FieldGroup label="Clock corrections">
            <Field
              name="af₀"
              value={eph.af0 !== undefined ? `${fmtSci(eph.af0)} s` : '—'}
            />
            <Field
              name="af₁"
              value={eph.af1 !== undefined ? `${fmtSci(eph.af1)} s/s` : '—'}
            />
            <Field
              name="af₂"
              value={eph.af2 !== undefined ? `${fmtSci(eph.af2)} s/s²` : '—'}
            />
            <Field
              name="URA/SISA"
              value={eph.ura !== undefined ? String(eph.ura) : '—'}
            />
            {/* GPS/QZSS: MSB = LNAV health, 5 LSBs = signal component code */}
            {(sys === 'G' || sys === 'J') && (
              <>
                <Field
                  name="LNAV health"
                  value={eph.health >> 5 === 0 ? 'OK' : 'Bad'}
                />
                <Field
                  name="Signal health"
                  value={
                    GPS_SIGNAL_HEALTH[eph.health & 0x1f] ??
                    `Unknown (${eph.health & 0x1f})`
                  }
                />
                {sys === 'G' && (
                  <Field
                    name="Block"
                    value={GPS_BLOCK[parseInt(eph.prn.slice(1), 10)] ?? '—'}
                  />
                )}
                {sys === 'J' && (
                  <Field
                    name="Satellite"
                    value={QZSS_SAT[parseInt(eph.prn.slice(1), 10)] ?? '—'}
                  />
                )}
              </>
            )}
            {/* Galileo: 2-bit SHS */}
            {sys === 'E' && (
              <>
                <Field
                  name="SHS"
                  value={GAL_SHS[eph.health] ?? `Unknown (${eph.health})`}
                />
                <Field
                  name="Generation"
                  value={galGeneration(parseInt(eph.prn.slice(1), 10))}
                />
              </>
            )}
            {/* BeiDou: 1-bit */}
            {sys === 'C' && (
              <>
                <Field
                  name="Health"
                  value={eph.health === 0 ? 'OK' : 'Unhealthy'}
                />
                <Field
                  name="Generation"
                  value={bdsGeneration(parseInt(eph.prn.slice(1), 10))}
                />
              </>
            )}
            {eph.iodc !== undefined && (
              <Field name="IODC" value={String(eph.iodc)} />
            )}
            {eph.tgd !== undefined && (
              <Field name="TGD" value={`${fmtSci(eph.tgd)} s`} />
            )}
            {sys === 'G' && eph.l2Codes !== undefined && (
              <Field name="L2 codes" value={String(eph.l2Codes)} />
            )}
            {sys === 'G' && eph.l2PFlag !== undefined && (
              <Field name="L2P flag" value={String(eph.l2PFlag)} />
            )}
            {eph.fitInterval !== undefined && (
              <Field name="Fit int." value={String(eph.fitInterval)} />
            )}
          </FieldGroup>

          {/* Galileo-specific group delay & validity */}
          {sys === 'E' && (
            <FieldGroup label="Group delay & validity">
              {eph.bgdE5aE1 !== undefined && (
                <Field name="BGD E5a/E1" value={`${fmtSci(eph.bgdE5aE1)} s`} />
              )}
              {eph.bgdE5bE1 !== undefined && (
                <Field name="BGD E5b/E1" value={`${fmtSci(eph.bgdE5bE1)} s`} />
              )}
              {eph.e5aDataInvalid !== undefined && (
                <Field name="E5a DVS" value={galDvs(eph.e5aDataInvalid)} />
              )}
              {eph.e5bDataInvalid !== undefined && (
                <Field name="E5b DVS" value={galDvs(eph.e5bDataInvalid)} />
              )}
              {eph.e1bHealth !== undefined && (
                <Field
                  name="E1B SHS"
                  value={GAL_SHS[eph.e1bHealth] ?? String(eph.e1bHealth)}
                />
              )}
              {eph.e1bDataInvalid !== undefined && (
                <Field name="E1B DVS" value={galDvs(eph.e1bDataInvalid)} />
              )}
            </FieldGroup>
          )}

          {/* BeiDou-specific */}
          {sys === 'C' && (
            <FieldGroup label="Group delay">
              {eph.aodc !== undefined && (
                <Field name="AODC" value={String(eph.aodc)} />
              )}
              {eph.tgd1 !== undefined && (
                <Field name="TGD1" value={`${fmtSci(eph.tgd1)} s`} />
              )}
              {eph.tgd2 !== undefined && (
                <Field name="TGD2" value={`${fmtSci(eph.tgd2)} s`} />
              )}
            </FieldGroup>
          )}

          {/* QZSS-specific signal health breakdown */}
          {sys === 'J' && (
            <FieldGroup label="Signal health">
              <Field
                name="L1 (MSB)"
                value={eph.health & 0b100000 ? 'Unhealthy' : 'OK'}
              />
              <Field
                name="L1C/A"
                value={eph.health & 0b010000 ? 'Unhealthy' : 'OK'}
              />
              <Field
                name="L2C"
                value={eph.health & 0b001000 ? 'Unhealthy' : 'OK'}
              />
              <Field
                name="L5"
                value={eph.health & 0b000100 ? 'Unhealthy' : 'OK'}
              />
              <Field
                name="L1C"
                value={eph.health & 0b000010 ? 'Unhealthy' : 'OK'}
              />
              <Field
                name="L1C/B"
                value={eph.health & 0b000001 ? 'Unhealthy' : 'OK'}
              />
            </FieldGroup>
          )}
        </div>
      )}

      {isStateVector && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <FieldGroup label="Position">
            <Field
              name="X"
              value={eph.x !== undefined ? `${eph.x.toFixed(3)} km` : '—'}
            />
            <Field
              name="Y"
              value={eph.y !== undefined ? `${eph.y.toFixed(3)} km` : '—'}
            />
            <Field
              name="Z"
              value={eph.z !== undefined ? `${eph.z.toFixed(3)} km` : '—'}
            />
          </FieldGroup>

          <FieldGroup label="Velocity">
            <Field
              name="Vx"
              value={eph.vx !== undefined ? `${eph.vx.toFixed(6)} km/s` : '—'}
            />
            <Field
              name="Vy"
              value={eph.vy !== undefined ? `${eph.vy.toFixed(6)} km/s` : '—'}
            />
            <Field
              name="Vz"
              value={eph.vz !== undefined ? `${eph.vz.toFixed(6)} km/s` : '—'}
            />
          </FieldGroup>

          <FieldGroup label="Acceleration">
            <Field
              name="Ax"
              value={eph.ax !== undefined ? `${fmtSci(eph.ax)} km/s²` : '—'}
            />
            <Field
              name="Ay"
              value={eph.ay !== undefined ? `${fmtSci(eph.ay)} km/s²` : '—'}
            />
            <Field
              name="Az"
              value={eph.az !== undefined ? `${fmtSci(eph.az)} km/s²` : '—'}
            />
          </FieldGroup>

          <FieldGroup label="Clock">
            {isGlonass && (
              <>
                <Field
                  name="τₙ"
                  value={eph.af0 !== undefined ? `${fmtSci(eph.af0)} s` : '—'}
                />
                <Field
                  name="γₙ"
                  value={eph.gammaN !== undefined ? fmtSci(eph.gammaN) : '—'}
                />
                {eph.deltaTauN !== undefined && (
                  <Field name="Δτₙ" value={`${fmtSci(eph.deltaTauN)} s`} />
                )}
                <Field
                  name="Freq. ch."
                  value={
                    eph.freqChannel !== undefined
                      ? String(eph.freqChannel)
                      : '—'
                  }
                />
                <Field
                  name="tb"
                  value={eph.tb !== undefined ? `${eph.tb} min` : '—'}
                />
                {eph.tk !== undefined && (
                  <Field name="tk" value={`${eph.tk} s`} />
                )}
                <Field name="Bn (health)" value={String(eph.health)} />
              </>
            )}
            {isSbas && (
              <>
                <Field
                  name="Satellite"
                  value={SBAS_SAT[parseInt(eph.prn.slice(1), 10)] ?? '—'}
                />
                <Field
                  name="af₀"
                  value={eph.af0 !== undefined ? `${fmtSci(eph.af0)} s` : '—'}
                />
                <Field
                  name="af₁"
                  value={eph.af1 !== undefined ? `${fmtSci(eph.af1)} s/s` : '—'}
                />
                <Field
                  name="t₀"
                  value={eph.toc !== undefined ? `${eph.toc} s` : '—'}
                />
                <Field
                  name="IODN"
                  value={eph.iode !== undefined ? String(eph.iode) : '—'}
                />
                <Field
                  name="URA"
                  value={eph.ura !== undefined ? String(eph.ura) : '—'}
                />
              </>
            )}
          </FieldGroup>

          {isGlonass && (
            <FieldGroup label="Additional">
              {eph.ft !== undefined && (
                <Field name="FT (URA)" value={String(eph.ft)} />
              )}
              {eph.en !== undefined && (
                <Field name="En (age)" value={`${eph.en} d`} />
              )}
              {eph.nt !== undefined && (
                <Field name="NT (day)" value={String(eph.nt)} />
              )}
              {eph.n4 !== undefined && (
                <Field name="N4 (4-yr)" value={String(eph.n4)} />
              )}
              {eph.satType !== undefined && (
                <Field
                  name="Type"
                  value={
                    eph.satType === 0
                      ? 'GLONASS'
                      : eph.satType === 1
                        ? 'GLONASS-M'
                        : `Unknown (${eph.satType})`
                  }
                />
              )}
              {eph.tauC !== undefined && (
                <Field name="τc" value={`${fmtSci(eph.tauC)} s`} />
              )}
              {eph.tauGPS !== undefined && (
                <Field name="τGPS" value={`${fmtSci(eph.tauGPS)} s`} />
              )}
            </FieldGroup>
          )}
        </div>
      )}
    </div>
  );
}
