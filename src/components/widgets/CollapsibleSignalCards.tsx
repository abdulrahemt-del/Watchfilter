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
}

const TREND = {
  growing:   { icon: "↑", label: "Growing",  color: "text-emerald-400" },
  stable:    { icon: "→", label: "Stable",   color: "text-slate-400"   },
  declining: { icon: "↓", label: "Declining", color: "text-red-400"    },
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
      className={`bg-[#101520] border rounded-xl p-4 flex flex-col justify-between h-48 transition-all duration-200 cursor-pointer select-none group ${
        isOpen
          ? 'border-blue-500 bg-[#121927] ring-1 ring-blue-500/10 shadow-lg shadow-blue-500/5'
          : 'border-slate-800/80 hover:border-slate-700 hover:bg-[#111724] hover:shadow-[0_0_20px_rgba(59,130,246,0.08)]'
      }`}
    >
      {/* Top section */}
      <div className="space-y-2 min-h-0 flex-1 overflow-hidden">
        {/* Meta row: rank + opportunity + creator/video count */}
        <div className="flex justify-between items-center text-[10px] font-mono gap-2">
          <span className="bg-blue-950/60 text-blue-400 border border-blue-900/40 px-2 py-0.5 rounded font-black shrink-0">
            {theme.rankIndex}
          </span>
          <div className="flex items-center gap-2 text-slate-500 min-w-0">
            {theme.opportunitySignal === 'High' && (
              <span className="text-[8px] font-mono font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">
                High Opp
              </span>
            )}
            <span className="truncate">{theme.totalCreatorsCount} creators · {theme.totalVideosLinked} videos</span>
          </div>
        </div>

        {/* Title */}
        <h4 className="text-sm font-bold tracking-tight text-white font-mono uppercase leading-tight">
          {theme.topicTitle}
        </h4>

        {/* Summary */}
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
          {theme.macroTakeaway}
        </p>
      </div>

      {/* Footer section */}
      <div className="space-y-2 pt-2 border-t border-slate-900 mt-2 shrink-0">
        {/* Agreement progress bar */}
        <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden">
          <div
            className="bg-blue-500 h-1 rounded-full transition-all duration-300"
            style={{ width: `${theme.agreementPercentage}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-[10px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className={`font-bold ${trend.color}`}>{trend.icon} {trend.label}</span>
            <span className="text-slate-700">·</span>
            <span className="text-slate-400 font-bold">{theme.agreementPercentage}%</span>
          </div>

          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors ${
            isOpen
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
              : 'bg-slate-950 text-slate-500 border-slate-800 group-hover:text-slate-400 group-hover:border-slate-700'
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
function InlineAuditTrailDrawer({ theme }: { theme: EmergingSignalTheme }) {
  const auditSlug = theme.topicTitle.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full bg-[#090d14] border border-slate-800 rounded-xl p-4 space-y-4 border-t-2 border-t-blue-500/40">

      {/* Banner */}
      <div className="flex justify-between items-center border-b border-slate-900 pb-2 gap-4">
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
          <span className="truncate">
            Verified Audit Trail —{" "}
            <strong className="text-blue-400 font-sans tracking-normal normal-case">{theme.topicTitle}</strong>
          </span>
        </span>
        <a
          href={`/reports/${auditSlug}`}
          className="text-[10px] font-mono text-slate-500 hover:text-blue-400 transition-colors shrink-0"
          onClick={e => e.stopPropagation()}
        >
          Full Transcript Logs →
        </a>
      </div>

      {/* Source citation cards */}
      {theme.citationsList.length === 0 ? (
        <p className="text-center text-xs font-mono text-slate-600 py-4 italic">
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
                className="bg-[#101520] border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start hover:border-slate-700 transition-all group/card"
                onClick={e => e.stopPropagation()}
              >
                {/* Thumbnail with overlay badges */}
                <div className="w-full sm:w-32 h-20 bg-slate-950 rounded-lg overflow-hidden relative border border-slate-800 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl}
                    alt={citation.videoTitle}
                    className="w-full h-full object-cover opacity-40 group-hover/card:opacity-70 transition-opacity"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span className="absolute top-1 left-1 bg-blue-600/90 border border-blue-500/20 text-white font-mono text-[7px] font-black uppercase tracking-wider px-1 rounded-sm">
                    {theme.evidenceStrength} Signal
                  </span>
                  {citation.timestamp && (
                    <span className="absolute bottom-1 right-1 bg-slate-950/80 border border-slate-800 text-[8px] font-mono px-1 rounded text-purple-400 font-bold">
                      @{citation.timestamp}
                    </span>
                  )}
                </div>

                {/* Citation details */}
                <div className="flex-1 space-y-2 w-full min-w-0">
                  <div className="flex justify-between items-center text-[10px] font-mono gap-2">
                    <span className="font-black text-white uppercase truncate">{citation.creatorChannel}</span>
                    {savedLabel && (
                      <span className="text-emerald-400 font-bold bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10 shrink-0 whitespace-nowrap">
                        -{savedLabel} Fluff
                      </span>
                    )}
                  </div>

                  <a href={watchUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    <h5 className="text-xs font-bold text-slate-200 line-clamp-1 group-hover/card:text-blue-400 transition-colors tracking-tight">
                      {citation.videoTitle}
                    </h5>
                  </a>

                  {citation.evidenceText && (
                    <div className="bg-[#141a26] border-l-2 border-purple-500/40 rounded-r-md p-2">
                      <p className="text-[11px] text-white leading-normal italic">
                        &ldquo;{citation.evidenceText}&rdquo;
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end pt-0.5">
                    <a
                      href={watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-[9px] font-mono font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded transition-colors uppercase tracking-wider"
                    >
                      Analyze Fluff ↗
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Why It Matters + Contrarian + Actions */}
      {(theme.whyItMatters || theme.contrarianView || theme.recommendedActions.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800/50">

          {theme.whyItMatters && (
            <div className="space-y-1.5">
              <span className="text-[9px] font-mono font-black text-slate-600 uppercase tracking-widest block">Why It Matters</span>
              <p className="text-xs text-white leading-relaxed pl-3 border-l-2 border-blue-500/40">
                {theme.whyItMatters}
              </p>
            </div>
          )}

          {theme.contrarianView && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400 text-xs">⚡</span>
                <span className="text-[9px] font-mono font-black text-amber-400 uppercase tracking-widest">Contrarian View</span>
              </div>
              <p className="text-[10px] text-white leading-relaxed italic">{theme.contrarianView}</p>
            </div>
          )}

          {theme.recommendedActions.length > 0 && (
            <div className="space-y-2">
              <span className="text-[9px] font-mono font-black text-slate-600 uppercase tracking-widest block">Suggested Actions</span>
              {theme.recommendedActions.slice(0, 3).map((action, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-white">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600/70 text-white font-black text-[8px] flex items-center justify-center mt-0.5">
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
export function CollapsibleSignalCards({ themes, loading }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading && !themes.length) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-48 bg-[#101520] border border-slate-800/80 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!themes.length) {
    return <p className="text-xs text-slate-500 font-mono">No signal themes detected yet.</p>;
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
        <InlineAuditTrailDrawer theme={themes.find(t => t.id === openId)!} />
      )}
    </div>
  );
}
