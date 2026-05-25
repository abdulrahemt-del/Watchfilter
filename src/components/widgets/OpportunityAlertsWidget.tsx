export interface OpportunityAlert {
  id: number;
  type: "Critical" | "Emerging" | "Stable";
  label: string;
  delta: string;
  creators?: number;
  videos?: number;
  evidenceCount?: number;
  whyItMatters?: string;
}

interface Props {
  alerts: OpportunityAlert[];
  loading?: boolean;
}

const TYPE_STYLE: Record<OpportunityAlert["type"], { card: string; badge: string }> = {
  Critical: {
    card:  "border-emerald-500/30 bg-emerald-500/5",
    badge: "text-[#0a7a4a] bg-emerald-500/10 border-emerald-500/20",
  },
  Emerging: {
    card:  "border-purple-500/30 bg-purple-500/5",
    badge: "text-[#6b4fbb] bg-purple-500/10 border-purple-500/20",
  },
  Stable: {
    card:  "border-[#a8bfcb] bg-[#c0d6df]/20",
    badge: "text-[#6b8a99] bg-[#c0d6df]/60 border-[#a8bfcb]",
  },
};

const STRENGTH_LABEL: Record<string, string> = {
  Critical: "Strong",
  Emerging: "Moderate",
  Stable:   "Stable",
};

export function OpportunityAlertsWidget({ alerts, loading }: Props) {
  return (
    <>
      <div className="flex justify-between items-center border-b border-slate-700 pb-2">
        <h3 className="text-xs font-bold text-[#6b8a99] tracking-wider uppercase font-mono">
          🚨 Alpha Opportunity Alerts
        </h3>
        <span className="text-[10px] text-[#0a7a4a] font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">
          {alerts.length} Active
        </span>
      </div>

      {loading && !alerts.length ? (
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-3 rounded-lg border border-[#c0d6df] bg-[#c0d6df]/20 animate-pulse h-16" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <p className="text-xs text-[#6b8a99] font-mono pt-4">No active opportunity alerts.</p>
      ) : (
        <div className="space-y-3 pt-2">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border transition-all hover:bg-[#f0f6f9] ${TYPE_STYLE[alert.type].card}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[9px] font-mono uppercase tracking-widest block opacity-70 text-[#6b8a99]">
                    {STRENGTH_LABEL[alert.type]} Opportunity
                  </span>
                  <p className="text-xs font-bold text-[#0f2535] tracking-tight truncate">{alert.label}</p>
                </div>
                <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border shrink-0 ${TYPE_STYLE[alert.type].badge}`}>
                  {alert.delta}
                </span>
              </div>

              {/* Evidence row */}
              {(alert.creators !== undefined || alert.videos !== undefined || alert.evidenceCount !== undefined) && (
                <div className="flex items-center gap-3 pt-1 border-t border-[#c0d6df]">
                  {alert.creators !== undefined && (
                    <span className="text-[9px] font-mono text-[#6b8a99]">
                      <span className="text-[#6b8a99] font-bold">{alert.creators}</span> creator{alert.creators !== 1 ? "s" : ""}
                    </span>
                  )}
                  {alert.videos !== undefined && (
                    <span className="text-[9px] font-mono text-[#6b8a99]">
                      <span className="text-[#6b8a99] font-bold">{alert.videos}</span> video{alert.videos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {alert.evidenceCount !== undefined && alert.evidenceCount > 0 && (
                    <span className="text-[9px] font-mono text-[#6b4fbb] font-bold">
                      {alert.evidenceCount} signals
                    </span>
                  )}
                </div>
              )}

              {/* Why it matters */}
              {alert.whyItMatters && (
                <p className="text-[9px] font-mono text-[#6b8a99] leading-relaxed mt-1.5 italic">
                  {alert.whyItMatters}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
