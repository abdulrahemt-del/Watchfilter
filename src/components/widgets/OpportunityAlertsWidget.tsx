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

const TYPE_BADGE: Record<OpportunityAlert["type"], string> = {
  Critical: "text-emerald-300 bg-white/10 border-emerald-300/30",
  Emerging: "text-[#a3cef1] bg-white/10 border-[#a3cef1]/30",
  Stable:   "text-white/60 bg-white/10 border-white/20",
};

const TYPE_LABEL: Record<OpportunityAlert["type"], string> = {
  Critical: "High Conviction",
  Emerging: "Emerging Signal",
  Stable:   "Active Track",
};

export function OpportunityAlertsWidget({ alerts, loading }: Props) {
  return (
    <>
      <div className="flex justify-between items-center border-b border-[#a3cef1]/40 pb-3 mb-4">
        <div>
          <h3 className="text-sm font-black font-mono tracking-wider text-[#274c77] uppercase">
            🚨 Opportunity Alerts
          </h3>
          <p className="text-xs text-[#8b8c89] font-mono mt-0.5">Ranked by evidence strength and creator conviction</p>
        </div>
        <span className="text-[10px] text-emerald-700 font-mono bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300/50">
          {alerts.length} Active
        </span>
      </div>

      {loading && !alerts.length ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 rounded-xl border border-[#274c77]/30 bg-[#274c77] animate-pulse h-28" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <p className="text-xs text-[#8b8c89] font-mono">No active opportunity alerts.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className="rounded-xl border border-[#1e3a5f] bg-[#274c77] p-4 space-y-3 transition-all hover:bg-[#2d5490] hover:border-[#6096ba]/50 shadow-sm"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border shrink-0 ${TYPE_BADGE[alert.type]}`}>
                      {TYPE_LABEL[alert.type]}
                    </span>
                    <span className={`text-[10px] font-mono font-black shrink-0 ${
                      alert.delta.startsWith("+") ? "text-emerald-300" :
                      alert.delta.startsWith("-") ? "text-red-300" : "text-white/50"
                    }`}>{alert.delta}</span>
                  </div>
                  <p className="text-sm font-black text-white tracking-tight">{alert.label}</p>
                </div>
              </div>

              {/* Why Now */}
              {alert.whyNow && (
                <div className="space-y-0.5">
                  <span className="text-[11px] font-mono font-black text-[#a3cef1]/70 uppercase tracking-widest">Why Now</span>
                  <p className="text-sm text-white/85 leading-relaxed">{alert.whyNow}</p>
                </div>
              )}

              {/* Evidence row */}
              {(alert.creators !== undefined || alert.videos !== undefined || alert.evidenceCount !== undefined) && (
                <div className="flex items-center gap-4 pt-2 border-t border-white/10">
                  {alert.creators !== undefined && (
                    <div>
                      <span className="text-[9px] font-mono text-[#a3cef1]/60 uppercase tracking-wider block">Creators</span>
                      <span className="text-xs font-black text-white">{alert.creators}</span>
                    </div>
                  )}
                  {alert.videos !== undefined && (
                    <div>
                      <span className="text-[9px] font-mono text-[#a3cef1]/60 uppercase tracking-wider block">Videos</span>
                      <span className="text-xs font-black text-white">{alert.videos}</span>
                    </div>
                  )}
                  {alert.evidenceCount !== undefined && alert.evidenceCount > 0 && (
                    <div>
                      <span className="text-[9px] font-mono text-[#a3cef1]/60 uppercase tracking-wider block">References</span>
                      <span className="text-xs font-black text-[#a3cef1]">{alert.evidenceCount}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Risk Factors */}
              {alert.riskFactors && (
                <div className="flex items-start gap-2 bg-red-500/15 border border-red-300/20 rounded-lg px-3 py-2">
                  <span className="text-red-300 text-xs shrink-0 mt-0.5">⚠</span>
                  <div>
                    <span className="text-[9px] font-mono font-black text-red-300 uppercase tracking-wider block mb-0.5">Risk</span>
                    <p className="text-[10px] font-mono text-white/75 leading-relaxed">{alert.riskFactors}</p>
                  </div>
                </div>
              )}

              {/* Suggested Action */}
              {alert.suggestedAction && (
                <div className="flex items-start gap-2 bg-white/10 border border-[#a3cef1]/20 rounded-lg px-3 py-2">
                  <span className="text-[#a3cef1] text-xs shrink-0 mt-0.5">→</span>
                  <div>
                    <span className="text-[9px] font-mono font-black text-[#a3cef1] uppercase tracking-wider block mb-0.5">Suggested Action</span>
                    <p className="text-[10px] font-mono text-white/80 leading-relaxed">{alert.suggestedAction}</p>
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
