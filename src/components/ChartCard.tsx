/** Shared card wrapper for recharts visualizations. */
export default function ChartCard({
  title,
  children,
  height,
}: {
  title: string;
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">{title}</span>
      <div style={{ width: '100%', height: height ?? 180 }}>
        {children}
      </div>
    </div>
  );
}
