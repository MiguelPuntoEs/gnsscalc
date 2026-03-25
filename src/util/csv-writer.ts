/**
 * CSV/tabular observation writer.
 *
 * Produces a CSV with columns: Epoch, PRN, and one column per obs code.
 * Similar to GFZRNX -tab output.
 */

import type { CompactEpoch } from './obs-writer';

function formatEpochUTC(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const s = (d.getUTCSeconds() + d.getUTCMilliseconds() / 1000)
    .toFixed(3)
    .padStart(6, '0');
  return `${y}-${mo}-${dy}T${h}:${mi}:${s}Z`;
}

/**
 * Write observations as a CSV string.
 * Each row is one satellite in one epoch.
 */
export function writeObsCsv(
  epochs: CompactEpoch[],
  obsTypes: Map<string, string[]>,
): string {
  // Collect all unique codes across systems (for unified column header)
  const allCodes: string[] = [];
  const codeSet = new Set<string>();
  for (const [, codes] of obsTypes) {
    for (const code of codes) {
      if (!codeSet.has(code)) {
        codeSet.add(code);
        allCodes.push(code);
      }
    }
  }

  const lines: string[] = [];
  lines.push(['Epoch', 'PRN', ...allCodes].join(','));

  for (const epoch of epochs) {
    const timeStr = formatEpochUTC(epoch.time);
    const prns = [...epoch.sats.keys()].sort();
    for (const prn of prns) {
      const sys = prn[0]!;
      const sysCodes = obsTypes.get(sys);
      if (!sysCodes) continue;
      const valArr = epoch.sats.get(prn)!;
      const values = allCodes.map((code) => {
        const idx = sysCodes.indexOf(code);
        if (idx < 0 || idx >= valArr.length) return '';
        const v = valArr[idx]!;
        return isNaN(v) ? '' : v.toFixed(3);
      });
      lines.push([timeStr, prn, ...values].join(','));
    }
  }

  return lines.join('\n');
}
