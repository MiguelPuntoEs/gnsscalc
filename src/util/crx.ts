/**
 * Compact RINEX (Hatanaka / CRX) decompression utilities.
 * Extracted from rinex.ts for separation of concerns.
 */

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/**
 * Per-observation Hatanaka state.
 * accum[0] = reconstructed value, accum[k] = kth-order accumulator.
 */
export interface DiffState {
  accum: number[];   // accumulator at each order level
  order: number;     // current difference order (ramps up from 0)
  arcOrder: number;  // target difference order
}

export interface CrxField {
  empty: boolean;
  init: boolean;
  arcOrder: number;
  value: number;
}

/* ================================================================== */
/*  Text differencing                                                  */
/* ================================================================== */

/**
 * Text-differencing repair function (matches crx2rnx repair()).
 * Applies diff to old string in-place semantics:
 *   space = no change, '&' = replace with space, other = replace with char.
 */
export function crxRepair(old: string, diff: string): string {
  const chars = old.split('');
  for (let i = 0; i < diff.length; i++) {
    const dc = diff[i]!;
    if (dc === ' ') {
      // no change — keep chars[i] if it exists
    } else if (dc === '&') {
      chars[i] = ' ';
    } else {
      chars[i] = dc;
    }
  }
  // If diff is longer than old, append excess (with & → space)
  if (diff.length > chars.length) {
    for (let i = chars.length; i < diff.length; i++) {
      chars[i] = diff[i] === '&' ? ' ' : diff[i]!;
    }
  }
  return chars.join('');
}

/* ================================================================== */
/*  Data line parsing                                                  */
/* ================================================================== */

/**
 * Parse a CRX satellite data line into ntype fields + trailing flag string.
 * Mimics getdiff() from crx2rnx.c: each space is a field separator,
 * so consecutive spaces produce empty (missing) fields.
 */
export function parseCrxDataLine(
  line: string, ntype: number,
): { fields: CrxField[]; flagStr: string } {
  const fields: CrxField[] = [];
  let pos = 0;
  for (let j = 0; j < ntype; j++) {
    if (pos >= line.length || line[pos] === '\0') {
      // Remaining fields are empty
      fields.push({ empty: true, init: false, arcOrder: -1, value: 0 });
      pos++; // skip past null/end
      continue;
    }
    if (line[pos] === ' ') {
      // Empty field (space = separator consumed as empty field)
      fields.push({ empty: true, init: false, arcOrder: -1, value: 0 });
      pos++;
      continue;
    }
    // Non-empty field: read until next space or end
    const start = pos;
    while (pos < line.length && line[pos] !== ' ') pos++;
    const token = line.substring(start, pos);
    // Skip separator space after the field
    if (pos < line.length && line[pos] === ' ') pos++;

    // Check for arc init: digit followed by &
    if (token.length >= 3 && token[1] === '&') {
      const arcOrder = parseInt(token[0]!);
      const value = parseInt(token.substring(2));
      fields.push({ empty: false, init: true, arcOrder, value: isNaN(value) ? 0 : value });
    } else {
      const value = parseInt(token);
      fields.push({ empty: false, init: false, arcOrder: -1, value: isNaN(value) ? 0 : value });
    }
  }
  // Remaining is the flag string
  const flagStr = pos < line.length ? line.substring(pos) : '';
  return { fields, flagStr };
}

/* ================================================================== */
/*  Numerical decompression                                            */
/* ================================================================== */

/**
 * Apply Hatanaka decompression for one observation.
 * On init: set accum[0] = value, order = 0.
 * On continue: ramp up order toward arcOrder, store diff at current order,
 * then cascade accum[k-1] += accum[k] for k = order down to 1.
 */
export function crxDecompress(
  prev: DiffState | null,
  field: CrxField,
): { state: DiffState; result: number } {
  if (field.init) {
    const a = new Array(Math.max(field.arcOrder + 1, 1)).fill(0) as number[];
    a[0] = field.value;
    return { state: { accum: a, order: 0, arcOrder: field.arcOrder }, result: field.value };
  }
  if (!prev) {
    // Continuation without init — shouldn't happen, treat as 0
    return { state: { accum: [0], order: 0, arcOrder: 0 }, result: 0 };
  }
  // Ramp up order
  let order = prev.order;
  if (order < prev.arcOrder) order++;

  const accum = [...prev.accum];
  while (accum.length <= order) accum.push(0);
  accum[order] = field.value;
  for (let k = order; k >= 1; k--) {
    accum[k - 1]! += accum[k]!;
  }
  return { state: { accum, order, arcOrder: prev.arcOrder }, result: accum[0]! };
}
