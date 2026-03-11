/**
 * GNSS signal Power Spectral Density (PSD) functions.
 *
 * Ported from Python (gnss-utils/utils/signals/psd.py).
 * All frequency inputs are in Hz; output is linear power spectral density.
 */

/** Normalised sinc: sinc(x) = sin(πx) / (πx), sinc(0) = 1 */
function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/** BPSK PSD: φ(f) = (1 / f₀n) · sinc²(f / f₀n) */
export function phiBPSK(f: number, f0: number, n: number): number {
  return (1 / (f0 * n)) * sinc(f / (f0 * n)) ** 2;
}

/** BOC sine-phased PSD */
export function phiBOCs(f: number, f0: number, m: number, n: number): number {
  if (f === 0) return 0;
  const ratio = (2 * m) / n;
  if (ratio % 2 === 0) {
    // Even case: use BOCc / tan²(…)
    const boccVal = phiBOCc(f, f0, m, n);
    const tanArg = (Math.PI * f) / (4 * f0 * m);
    const tanVal = Math.tan(tanArg);
    if (tanVal === 0) return 0;
    return boccVal / tanVal ** 2;
  }
  // Odd case
  const cosVal = Math.cos((Math.PI * f) / (n * f0));
  const sinVal = Math.sin((Math.PI * f) / (2 * m * f0));
  const cosDiv = Math.cos((Math.PI * f) / (2 * m * f0));
  if (cosDiv === 0) return 0;
  return f0 * n * (cosVal * sinVal / (Math.PI * f * cosDiv)) ** 2;
}

/** BOC cosine-phased PSD */
export function phiBOCc(f: number, f0: number, m: number, n: number): number {
  if (f === 0) return 0;
  const ratio = (2 * m) / n;
  if (ratio % 2 === 0) {
    const sincVal = sinc(f / (f0 * n));
    const sinArg = (Math.PI * f) / (4 * f0 * m);
    const cosArg = (Math.PI * f) / (2 * f0 * m);
    const cosVal = Math.cos(cosArg);
    if (cosVal === 0) return 0;
    return (4 / (f0 * n)) * sincVal ** 2 * (Math.sin(sinArg) ** 2 / cosVal) ** 2;
  }
  // Odd case
  const cosNum = Math.cos((Math.PI * f) / (n * f0));
  const sinNum = Math.sin((Math.PI * f) / (4 * m * f0));
  const cosDen = Math.cos((Math.PI * f) / (2 * m * f0));
  if (cosDen === 0) return 0;
  return n * f0 * (2 * cosNum * sinNum / (Math.PI * f * cosDen)) ** 2;
}

/** AltBOC (constant envelope) PSD */
export function phiAltBOC(f: number, f0: number, m: number, n: number): number {
  if (f === 0) return 0;
  const cosDen = Math.cos((Math.PI * f) / (2 * f0 * m));
  if (Math.abs(cosDen) < 1e-15) return 0;
  // Python: cos(π·f/(f·f0·m)) = cos(π/(f0·m)), a constant
  const cosConst = Math.cos(Math.PI / (f0 * m));
  const cosHalf = Math.cos((Math.PI * f) / (2 * f0 * m));
  const cosQuarter = Math.cos((Math.PI * f) / (4 * f0 * m));
  const inner = cosConst ** 2 - cosHalf - 2 * cosHalf * cosQuarter + 2;

  if (m % 2 === 1) {
    const cosN = Math.cos((Math.PI * f) / (f0 * n));
    return 4 * f0 * n / (Math.PI * f) ** 2 * cosN ** 2 / cosDen ** 2 * inner;
  }
  const sinN = Math.sin((Math.PI * f) / (f0 * n));
  return 4 * f0 * n / (Math.PI * f) ** 2 * sinN ** 2 / cosDen ** 2 * inner;
}

/**
 * Compute PSD in dB over a frequency range.
 * Returns Float64Array of 10·log₁₀(φ(f)) values, clamped to a floor.
 */
export function computePsdDb(
  centerMHz: number,
  halfSpanChips: number,
  numPoints: number,
  psdFn: (f: number) => number,
  f0: number = 1.023e6,
  floorDb: number = -60,
): { freqsMHz: Float64Array; psdDb: Float64Array } {
  const HZ_IN_MHZ = 1e6;
  const halfSpanMHz = halfSpanChips * f0 / HZ_IN_MHZ;
  const freqsMHz = new Float64Array(numPoints);
  const psdDb = new Float64Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    const fMHz = -halfSpanMHz + (2 * halfSpanMHz * i) / (numPoints - 1);
    freqsMHz[i] = fMHz + centerMHz;
    const val = psdFn(fMHz * HZ_IN_MHZ);
    psdDb[i] = val > 0 ? 10 * Math.log10(val) : floorDb;
  }
  return { freqsMHz, psdDb };
}
