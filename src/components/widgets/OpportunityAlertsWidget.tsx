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
    card:  "border-emerald-400/30 bg-emerald-50",
    badge: "text-emerald-700 bg-emerald-100 border-emerald-300/60",
    label: "High Conviction",
  },
  Emerging: {
    card:  "border-[#6096ba]/30 bg-[#a3cef1]/10",
    badge: "text-[#274c77] bg-[#a3cef1]/20 border-[#6096ba]/30",
    label: "Emerging Signal",
  },
  Stable: {
    card:  "border-[#a3cef1]/40 bg-white",
    badge: "text-[#8b8c89] bg-[#e7ecef] border-[#a3cef1]/40",
    label: "Active Track",
  },
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
            <div key={i} className="p-4 rounded-xl border border-[#a3cef1]/40 bg-white animate-pulse h-28" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <p className="text-xs text-[#8b8c89] font-mono">No active opportunity alerts.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`rounded-xl border p-4 space-y-3 transition-all hover:border-[#6096ba]/50 ${TYPE_STYLE[alert.type].card}`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border shrink-0 ${TYPE_STYLE[alert.type].badge}`}>
                      {TYPE_STYLE[alert.type].label}
                    </span>
                    <span className={`text-[10px] font-mono font-black shrink-0 ${
                      alert.delta.startsWith("+") ? "text-emerald-600" :
                      alert.delta.startsWith("-") ? "text-red-500" : "text-[#8b8c89]"
                    }`}>{alert.delta}</span>
                  </div>
                  <p className="text-sm font-black text-[#274c77] tracking-tight">{alert.label}</p>
                </div>
              </div>

              {/* Why Now */}
              {alert.whyNow && (
                <div className="space-y-0.5">
                  <span className="text-[11px] font-mono font-black text-[#8b8c89] uppercase tracking-widest">Why Now</span>
                  <p className="text-sm text-[#274c77] leading-relaxed">{alert.whyNow}</p>
                </div>
              )}

              {/* Evidence row */}
              {(alert.creators !== undefined || alert.videos !== undefined || alert.evidenceCount !== undefined) && (
                <div className="flex items-center gap-4 pt-2 border-t border-[#a3cef1]/30">
                  {alert.creators !== undefined && (
                    <div>
                      <span className="text-[9px] font-mono text-[#8b8c89] uppercase tracking-wider block">Creators</span>
                      <span className="text-xs font-black text-[#274c77]">{alert.creators}</span>
                    </div>
                  )}
                  {alert.videos !== undefined && (
                    <div>
                      <span className="text-[9px] font-mono text-[#8b8c89] uppercase tracking-wider block">Videos</span>
                      <span className="text-xs font-black text-[#274c77]">{alert.videos}</span>
                    </div>
                  )}
                  {alert.evidenceCount !== undefined && alert.evidenceCount > 0 && (
                    <div>
                      <span className="text-[9px] font-mono text-[#8b8c89] uppercase tracking-wider block">References</span>
                      <span className="text-xs font-black text-[#6096ba]">{alert.evidenceCount}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Risk Factors */}
              {alert.riskFactors && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-300/40 rounded-lg px-3 py-2">
                  <span className="text-red-500 text-xs shrink-0 mt-0.5">⚠</span>
                  <div>
                    <span className="text-[9px] font-mono font-black text-red-600 uppercase tracking-wider block mb-0.5">Risk</span>
                    <p className="text-[10px] font-mono text-[#274c77] leading-relaxed">{alert.riskFactors}</p>
                  </div>
                </div>
              )}

              {/* Suggested Action */}
              {alert.suggestedAction && (
                <div className="flex items-start gap-2 bg-[#a3cef1]/15 border border-[#6096ba]/25 rounded-lg px-3 py-2">
                  <span className="text-[#6096ba] text-xs shrink-0 mt-0.5">→</span>
                  <div>
                    <span className="text-[9px] font-mono font-black text-[#6096ba] uppercase tracking-wider block mb-0.5">Suggested Action</span>
                    <p className="text-[10px] font-mono text-[#274c77] leading-relaxed">{alert.suggestedAction}</p>
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
