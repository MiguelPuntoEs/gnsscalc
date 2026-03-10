import { useEffect, useState } from 'react';
import { getGpsLeap, getGpsTime, getWeekNumber, MILLISECONDS_IN_SECOND } from 'gnss-js';

export default function CurrentGpsTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => {
      const utcNow = new Date();
      const gpsLeap = getGpsLeap(utcNow);
      setNow(new Date(utcNow.getTime() + gpsLeap * MILLISECONDS_IN_SECOND));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const gpsSeconds = getGpsTime(now) / MILLISECONDS_IN_SECOND;
  const week = getWeekNumber(now);
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1]?.slice(0, -1);

  return (
    <div className="flex flex-wrap gap-4 mb-6">
      <div className="flex-1 min-w-36 rounded-md border border-border px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-fg/60 mb-1">GPS Date</div>
        <div className="tabular-nums font-semibold">{dateStr} <span className="text-fg/80">{timeStr}</span></div>
      </div>
      <div className="flex-1 min-w-36 rounded-md border border-border px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-fg/60 mb-1">GPS Week</div>
        <div className="tabular-nums font-semibold text-lg">{week}</div>
      </div>
      <div className="flex-1 min-w-36 rounded-md border border-border px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-fg/60 mb-1">GPS Seconds</div>
        <div className="tabular-nums font-semibold text-lg">{Math.floor(gpsSeconds)}</div>
      </div>
    </div>
  );
}
