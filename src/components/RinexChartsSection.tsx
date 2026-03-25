import { lazy, Suspense } from 'react';
import type { RinexHeader, RinexStats } from 'gnss-js/rinex';
import type { QualityResult } from 'gnss-js/analysis';
import type { EpochGrid } from '../util/epoch-grid';
import type { NavResult } from 'gnss-js/rinex';
import type { AllPositionsData } from 'gnss-js/orbit';
import type { EditableHeaderFields } from '../util/rinex-header-edit';
import ErrorBoundary from './ErrorBoundary';
import ObsTypeMatrix from './ObsTypeMatrix';

const RinexCharts = lazy(() => import('./RinexCharts'));
const SkyPlotCharts = lazy(() => import('./SkyPlot'));
const MultipathCharts = lazy(() => import('./MultipathCharts'));
const CycleSlipCharts = lazy(() => import('./CycleSlipCharts'));
const CompletenessCharts = lazy(() => import('./CompletenessCharts'));
const SatAvailabilityChart = lazy(() => import('./SatAvailabilityChart'));

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function ChartSkeleton({ height = 180 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-border/40 bg-bg-raised/60 p-4">
      <div className="h-3 w-40 rounded bg-fg/5 mb-3" />
      <div className="flex items-center justify-center" style={{ height }}>
        <SpinnerIcon className="size-5 animate-spin text-fg/20" />
      </div>
    </div>
  );
}

export default function RinexChartsSection({
  header,
  stats,
  grid,
  qaResult,
  allPositions,
  observedPrns,
  headerEdits,
  navResult,
}: {
  header: RinexHeader;
  stats: RinexStats;
  grid: EpochGrid;
  qaResult: QualityResult | null;
  allPositions: AllPositionsData | null;
  observedPrns: Set<string>[] | null;
  headerEdits: EditableHeaderFields | null;
  navResult: NavResult | null;
}) {
  return (
    <>
      {/* ── Observation inventory (standalone card) ─────────── */}
      {header.obsTypes && Object.keys(header.obsTypes).length > 0 && (
        <div className="rounded-xl bg-bg-raised/60 border border-border/40 px-4 py-3">
          <div className="text-sm font-semibold text-fg mb-1">
            Observation Inventory
          </div>
          <ObsTypeMatrix obsTypes={header.obsTypes} systems={stats.systems} />
        </div>
      )}

      {/* ── Charts (the main content — immediately visible) ── */}
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex flex-col gap-4">
              {Array.from({ length: 3 }, (_, i) => (
                <ChartSkeleton key={i} />
              ))}
            </div>
          }
        >
          <RinexCharts grid={grid} systems={stats.systems} />
        </Suspense>
      </ErrorBoundary>

      {/* ── Signal quality analysis (multipath + cycle slips + completeness) ── */}
      {qaResult && (
        <ErrorBoundary>
          <Suspense fallback={<ChartSkeleton />}>
            <MultipathCharts
              result={qaResult.multipath}
              allPositions={allPositions}
            />
            <CycleSlipCharts result={qaResult.cycleSlips} />
            <CompletenessCharts result={qaResult.completeness} />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ── Satellite availability & health ─────────────────── */}
      {navResult && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <SatAvailabilityChart
              ephemerides={navResult.ephemerides}
              grid={grid}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ── Sky Plot, Ground Tracks & DOP ──────────────────── */}
      {allPositions && (
        <ErrorBoundary>
          <Suspense fallback={<ChartSkeleton height={360} />}>
            <SkyPlotCharts
              allPositions={allPositions}
              observedPrns={observedPrns}
              rxPos={
                headerEdits
                  ? [
                      headerEdits.positionX,
                      headerEdits.positionY,
                      headerEdits.positionZ,
                    ]
                  : (header.approxPosition ?? undefined)
              }
              grid={grid}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
