import Link from "next/link";

interface DrawerProps {
  themeName: string;
  consensus?: string;
  whyItMatters?: string;
  insights?: string[];
  recommendedActions?: string[];
  contrarianView?: string;
  opportunityTopics?: string[];
  featuredCreators?: string[];
  sources: {
    videoSnapId: string;
    title: string;
    channelName: string;
    duration: string;
    savedTime: string;
    thumbnail: string;
  }[];
  onAnalyzeVideo?: (videoId: string) => void;
}

export function ConsensusDropdownDrawer({
  themeName,
  consensus,
  whyItMatters,
  insights = [],
  recommendedActions = [],
  contrarianView,
  opportunityTopics = [],
  featuredCreators = [],
  sources,
  onAnalyzeVideo,
}: DrawerProps) {
  const themeSlug = encodeURIComponent(themeName.toLowerCase().replace(/\s+/g, "-"));
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="bg-white border-x border-b border-blue-500/60/40 rounded-b-2xl -mt-3 mb-4 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">

      {/* Header strip */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#f8fafc] border-b border-[#c0d6df]">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6b8a99]">
          Intelligence Report · {themeName}
        </span>
        <Link
          href={`/reports/consensus/${themeSlug}`}
          className="text-[11px] font-mono font-bold text-[#4a6fa5] hover:text-[#4a6fa5] transition-colors flex items-center gap-1"
        >
          View Full Report →
        </Link>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* Consensus Statement */}
        {consensus && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6b8a99]">
              Consensus Statement
            </p>
            <p className="text-sm font-semibold text-[#0f2535] leading-snug">
              &ldquo;{consensus}&rdquo;
            </p>
          </div>
        )}

        {/* Why It Matters */}
        {whyItMatters && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6b8a99]">
              Why It Matters
            </p>
            <p className="text-xs font-mono text-[#6b8a99] leading-relaxed bg-blue-500/5 border border-blue-500/15 rounded-lg px-4 py-2.5">
              {whyItMatters}
            </p>
          </div>
        )}

        {/* Two-column: Evidence + Opportunity Signals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Most Important Evidence */}
          {insights.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6b8a99]">
                Most Important Evidence
              </p>
              <div className="space-y-1.5">
                {insights.slice(0, 4).map((signal, i) => (
                  <div key={i} className="flex gap-2 text-[11px] font-mono text-[#6b8a99] leading-relaxed">
                    <span className="text-blue-500/60 shrink-0 mt-0.5">›</span>
                    <span>{signal}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opportunity Signals */}
          {opportunityTopics.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6b8a99]">
                Opportunity Signals
              </p>
              <div className="flex flex-wrap gap-1.5">
                {opportunityTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="text-[11px] font-mono font-bold bg-emerald-500/10 text-[#0a7a4a] border border-emerald-500/20 px-2.5 py-1 rounded-lg"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Contrarian View */}
        {contrarianView && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6b8a99]">
              Contrarian View
            </p>
            <p className="text-[11px] font-mono text-[#b45309]/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-4 py-2.5 leading-relaxed italic">
              {contrarianView}
            </p>
          </div>
        )}

        {/* Two-column: Supporting Creators + Recommended Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Supporting Creators */}
          {featuredCreators.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6b8a99]">
                Top Contributors
              </p>
              <div className="space-y-1.5">
                {featuredCreators.slice(0, 3).map((creator, i) => (
                  <div key={creator} className="flex items-center gap-2.5">
                    <span className="text-sm">{medals[i] ?? "·"}</span>
                    <span className="text-xs font-mono font-bold text-[#1a2e3b]">{creator}</span>
                  </div>
                ))}
                {featuredCreators.length > 3 && (
                  <p className="text-[10px] font-mono text-[#6b8a99] pl-6">
                    +{featuredCreators.length - 3} more creators
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Recommended Actions */}
          {recommendedActions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6b8a99]">
                Recommended Actions
              </p>
              <div className="space-y-1.5">
                {recommendedActions.map((action, i) => (
                  <div key={i} className="flex gap-2 text-[11px] font-mono text-[#6b8a99] leading-relaxed">
                    <span className="text-emerald-500 shrink-0 font-bold mt-0.5">✓</span>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Supporting Videos */}
        {sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6b8a99]">
              Supporting Videos ({sources.length})
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sources.map((vid) => (
                <div
                  key={vid.videoSnapId}
                  className="bg-[#161d2b] border border-[#c0d6df]/80 rounded-xl p-3 flex gap-3 hover:border-[#a8bfcb] transition-all group"
                >
                  <div className="w-20 h-14 bg-[#f0f6f9] rounded-lg overflow-hidden shrink-0 border border-[#c0d6df]">
                    {vid.thumbnail ? (
                      <img
                        src={vid.thumbnail}
                        alt={vid.title}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-700 text-base">▶</div>
                    )}
                  </div>
                  <div className="flex flex-col justify-between min-w-0">
                    <div className="space-y-0.5">
                      <h6 className="text-[11px] font-bold text-[#1a2e3b] tracking-tight leading-snug line-clamp-2">
                        {vid.title}
                      </h6>
                      <p className="text-[10px] font-mono text-[#6b8a99]">{vid.channelName}</p>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      {vid.duration && (
                        <span className="text-[9px] font-mono text-[#4f6d7a]">{vid.duration}</span>
                      )}
                      {vid.savedTime && (
                        <span className="text-[9px] font-mono font-bold bg-emerald-500/10 text-[#0a7a4a] border border-emerald-500/20 px-1.5 py-0 rounded">
                          {vid.savedTime}
                        </span>
                      )}
                      {onAnalyzeVideo && (
                        <button
                          className="text-[9px] font-mono text-[#4a6fa5] hover:text-[#4a6fa5] hover:underline ml-auto"
                          onClick={(e) => { e.stopPropagation(); onAnalyzeVideo(vid.videoSnapId); }}
                        >
                          Analyze →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
