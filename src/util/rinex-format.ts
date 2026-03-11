/**
 * Shared RINEX formatting helpers.
 *
 * Used by any module that needs to produce RINEX-formatted text
 * (observation writers, navigation writers, etc.).
 */

/** Pad/truncate string to exact width, left-aligned. */
export function padL(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

/** Pad/truncate string to exact width, right-aligned. */
export function padR(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s;
}

/** Format a float with given width and decimals, right-aligned. */
export function fmtF(val: number, width: number, dec: number): string {
  return padR(val.toFixed(dec), width);
}

/** RINEX header line: content (60 chars) + label (20 chars). */
export function hdrLine(content: string, label: string): string {
  return padL(content, 60) + padL(label, 20);
}
