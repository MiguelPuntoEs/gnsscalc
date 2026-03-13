/**
 * Types shared between the PDF report generator and the main page.
 * Kept separate so importing types doesn't pull in @react-pdf/renderer.
 */

import type { RinexHeader, RinexStats } from './rinex';
import type { RinexWarnings } from './rinex-warnings';
import type { EpochGrid } from './epoch-grid';
import type { AllPositionsData } from './orbit';
import type { MultipathResult } from './multipath';
import type { CycleSlipResult } from './cycle-slip';
import type { CompletenessResult } from './completeness';

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
