/**
 * Combined quality analysis — runs cycle slip detection, data completeness,
 * and multipath analysis in a single file re-parse pass.
 */

import type { RinexHeader } from './rinex';
import { parseRinexStream } from './rinex';
import { CycleSlipAccumulator } from './cycle-slip';
import type { CycleSlipResult } from './cycle-slip';
import { CompletenessAccumulator } from './completeness';
import type { CompletenessResult } from './completeness';
import { MultipathAccumulator } from './multipath';
import type { MultipathResult } from './multipath';

export interface QualityResult {
  cycleSlips: CycleSlipResult;
  completeness: CompletenessResult;
  multipath: MultipathResult;
}

export async function analyzeQuality(
  file: File,
  header: RinexHeader,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<QualityResult> {
  const mpAccum = new MultipathAccumulator(header);
  const csAccum = new CycleSlipAccumulator(header, (time, prn, bands) => {
    mpAccum.notifySlip(time, prn, bands);
  });
  const compAccum = new CompletenessAccumulator(header);

  await parseRinexStream(file, onProgress, signal, (time, prn, codes, values) => {
    csAccum.onObservation(time, prn, codes, values);
    mpAccum.onObservation(time, prn, codes, values);
    compAccum.onObservation(time, prn, codes, values);
  }, true /* workerMode: skip EpochSummary construction */);

  return {
    cycleSlips: csAccum.finalize(),
    completeness: compAccum.finalize(),
    multipath: mpAccum.finalize(),
  };
}
