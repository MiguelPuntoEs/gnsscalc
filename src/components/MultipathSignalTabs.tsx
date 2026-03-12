import type { MultipathSignalStat } from '../util/multipath';
import { systemColor } from '../util/gnss-constants';

export default function MultipathSignalTabs({
  stats,
  selected,
  onSelect,
}: {
  stats: MultipathSignalStat[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
          selected === null
            ? 'bg-fg/10 text-fg/80'
            : 'bg-fg/[0.03] text-fg/40 hover:text-fg/60'
        }`}
      >
        All signals
      </button>
      {stats.map(s => {
        const key = `${s.system}-${s.band}-${s.refBand}`;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              selected === key
                ? 'bg-fg/10 text-fg/80'
                : 'bg-fg/[0.03] text-fg/40 hover:text-fg/60'
            }`}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: systemColor(s.system) }} />
            {s.label}
            <span className="ml-1.5 text-fg/25">{s.rms.toFixed(3)}m</span>
          </button>
        );
      })}
    </div>
  );
}
