export interface OpportunityAlert {
  id: number;
  type: "Critical" | "Emerging" | "Stable";
  label: string;
  delta: string;
  creators?: number;
  videos?: number;
  evidenceCount?: number;
  whyItMatters?: string;
  whyNow?: string;
  riskFactors?: string;
  suggestedAction?: string;
}

interface Props {
  alerts: OpportunityAlert[];
  loading?: boolean;
}

const TYPE_STYLE: Record<OpportunityAlert["type"], { card: string; badge: string; label: string }> = {
  Critical: {
    card:  "border-emerald-500/25 bg-emerald-500/5",
    badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    label: "High Conviction",
  },
  Emerging: {
    card:  "border-blue-500/25 bg-blue-500/5",
    badge: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    label: "Emerging Signal",
  },
  Stable: {
    card:  "border-slate-700/60 bg-slate-800/20",
    badge: "text-slate-400 bg-slate-800 border-slate-700",
    label: "Active Track",
  },
};

export function OpportunityAlertsWidget({ alerts, loading }: Props) {
  return (
    <>
      <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
        <div>
          <h3 className="text-sm font-black font-mono tracking-wider text-slate-300 uppercase">
            🚨 Opportunity Alerts
          </h3>
          <p className="text-xs text-slate-500 font-mono mt-0.5">Ranked by evidence strength and creator conviction</p>
        </div>
        <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          {alerts.length} Active
        </span>
      </div>

      {loading && !alerts.length ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 rounded-xl border border-slate-800 bg-[#0e131d] animate-pulse h-28" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <p className="text-xs text-slate-500 font-mono">No active opportunity alerts.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`rounded-xl border p-4 space-y-3 transition-all hover:border-slate-600 ${TYPE_STYLE[alert.type].card}`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border shrink-0 ${TYPE_STYLE[alert.type].badge}`}>
                      {TYPE_STYLE[alert.type].label}
                    </span>
                    <span className={`text-[10px] font-mono font-black shrink-0 ${
                      alert.delta.startsWith("+") ? "text-emerald-400" :
                      alert.delta.startsWith("-") ? "text-red-400" : "text-slate-400"
                    }`}>{alert.delta}</span>
                  </div>
                  <p className="text-sm font-black text-white tracking-tight">{alert.label}</p>
                </div>
              </div>

              {/* Why Now */}
              {alert.whyNow && (
                <div className="space-y-0.5">
                  <span className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-widest">Why Now</span>
                  <p className="text-xs text-slate-300 leading-relaxed">{alert.whyNow}</p>
                </div>
              )}

              {/* Evidence row */}
              {(alert.creators !== undefined || alert.videos !== undefined || alert.evidenceCount !== undefined) && (
                <div className="flex items-center gap-4 pt-2 border-t border-slate-800/60">
                  {alert.creators !== undefined && (
                    <div>
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Creators</span>
                      <span className="text-xs font-black text-white">{alert.creators}</span>
                    </div>
                  )}
                  {alert.videos !== undefined && (
                    <div>
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Videos</span>
                      <span className="text-xs font-black text-white">{alert.videos}</span>
                    </div>
                  )}
                  {alert.evidenceCount !== undefined && alert.evidenceCount > 0 && (
                    <div>
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">References</span>
                      <span className="text-xs font-black text-purple-400">{alert.evidenceCount}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Risk Factors */}
              {alert.riskFactors && (
                <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2">
                  <span className="text-red-400 text-xs shrink-0 mt-0.5">⚠</span>
                  <div>
                    <span className="text-[9px] font-mono font-black text-red-400 uppercase tracking-wider block mb-0.5">Risk</span>
                    <p className="text-[10px] font-mono text-slate-400 leading-relaxed">{alert.riskFactors}</p>
                  </div>
                </div>
              )}

              {/* Suggested Action */}
              {alert.suggestedAction && (
                <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/15 rounded-lg px-3 py-2">
                  <span className="text-blue-400 text-xs shrink-0 mt-0.5">→</span>
                  <div>
                    <span className="text-[9px] font-mono font-black text-blue-400 uppercase tracking-wider block mb-0.5">Suggested Action</span>
                    <p className="text-[10px] font-mono text-slate-300 leading-relaxed">{alert.suggestedAction}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
