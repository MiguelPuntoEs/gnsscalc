import { useEffect, useState } from 'react';
import {
  getGpsLeap,
  getGpsTime,
  getWeekNumber,
  MILLISECONDS_IN_SECOND,
} from 'gnss-js/time';

function StatCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-36 rounded-xl bg-bg-raised border border-border/60 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-fg/35 mb-1">
        {label}
      </div>
      <div className="tabular-nums font-semibold">{children}</div>
    </div>
  );
}

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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <StatCard label="GPS Date">
        {dateStr} <span className="text-fg/60">{timeStr}</span>
      </StatCard>
      <StatCard label="GPS Week">
        <span className="text-lg">{week}</span>
      </StatCard>
      <StatCard label="GPS Seconds">
        <span className="text-lg">{Math.floor(gpsSeconds)}</span>
      </StatCard>
    </div>
  );
}
