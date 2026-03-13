/**
 * Shared filter state type used by worker, client, and UI components.
 * Kept in a separate file so SSR imports don't pull in the worker.
 */

export interface FilterState {
  /** Constellation letters to exclude, e.g. ['R','S']. */
  excludedSystems: string[];
  /** Individual PRNs to exclude, e.g. ['G01','E14']. */
  excludedPrns: string[];
  /** Observation type prefixes to exclude, e.g. ['D'] for Doppler. */
  excludedSignalTypes: string[];
  /** Band digits to exclude, e.g. ['7','8']. */
  excludedBands: string[];
  /** Start of time window (unix ms), null = no lower bound. */
  timeStart: number | null;
  /** End of time window (unix ms), null = no upper bound. */
  timeEnd: number | null;
  /** Sampling interval in seconds, null = keep original. */
  samplingInterval: number | null;
  /** Minimum % of epochs a signal must appear in to be kept. 0 = disabled. */
  sparseThreshold: number;
  /** Per-system signal exclusions by 2-char suffix, e.g. { G: ['1C','2W'], E: ['5Q'] }.
   *  Excludes all obs types (C/L/D/S) for that signal in the given constellation. */
  excludedSignalsPerSystem: Record<string, string[]>;
}

export const DEFAULT_FILTER: FilterState = {
  excludedSystems: [],
  excludedPrns: [],
  excludedSignalTypes: [],
  excludedBands: [],
  timeStart: null,
  timeEnd: null,
  samplingInterval: null,
  sparseThreshold: 0,
  excludedSignalsPerSystem: {},
};
