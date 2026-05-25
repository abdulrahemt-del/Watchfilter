interface Metric {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  trend?: "up" | "down" | "flat";
}

interface Props {
  metrics: Metric[];
  loading?: boolean;
}

function Sparkline({ trend }: { trend?: "up" | "down" | "flat" }) {
  const pts = trend === "up"
    ? [4, 5, 3, 6, 4, 7, 9, 11]
    : trend === "down"
    ? [11, 9, 10, 7, 8, 5, 4, 3]
    : [6, 7, 6, 7, 6, 7, 6, 7];

  const W = 40, H = 16, PAD = 1;
  const max = Math.max(...pts), min = Math.min(...pts);
  const range = max - min || 1;
  const xStep = (W - PAD * 2) / (pts.length - 1);

  const path = pts.map((v, i) => {
    const x = (PAD + i * xStep).toFixed(1);
    const y = (H - PAD - ((v - min) / range) * (H - PAD * 2)).toFixed(1);
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  const color = trend === "up" ? "#34d399" : trend === "down" ? "#f87171" : "#64748b";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CorePulseMetrics({ metrics, loading }: Props) {
  if (loading && !metrics.length) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-[#101520] border border-[#c0d6df]/80 rounded-xl p-4 animate-pulse">
            <div className="h-2 w-16 bg-[#c0d6df] rounded mb-3" />
            <div className="h-6 w-12 bg-slate-700 rounded mb-2" />
            <div className="h-1.5 w-10 bg-[#c0d6df] rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {metrics.map((m, i) => (
        <div key={i} className="bg-[#101520] border border-[#c0d6df]/80 rounded-xl p-4 space-y-2 hover:border-[#a8bfcb] transition-colors">
          <p className="text-[9px] font-mono font-bold text-[#6b8a99] tracking-widest uppercase">{m.label}</p>
          <div className="flex items-end justify-between gap-1">
            <p className={`text-xl font-black tracking-tight leading-none ${m.color ?? "text-white"}`}>{m.value}</p>
            <Sparkline trend={m.trend} />
          </div>
          {m.sub && <p className="text-[9px] text-[#6b8a99] font-mono">{m.sub}</p>}
        </div>
      ))}
    </div>
  );
}
