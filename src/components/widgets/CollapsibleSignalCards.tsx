'use client';

import { useState } from 'react';

export interface EvidenceCitation {
  id: string;
  creatorChannel: string;
  videoTitle: string;
  videoId: string;
  evidenceText: string;
  timeSavedMins: number | null;
  timestamp?: string;
  duration?: string;
}

export interface EmergingSignalTheme {
  id: string;
  rankIndex: string;
  topicTitle: string;
  macroTakeaway: string;
  agreementPercentage: number;
  evidenceStrength: 'Low' | 'Medium' | 'High';
  totalCreatorsCount: number;
  totalVideosLinked: number;
  citationsList: EvidenceCitation[];
  trendDirection: 'growing' | 'stable' | 'declining';
  whyItMatters: string;
  recommendedActions: string[];
  contrarianView: string;
  opportunitySignal: 'High' | 'Medium' | 'Low';
}

interface Props {
  themes: EmergingSignalTheme[];
  loading?: boolean;
  onAnalyze?: (url: string) => void;
}

const TREND = {
  growing:   { icon: "↑", label: "Growing",   color: "text-emerald-300" },
  stable:    { icon: "→", label: "Stable",     color: "text-white/60"   },
  declining: { icon: "↓", label: "Declining",  color: "text-red-300"    },
};

// ─── Grid card ────────────────────────────────────────────────────────────────
interface CardProps {
  theme: EmergingSignalTheme;
  isOpen: boolean;
  onSelect: () => void;
}

