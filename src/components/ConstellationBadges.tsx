import { systemColor } from '../util/gnss-constants';
import { getChartTheme } from '../hooks/useChartTheme';
import { systemName } from '../util/rinex';

/** All constellation identifiers rendered by the badge grid. */
const ALL_SYSTEMS = ['G', 'R', 'E', 'C', 'J', 'I', 'S'] as const;

/**
 * A compact grid of constellation badges showing which GNSS systems are
 * active (colored) or inactive (greyed out).
 */
export default function ConstellationBadges({
  activeSystems,
}: {
  /** The constellation identifiers that should appear highlighted. */
  activeSystems: string[];
}) {
  const t = getChartTheme();
  return (
    <span className="grid grid-cols-4 gap-1.5 items-center py-1">
      {ALL_SYSTEMS.map(s => {
        const active = activeSystems.includes(s);
        const c = systemColor(s);
        return (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none"
            style={active
              ? { backgroundColor: `${c}18`, color: c, border: `1px solid ${c}30` }
              : { backgroundColor: 'transparent', color: t.canvasText + '0.2)', border: `1px solid ${t.canvasText}0.08)` }
            }
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: active ? c : t.canvasText + '0.15)' }}
            />
            {systemName(s)}
          </span>
        );
      })}
    </span>
  );
}
