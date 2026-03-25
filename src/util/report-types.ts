/**
 * Types shared between the PDF report generator and the main page.
 * Kept separate so importing types doesn't pull in @react-pdf/renderer.
 */

import type { RinexHeader, RinexStats } from 'gnss-js/rinex';
import type { RinexWarnings } from 'gnss-js/rinex';
import type { EpochGrid } from './epoch-grid';
import type { AllPositionsData } from 'gnss-js/orbit';
import type { MultipathResult } from 'gnss-js/analysis';
import type { CycleSlipResult } from 'gnss-js/analysis';
import type { CompletenessResult } from 'gnss-js/analysis';

export interface ReportData {
  header: RinexHeader;
  stats: RinexStats;
  warnings: RinexWarnings;
  grid: EpochGrid;
  allPositions: AllPositionsData | null;
  observedPrns: Set<string>[] | null;
  qaResult: {
    multipath: MultipathResult;
    cycleSlips: CycleSlipResult;
    completeness: CompletenessResult;
  } | null;
  obsFileNames: string[];
  navFileNames: string[];
}