function IntelligenceGridCard({ theme, isOpen, onSelect }: CardProps) {
  const trend = TREND[theme.trendDirection] ?? TREND.stable;

  return (
    <div
      onClick={onSelect}
      className={`border rounded-xl p-4 flex flex-col justify-between h-48 transition-all duration-200 cursor-pointer select-none group ${
        isOpen
          ? 'bg-[#2d5490] border-[#6096ba] ring-1 ring-white/10 shadow-md'
          : 'bg-[#274c77] border-[#1e3a5f] hover:bg-[#2d5490] hover:border-[#6096ba]/60 hover:shadow-sm'
      }`}
    >
      {/* Top section */}
      <div className="space-y-2 min-h-0 flex-1 overflow-hidden">
        <div className="flex justify-between items-center text-[10px] font-mono gap-2">
          <span className="bg-white/10 text-white border border-white/20 px-2 py-0.5 rounded font-black shrink-0">
            {theme.rankIndex}
          </span>
          <div className="flex items-center gap-2 text-white/60 min-w-0">
            {theme.opportunitySignal === 'High' && (
              <span className="text-[8px] font-mono font-black text-emerald-300 bg-white/10 border border-emerald-300/30 px-1.5 py-0.5 rounded shrink-0">
                High Opp
              </span>
            )}
            <span className="truncate">{theme.totalCreatorsCount} creators · {theme.totalVideosLinked} videos</span>
          </div>
        </div>

        <h4 className="text-sm font-bold tracking-tight text-white font-mono uppercase leading-tight">
          {theme.topicTitle}
        </h4>

        <p className="text-xs text-white/70 leading-relaxed line-clamp-2">
          {theme.macroTakeaway}
        </p>
      </div>

      {/* Footer section */}
      <div className="space-y-2 pt-2 border-t border-white/15 mt-2 shrink-0">
        <div className="w-full bg-white/15 rounded-full h-1 overflow-hidden">
          <div
            className="bg-[#a3cef1] h-1 rounded-full transition-all duration-300"
            style={{ width: `${theme.agreementPercentage}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className={`font-bold ${trend.color}`}>{trend.icon} {trend.label}</span>
            <span className="text-white/40">·</span>
            <span className="text-white font-bold" title="WatchFilter's own editorial read — not a YouTube metric">
              {theme.agreementPercentage >= 70 ? "Strong" : theme.agreementPercentage >= 40 ? "Moderate" : "Weak"} agreement
            </span>
          </div>

          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors ${
            isOpen
              ? 'bg-white/15 text-white border-white/30'
              : 'bg-white/10 text-white/70 border-white/20 group-hover:text-white group-hover:border-white/30'
          }`}>
            <span>Sources</span>
            <span
              className={`text-[8px] transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
              style={{ display: 'inline-block' }}
            >▼</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Full-width audit trail drawer ────────────────────────────────────────────
function InlineAuditTrailDrawer({ theme, onAnalyze }: { theme: EmergingSignalTheme; onAnalyze?: (url: string) => void }) {
  const auditSlug = theme.topicTitle.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full bg-[#f5f9fe] border border-[#a3cef1]/50 rounded-xl p-4 space-y-4 border-t-2 border-t-[#6096ba]/60">

      {/* Banner */}
      <div className="flex justify-between items-center border-b border-[#a3cef1]/30 pb-2 gap-4">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#274c77] font-bold flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6096ba] animate-pulse shrink-0" />
          <span className="truncate">
            Verified Audit Trail —{" "}
            <strong className="text-[#274c77] font-sans tracking-normal normal-case">{theme.topicTitle}</strong>
          </span>
        </span>
        <a
          href={`/reports/${auditSlug}`}
          className="text-[10px] font-mono text-[#8b8c89] hover:text-[#6096ba] transition-colors shrink-0"
          onClick={e => e.stopPropagation()}
        >
          Full Transcript Logs →
        </a>
      </div>

      {/* Source citation cards */}
      {theme.citationsList.length === 0 ? (
        <p className="text-center text-xs font-mono text-[#8b8c89] py-4 italic">
          No supporting source citations indexed for this consensus entity.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {theme.citationsList.map(citation => {
            const thumbUrl = `https://img.youtube.com/vi/${citation.videoId}/mqdefault.jpg`;
            const watchUrl = `https://www.youtube.com/watch?v=${citation.videoId}`;
            const savedLabel = citation.timeSavedMins !== null && citation.timeSavedMins > 0
              ? `${citation.timeSavedMins} min`
              : null;

            return (
              <div
                key={citation.id}
                className="bg-white border border-[#a3cef1]/50 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start hover:border-[#6096ba]/50 hover:shadow-sm transition-all group/card"
                onClick={e => e.stopPropagation()}
              >
                {/* Thumbnail */}
                <div className="w-full sm:w-32 h-20 bg-[#e7ecef] rounded-lg overflow-hidden relative border border-[#a3cef1]/40 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl}
                    alt={citation.videoTitle}
                    className="w-full h-full object-cover opacity-60 group-hover/card:opacity-90 transition-opacity"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span className="absolute top-1 left-1 bg-[#274c77]/90 text-white font-mono text-[7px] font-black uppercase tracking-wider px-1 rounded-sm">
                    {theme.evidenceStrength} Signal
                  </span>
                  {citation.timestamp && (
                    <span className="absolute bottom-1 right-1 bg-white/90 border border-[#a3cef1]/50 text-[8px] font-mono px-1 rounded text-[#6096ba] font-bold">
                      @{citation.timestamp}
                    </span>
                  )}
                </div>

                {/* Citation details */}
                <div className="flex-1 space-y-2 w-full min-w-0">
                  <div className="flex justify-between items-center text-[10px] font-mono gap-2">
                    <span className="font-black text-[#274c77] uppercase truncate">{citation.creatorChannel}</span>
                    {savedLabel && (
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300/40 shrink-0 whitespace-nowrap">
                        -{savedLabel} Fluff
                      </span>
                    )}
                  </div>

                  <a href={watchUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    <h5 className="text-xs font-bold text-[#274c77] line-clamp-1 group-hover/card:text-[#6096ba] transition-colors tracking-tight">
                      {citation.videoTitle}
                    </h5>
                  </a>

                  {citation.evidenceText && (
                    <div className="bg-[#a3cef1]/15 border-l-2 border-[#6096ba]/50 rounded-r-md p-2">
                      <p className="text-[11px] text-[#274c77] leading-normal italic">
                        &ldquo;{citation.evidenceText}&rdquo;
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end pt-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); onAnalyze ? onAnalyze(watchUrl) : window.open(watchUrl, '_blank'); }}
                      className="text-[9px] font-mono font-bold bg-[#274c77] hover:bg-[#2d5490] text-white border border-[#1e3a5f] px-2 py-0.5 rounded transition-colors uppercase tracking-wider cursor-pointer"
                    >
                      Filter Insights ↗
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Why It Matters + Contrarian + Actions */}
      {(theme.whyItMatters || theme.contrarianView || theme.recommendedActions.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-[#a3cef1]/30">

          {theme.whyItMatters && (
            <div className="space-y-1.5">
              <span className="text-[9px] font-mono font-black text-[#8b8c89] uppercase tracking-widest block">Why It Matters</span>
              <p className="text-xs text-[#274c77] leading-relaxed pl-3 border-l-2 border-[#6096ba]/40">
                {theme.whyItMatters}
              </p>
            </div>
          )}

          {theme.contrarianView && (
            <div className="bg-amber-50 border border-amber-300/40 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-amber-500 text-xs">⚡</span>
                <span className="text-[9px] font-mono font-black text-amber-600 uppercase tracking-widest">Contrarian View</span>
              </div>
              <p className="text-[10px] text-[#274c77] leading-relaxed italic">{theme.contrarianView}</p>
            </div>
          )}

          {theme.recommendedActions.length > 0 && (
            <div className="space-y-2">
              <span className="text-[9px] font-mono font-black text-[#8b8c89] uppercase tracking-widest block">Suggested Actions</span>
              {theme.recommendedActions.slice(0, 3).map((action, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-[#274c77]">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[#274c77] text-white font-black text-[8px] flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  {action}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function CollapsibleSignalCards({ themes, loading, onAnalyze }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading && !themes.length) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-48 bg-[#274c77] border border-[#1e3a5f] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!themes.length) {
    return <p className="text-xs text-[#8b8c89] font-mono">No signal themes detected yet.</p>;
  }

  const toggle = (id: string) => setOpenId(prev => prev === id ? null : id);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {themes.map(theme => (
          <IntelligenceGridCard
            key={theme.id}
            theme={theme}
            isOpen={openId === theme.id}
            onSelect={() => toggle(theme.id)}
          />
        ))}
      </div>

      {openId && themes.find(t => t.id === openId) && (
        <InlineAuditTrailDrawer theme={themes.find(t => t.id === openId)!} onAnalyze={onAnalyze} />
      )}
    </div>
  );
}
