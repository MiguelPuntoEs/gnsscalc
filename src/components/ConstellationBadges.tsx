import { systemColor } from '../util/gnss-constants';
import { getChartTheme } from '../hooks/useChartTheme';
import { systemName } from 'gnss-js/rinex';

/** All constellation identifiers rendered by the badge grid. */
const ALL_SYSTEMS = ['G', 'R', 'E', 'C', 'J', 'I', 'S'] as const;

/**
 * A compact grid of constellation badges.
 *
 * When `onToggle` is provided, badges become clickable toggle buttons
 * that control which constellations are included in analysis/export.
 * When omitted, badges are display-only (original behaviour).
 */
export default function ConstellationBadges({
  activeSystems,
  enabledSystems,
  onToggle,
}: {
  /** The constellation identifiers present in the data. */
  activeSystems: string[];
  /** Which constellations are currently enabled (not excluded). If omitted, all active are enabled. */
  enabledSystems?: string[];
  /** Called when user clicks a badge to toggle it. If omitted, badges are not interactive. */
  onToggle?: (sys: string) => void;
}) {
  const t = getChartTheme();
  const interactive = !!onToggle;
  return (
    <span className="grid grid-cols-4 gap-1.5 items-center py-1">
      {ALL_SYSTEMS.map((s) => {
        const inData = activeSystems.includes(s);
        const enabled = enabledSystems ? enabledSystems.includes(s) : inData;
        const active = inData && enabled;
        const c = systemColor(s);

        const badge = (
          <span
            key={s}
            role={interactive && inData ? 'button' : undefined}
            tabIndex={interactive && inData ? 0 : undefined}
            onKeyDown={
              interactive && inData
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggle(s);
                    }
                  }
                : undefined
            }
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none${
              interactive && inData
                ? ' cursor-pointer transition-all hover:scale-105'
                : ''
            }${interactive && inData && !enabled ? ' opacity-40' : ''}`}
            style={
              active
                ? {
                    backgroundColor: `${c}18`,
                    color: c,
                    border: `1px solid ${c}30`,
                  }
                : {
                    backgroundColor: 'transparent',
                    color: t.canvasText + '0.2)',
                    border: `1px solid ${t.canvasText}0.08)`,
                  }
            }
            onClick={interactive && inData ? () => onToggle(s) : undefined}
            title={
              interactive && inData
                ? `${enabled ? 'Exclude' : 'Include'} ${systemName(s)}`
                : systemName(s)
            }
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: active ? c : t.canvasText + '0.15)' }}
            />
            {systemName(s)}
          </span>
        );
        return badge;
      })}
    </span>
  );
}
