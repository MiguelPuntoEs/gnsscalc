import { useState } from 'react';
import type { MultipathResult } from '../util/multipath';
import type { AllPositionsData } from '../util/orbit';
import { systemColor } from '../util/gnss-constants';
import MultipathRmsBar from './MultipathRmsBar';
import MultipathHeatmap from './MultipathHeatmap';
import MultipathDistribution from './MultipathDistribution';
import MultipathSatScatter from './MultipathSatScatter';
import MultipathSignalTabs from './MultipathSignalTabs';
import MultipathElevation from './MultipathElevation';

export default function MultipathCharts({
  result,
  allPositions,
}: {
  result: MultipathResult;
  allPositions?: AllPositionsData | null;
}) {
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);

  if (result.signalStats.length === 0) {
    return (
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4 text-center text-fg/40 text-sm">
        No dual-frequency code/phase observations found for multipath analysis.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
          Multipath analysis
        </span>
        <MultipathSignalTabs stats={result.signalStats} selected={selectedSignal} onSelect={setSelectedSignal} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {(selectedSignal ? result.signalStats.filter(s => `${s.system}-${s.band}-${s.refBand}` === selectedSignal) : result.signalStats).map(s => (
            <div key={`${s.system}-${s.band}-${s.refBand}`} className="rounded-lg bg-fg/[0.03] px-3 py-2">
              <div className="text-[10px] text-fg/40 mb-0.5">{s.label}</div>
              <div className="text-lg font-semibold" style={{ color: systemColor(s.system) }}>
                {s.rms.toFixed(3)}<span className="text-xs font-normal text-fg/30 ml-0.5">m</span>
              </div>
              <div className="text-[9px] text-fg/25">{s.satellites} SVs &middot; {s.count.toLocaleString()} obs</div>
            </div>
          ))}
        </div>
      </div>

      <MultipathRmsBar stats={result.signalStats} />
      {allPositions && (
        <MultipathElevation result={result} selectedSignal={selectedSignal} allPositions={allPositions} />
      )}
      <MultipathHeatmap result={result} selectedSignal={selectedSignal} />
      <MultipathDistribution result={result} selectedSignal={selectedSignal} />
      <MultipathSatScatter result={result} selectedSignal={selectedSignal} />
    </div>
  );
}
