"use client";

import { useState, useRef, useEffect } from "react";
import type {
  ResearchReport,
  ResearchTheme,
  RelatedSignal,
  ThemeSource,
  IntelligenceSignal,
} from "@/app/api/research/search/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ytUrl(videoId: string, ts: string | null): string {
  if (!ts) return `https://www.youtube.com/watch?v=${videoId}`;
  const parts = ts.split(":").map(Number);
  const secs =
    parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts.length === 2 ? parts[0] * 60 + parts[1]
    : parts[0];
  return `https://www.youtube.com/watch?v=${videoId}&t=${secs}s`;
}

const SIGNAL_COLOR: Record<string, string> = {
  "Very High": "#10b981",
  High: "#6ee7b7",
  Medium: "#fbbf24",
  Low: "#94a3b8",
};

const THEME_COLORS = [
  { accent: "#38bdf8", border: "rgba(56,189,248,0.28)",  bg: "rgba(56,189,248,0.06)"  },
  { accent: "#10b981", border: "rgba(16,185,129,0.28)",  bg: "rgba(16,185,129,0.06)"  },
  { accent: "#a78bfa", border: "rgba(167,139,250,0.28)", bg: "rgba(167,139,250,0.06)" },
  { accent: "#f97316", border: "rgba(249,115,22,0.28)",  bg: "rgba(249,115,22,0.06)"  },
  { accent: "#fbbf24", border: "rgba(251,191,36,0.28)",  bg: "rgba(251,191,36,0.06)"  },
  { accent: "#e879f9", border: "rgba(232,121,249,0.28)", bg: "rgba(232,121,249,0.06)" },
];

const CONFIDENCE_STYLE = {
  "Very High": { color: "#6ee7b7", icon: "◆", border: "rgba(110,231,183,0.35)", bg: "rgba(110,231,183,0.1)"  },
  High:        { color: "#10b981", icon: "●", border: "rgba(16,185,129,0.3)",   bg: "rgba(16,185,129,0.1)"  },
  Medium:      { color: "#38bdf8", icon: "◐", border: "rgba(56,189,248,0.3)",   bg: "rgba(56,189,248,0.1)"  },
  Low:         { color: "#fbbf24", icon: "◌", border: "rgba(251,191,36,0.25)",  bg: "rgba(251,191,36,0.08)" },
};

const CHAT_CATEGORIES = [
  { label: "Understand", color: "#38bdf8", chips: ["What is the strongest finding?", "Explain the top finding simply.", "What surprised experts most?"] },
  { label: "Verify",     color: "#10b981", chips: ["Show all supporting quotes.", "Which creators support this?", "Why is confidence rated this way?"] },
  { label: "Challenge",  color: "#fbbf24", chips: ["Who disagrees?", "Show the weakest evidence.", "What assumptions are being made?"] },
  { label: "Execute",    color: "#a78bfa", chips: ["Give me a 30-day action plan.", "Turn this into a checklist.", "What should I do first?"] },
  { label: "Explore",    color: "#f97316", chips: ["Show startup examples.", "Find similar themes.", "What related topics appear?"] },
];

const SUGGESTED = [
  "fundraising",
  "founder market fit",
  "hiring and team building",
  "customer acquisition",
  "product-market fit",
  "building in public",
  "B2B sales",
  "AI agents",
];

// ── Quote card ────────────────────────────────────────────────────────────────

function QuoteCard({ source, accent }: { source: ThemeSource; accent: string }) {
  const sigColor = SIGNAL_COLOR[source.signalStrength ?? ""] ?? "#94a3b8";
  const link = ytUrl(source.videoId, source.timestampStr);

  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: "rgba(8,16,28,0.6)", border: "1px solid #1e2d45" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-mono font-black text-slate-300 uppercase tracking-wider truncate">
            {source.creator}
          </p>
          <p className="text-xs font-mono text-slate-500 truncate">{source.videoTitle}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {source.signalStrength && (
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
              style={{ color: sigColor, background: `${sigColor}15`, border: `1px solid ${sigColor}35` }}>
              {source.signalStrength}
            </span>
          )}
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="text-xs font-mono font-bold px-2 py-0.5 rounded transition-colors"
            style={{ color: accent, border: `1px solid ${accent}40` }}>
            {source.timestampStr ? `@${source.timestampStr} ↗` : "Watch ↗"}
          </a>
        </div>
      </div>
      {source.quote && (
        <blockquote className="border-l-2 pl-3" style={{ borderColor: `${accent}50` }}>
          <p className="text-base text-slate-200 italic leading-relaxed">
            &ldquo;{source.quote}&rdquo;
          </p>
        </blockquote>
      )}
    </div>
  );
}

// ── Intelligence signal card ──────────────────────────────────────────────────

const SOURCE_LABEL: Record<IntelligenceSignal["source"], string> = {
  brief:     "Executive Brief",
  alert:     "Intelligence Alert",
  consensus: "Consensus Signal",
};

function IntelligenceSignalCard({ signal }: { signal: IntelligenceSignal }) {
  return (
    <div className="rounded-lg px-4 py-3 space-y-1.5"
      style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.15)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[10px] font-mono font-black text-amber-500/70 uppercase tracking-widest">
          {SOURCE_LABEL[signal.source]}
          {signal.topic && signal.topic !== signal.text ? ` · ${signal.topic}` : ""}
        </p>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-600">
          {signal.creators !== undefined && <span>{signal.creators} creators</span>}
          {signal.videos   !== undefined && <span>{signal.videos} videos</span>}
          {signal.confidence !== undefined && <span>{signal.confidence}% confidence</span>}
        </div>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">{signal.text}</p>
      <p className="text-[10px] font-mono text-slate-700 italic">No direct quotes available — derived from subscription feed intelligence</p>
    </div>
  );
}

// ── Theme card ────────────────────────────────────────────────────────────────

function ThemeCard({
  theme, index, limited = false, isActive = false, onFocus,
}: {
  theme: ResearchTheme; index: number; limited?: boolean; isActive?: boolean; onFocus?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showConsensus, setShowConsensus] = useState(false);
  const color = THEME_COLORS[index % THEME_COLORS.length];
  const otherSources = theme.sources.filter(s => s !== theme.representativeQuote);
  const confStyle = CONFIDENCE_STYLE[theme.confidenceLabel ?? "Low"] ?? CONFIDENCE_STYLE.Low;

  const hasConsensusData =
    theme.creatorConsensus.agree.length > 0 ||
    theme.creatorConsensus.neutral.length > 0 ||
    theme.creatorConsensus.disagree.length > 0;

  return (
    <div className="rounded-2xl overflow-hidden transition-all"
      style={{
        border: isActive ? "1px solid rgba(56,189,248,0.6)" : `1px solid ${color.border}`,
        boxShadow: isActive ? "0 0 0 1px rgba(56,189,248,0.2), 0 4px 24px #00000025" : "0 4px 24px #00000025",
      }}>

      <div className="p-5 space-y-4"
        style={{ background: "linear-gradient(140deg,#0c1e30 0%,#0e2d4a 100%)" }}>

        {/* Title row + evidence bar */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 cursor-pointer" onClick={onFocus}
              role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onFocus?.()}>
              <span className="text-xs font-mono font-black shrink-0 mt-0.5 px-1.5 py-0.5 rounded"
                style={{ color: color.accent, background: color.bg, border: `1px solid ${color.border}` }}>
                #{index + 1}
              </span>
              <h3 className="text-base font-black text-white leading-snug">{theme.title}</h3>
            </div>
            {isActive && (
              <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded shrink-0 mt-0.5 uppercase tracking-widest"
                style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)" }}>
                In focus
              </span>
            )}
          </div>

          {/* Evidence bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-xs font-mono">
              <span><span className="text-white font-black">{theme.creatorCount}</span><span className="text-slate-600"> creators</span></span>
              <span className="text-slate-700">·</span>
              <span><span className="text-white font-black">{theme.videoCount}</span><span className="text-slate-600"> videos</span></span>
              <span className="text-slate-700">·</span>
              <span><span className="text-white font-black">{theme.quoteCount}</span><span className="text-slate-600"> quotes</span></span>
            </div>
            <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded uppercase tracking-wider shrink-0"
              style={{ color: confStyle.color, background: confStyle.bg, border: `1px solid ${confStyle.border}` }}>
              {confStyle.icon} {theme.confidenceLabel ?? "Low"} Confidence
            </span>
          </div>

          {theme.confidenceReasoning && (
            <p className="text-[10px] font-mono text-slate-600 leading-relaxed">{theme.confidenceReasoning}</p>
          )}
        </div>

        {/* Market signal — analyst verdict */}
        {theme.marketSignal && (
          <div className="rounded-lg px-3 py-2"
            style={{ background: `${color.accent}0d`, border: `1px solid ${color.accent}22` }}>
            <p className="text-xs font-mono font-black text-slate-400 uppercase tracking-widest mb-0.5">Analyst Verdict</p>
            <p className="text-sm font-mono text-slate-200 leading-relaxed">{theme.marketSignal}</p>
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-slate-400 leading-relaxed">{theme.description}</p>

        {/* Relevance reason */}
        {theme.relevanceReason && (
          <p className="text-xs font-mono text-slate-600 italic pl-3 border-l-2"
            style={{ borderColor: `${color.accent}22` }}>
            {theme.relevanceReason}
          </p>
        )}

        {/* Recommended Actions — gated operator playbook */}
        {theme.operatorPlaybook.withheld ? (
          <div className="rounded-lg px-3 py-2"
            style={{ background: "rgba(100,116,139,0.06)", border: "1px solid rgba(100,116,139,0.18)" }}>
            <p className="text-[10px] font-mono font-black uppercase tracking-widest mb-0.5 text-slate-500">
              ◌ Recommended Actions
            </p>
            <p className="text-sm leading-relaxed text-slate-500 font-mono italic">
              <span className="text-amber-500/80">⚠ Recommendation withheld.</span> Baseline data consists of an isolated, unvalidated signal. Further cross-channel research is required before executing a definitive strategic playbook on this vector.
            </p>
          </div>
        ) : (
          <div className="rounded-lg px-3 py-2.5 space-y-2"
            style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.22)" }}>
            <p className="text-[10px] font-mono font-black uppercase tracking-widest text-emerald-400">
              ▶ Recommended Actions
            </p>
            <div className="space-y-0.5">
              <p className="text-[10px] font-mono font-black text-emerald-500/70 uppercase tracking-wider">Strategic Step</p>
              <p className="text-sm leading-relaxed text-emerald-100">{theme.operatorPlaybook.strategicStep}</p>
            </div>
            {theme.operatorPlaybook.implementationMetric && (
              <div className="space-y-0.5">
                <p className="text-[10px] font-mono font-black text-emerald-500/70 uppercase tracking-wider">Implementation Metric</p>
                <p className="text-sm font-mono text-emerald-200/90">{theme.operatorPlaybook.implementationMetric}</p>
              </div>
            )}
          </div>
        )}

        {/* Contrarians — always visible */}
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.18)" }}>
          <p className="text-[10px] font-mono font-black text-amber-500 uppercase tracking-widest">⚠ Contrarian View</p>
          {theme.contrarians.length === 0 ? (
            <p className="text-xs font-mono text-slate-700">No significant creator disagreement found in current evidence pool.</p>
          ) : (
            theme.contrarians.map((c, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-mono font-black text-amber-400">{c.creator}</p>
                  {c.timestampStr && (
                    <a href={ytUrl(c.videoId, c.timestampStr)} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-mono text-amber-500/60 shrink-0 hover:text-amber-400 transition-colors">
                      @{c.timestampStr} ↗
                    </a>
                  )}
                </div>
                {c.quote && (
                  <blockquote className="text-xs text-amber-200/60 italic border-l-2 pl-2"
                    style={{ borderColor: "rgba(251,191,36,0.25)" }}>
                    &ldquo;{c.quote}&rdquo;
                  </blockquote>
                )}
                {c.reason && (
                  <p className="text-[10px] font-mono text-slate-600">{c.reason}</p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Creator Consensus Map */}
        {hasConsensusData && (
          <div>
            <button
              onClick={() => setShowConsensus(v => !v)}
              className="flex items-center gap-2 text-xs font-mono text-slate-600 hover:text-slate-400 transition-colors">
              <span>Creator Positions</span>
              <span>{showConsensus ? "▲" : "▼"}</span>
            </button>
            {showConsensus && (
              <div className="mt-3 rounded-xl overflow-hidden"
                style={{ border: "1px solid #1e2d45", background: "rgba(8,16,28,0.4)" }}>
                <div className="grid grid-cols-3 divide-x" style={{ borderColor: "#1e2d45" }}>
                  {[
                    { label: "Agree",    entries: theme.creatorConsensus.agree,    color: "#10b981" },
                    { label: "Neutral",  entries: theme.creatorConsensus.neutral,  color: "#64748b" },
                    { label: "Disagree", entries: theme.creatorConsensus.disagree, color: "#f87171" },
                  ].map(col => (
                    <div key={col.label} className="p-3 space-y-2" style={{ borderColor: "#1e2d45" }}>
                      <p className="text-[10px] font-mono font-black uppercase tracking-widest"
                        style={{ color: col.color }}>
                        {col.label} ({col.entries.length})
                      </p>
                      {col.entries.length === 0 ? (
                        <p className="text-[10px] font-mono text-slate-700">—</p>
                      ) : (
                        <div className="space-y-3">
                          {col.entries.map((e, i) => (
                            <div key={i} className="space-y-0.5">
                              <p className="text-xs font-mono font-black text-slate-400 leading-tight">{e.creator}</p>
                              <p className="text-[10px] text-slate-600 leading-relaxed">{e.reason}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Creator pills */}
        {theme.creators.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {theme.creators.map((c, i) => (
              <span key={i} className="text-xs font-mono px-2 py-0.5 rounded-md text-slate-400"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1e2d45" }}>
                {c}
              </span>
            ))}
          </div>
        )}

        {/* Representative quote */}
        {theme.representativeQuote && (
          <div className="rounded-xl p-4 space-y-2"
            style={{ background: color.bg, border: `1px solid ${color.border}` }}>
            <blockquote>
              <p className="text-base text-slate-200 italic leading-relaxed">
                &ldquo;{theme.representativeQuote.quote}&rdquo;
              </p>
            </blockquote>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono font-black text-slate-400 truncate">
                — {theme.representativeQuote.creator} · {theme.representativeQuote.videoTitle}
              </p>
              {theme.representativeQuote.timestampStr && (
                <a
                  href={ytUrl(theme.representativeQuote.videoId, theme.representativeQuote.timestampStr)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono font-black shrink-0 transition-colors"
                  style={{ color: color.accent }}>
                  @{theme.representativeQuote.timestampStr} ↗
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Expand to show all quotes */}
      {otherSources.length > 0 && (
        <div style={{ background: "rgba(8,16,28,0.4)" }}>
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-white/[0.02]"
            style={{ borderTop: "1px solid #1e2d45" }}>
            <span className="text-xs font-mono text-slate-500">
              {expanded ? "Hide" : "Show"} {otherSources.length} more {otherSources.length === 1 ? "quote" : "quotes"}
            </span>
            <span className="text-xs font-mono text-slate-600">{expanded ? "▲" : "▼"}</span>
          </button>
          {expanded && (
            <div className="px-5 pb-5 space-y-3">
              {otherSources.map((s, i) => (
                <QuoteCard key={i} source={s} accent={color.accent} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Related signals panel ─────────────────────────────────────────────────────

function RelatedSignalsPanel({ signals }: { signals: RelatedSignal[] }) {
  if (!signals.length) return null;
  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: "rgba(15,37,53,0.5)", border: "1px solid rgba(148,163,184,0.1)" }}>
      <div className="space-y-0.5">
        <p className="text-xs font-mono font-black text-slate-600 uppercase tracking-widest">Related Signals</p>
        <p className="text-xs font-mono text-slate-700">Adjacent observations — not central to your query</p>
      </div>
      <div className="space-y-0">
        {signals.map((sig, i) => (
          <div key={i}>
            {i > 0 && <div className="border-t my-4" style={{ borderColor: "#1e2d45" }} />}
            <div className="space-y-1.5">
              <p className="text-sm font-black text-slate-500">{sig.title}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{sig.description}</p>
              {sig.sources[0]?.quote && (
                <blockquote className="border-l-2 pl-3 text-xs text-slate-700 italic"
                  style={{ borderColor: "#2d3f52" }}>
                  &ldquo;{sig.sources[0].quote}&rdquo;
                  {sig.sources[0].creator && (
                    <span className="not-italic"> — {sig.sources[0].creator}</span>
                  )}
                </blockquote>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Consensus answer ──────────────────────────────────────────────────────────

function ConsensusAnswer({ report }: { report: ResearchReport }) {
  if (!report.synthesis && report.themes.length === 0) return null;

  const allConfs = report.themes.map(t => t.confidenceLabel ?? "Low");
  const dominantConf: "Very High" | "High" | "Medium" | "Low" =
    allConfs.includes("Very High") ? "Very High"
    : allConfs.includes("High")     ? "High"
    : allConfs.includes("Medium")   ? "Medium"
    : "Low";
  const confStyle = CONFIDENCE_STYLE[dominantConf];

  const allCreators = [...new Set(report.themes.flatMap(t => t.creators))].slice(0, 8);
  const agreements = report.themes.slice(0, 4).map(t => t.marketSignal || t.description).filter(Boolean);
  const disagreements = report.themes
    .filter(t => t.contrarians.length > 0)
    .flatMap(t => t.contrarians.map(c => c.reason || `${c.creator} disputes this finding`))
    .slice(0, 2);

  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: "rgba(15,37,53,0.8)", border: "1px solid rgba(16,185,129,0.3)", boxShadow: "inset 0 1px #ffffff08" }}>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <p className="text-xs font-mono font-black text-emerald-500 uppercase tracking-widest">Consensus Answer</p>
          <p className="text-[10px] font-mono text-slate-600">
            Based on {report.videosMatched} videos from {report.creatorsMatched} creators
          </p>
        </div>
        <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded shrink-0"
          style={{ color: confStyle.color, background: confStyle.bg, border: `1px solid ${confStyle.border}` }}>
          {confStyle.icon} {dominantConf} Confidence
        </span>
      </div>

      {/* Main synthesis */}
      {report.synthesis && (
        <p className="text-base text-slate-200 leading-relaxed">{report.synthesis}</p>
      )}

      {/* Key agreements */}
      {agreements.length > 0 && (
        <ul className="space-y-1.5">
          {agreements.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed">
              <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Notable disagreements */}
      {disagreements.length > 0 && (
        <div className="rounded-lg px-3 py-2 space-y-1"
          style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.18)" }}>
          <p className="text-[10px] font-mono font-black text-amber-500 uppercase tracking-widest">Notable Disagreements</p>
          {disagreements.map((d, i) => (
            <p key={i} className="text-xs text-slate-400 leading-relaxed">{d}</p>
          ))}
        </div>
      )}

      {/* Supporting creators */}
      {allCreators.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[10px] font-mono text-slate-600 shrink-0">Supporting creators:</p>
          {allCreators.map((c, i) => (
            <span key={i} className="text-xs font-mono px-2 py-0.5 rounded text-slate-400"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1e2d45" }}>
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Debug panel ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DebugPanel({ data }: { data: any }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const d = data._debug;
  if (!d) return null;

  const dispositionColor = (s: string) =>
    s.startsWith("ACCEPTED") ? "#10b981"
    : s.startsWith("RELATED") ? "#fbbf24"
    : "#f87171";

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(99,102,241,0.3)" }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
        style={{ background: "rgba(30,20,60,0.7)" }}>
        <span className="text-xs font-mono font-black text-indigo-400 uppercase tracking-widest">
          Pipeline Debug · {open ? "▲" : "▼"}
        </span>
        <span className="text-xs font-mono text-indigo-600">
          {d.summary.retrieved} retrieved · {d.summary.gptIncludedInTheme} in theme · {d.summary.themesPassedThreshold} accepted
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-5" style={{ background: "rgba(10,5,30,0.9)" }}>

          {/* Summary */}
          <div className="pt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-xs font-mono">
            {[
              ["Retrieved from index", d.summary.retrieved],
              ["GPT included in theme", d.summary.gptIncludedInTheme],
              ["GPT placed in signal", d.summary.gptIncludedInSignal],
              ["GPT scored out of scope", d.summary.gptExcluded],
              ["GPT themes built", d.summary.themesBuiltByGpt],
              ["Passed server threshold", d.summary.themesPassedThreshold],
              ["Rejected by threshold", d.summary.themesRejectedByThreshold],
              ["Intelligence signals", d.summary.intelligenceSignalsFound],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between border-b py-0.5" style={{ borderColor: "#1e2d45" }}>
                <span className="text-slate-500">{k}</span>
                <span className="text-white font-black">{v}</span>
              </div>
            ))}
          </div>

          {/* Intelligence layer */}
          {d.intelligenceLayer && (
            <div className="space-y-2">
              <p className="text-xs font-mono font-black text-amber-400/70 uppercase tracking-widest">Intelligence Layer</p>
              <div className="text-xs font-mono space-y-0.5 text-slate-500">
                <p>Snapshot found: <span className={d.intelligenceLayer.snapshotFound ? "text-emerald-400" : "text-red-400"}>{String(d.intelligenceLayer.snapshotFound)}</span></p>
                <p>Pipeline cache found: <span className={d.intelligenceLayer.pipelineCacheFound ? "text-emerald-400" : "text-red-400"}>{String(d.intelligenceLayer.pipelineCacheFound)}</span></p>
                <p>Brief items: {d.intelligenceLayer.briefCount} · Alerts: {d.intelligenceLayer.alertCount} · Consensus themes: {d.intelligenceLayer.consensusThemeCount}</p>
                <p>Matched: {d.intelligenceLayer.matched.length}</p>
              </div>
              {d.intelligenceLayer.matched.length > 0 && (
                <div className="space-y-1">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {d.intelligenceLayer.matched.map((m: any, i: number) => (
                    <div key={i} className="rounded px-2 py-1.5" style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}>
                      <p className="text-[10px] font-mono text-amber-500 uppercase">{m.source} · {m.matchedBy}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{m.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* GPT raw themes */}
          {d.gptRawThemes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-mono font-black text-sky-400/70 uppercase tracking-widest">GPT Raw Themes ({d.gptRawThemes.length})</p>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {d.gptRawThemes.map((t: any, i: number) => (
                <div key={i} className="rounded px-3 py-2 space-y-1" style={{ background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.15)" }}>
                  <p className="text-xs font-mono font-black text-sky-300">{t.title}</p>
                  <p className="text-[10px] font-mono text-slate-600">{t.sourceRefCount} refs · indices: [{t.sourceRefIndices.join(", ")}]</p>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {t.quoteSnippets.map((q: any, j: number) => (
                    <p key={j} className="text-[10px] text-slate-500 pl-2 border-l" style={{ borderColor: "#2d3f52" }}>
                      [E{q.idx}] {q.quote}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
          {d.gptRawThemes.length === 0 && (
            <p className="text-xs font-mono text-red-400">GPT returned 0 themes — all evidence scored out of scope</p>
          )}

          {/* Per-row disposition */}
          <div className="space-y-2">
            <p className="text-xs font-mono font-black text-slate-500 uppercase tracking-widest">Per-Row Disposition</p>
            <div className="space-y-1">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {d.retrieval.map((row: any) => (
                <div key={row.idx} className="rounded px-3 py-2 space-y-0.5" style={{ background: "rgba(8,16,28,0.6)", border: "1px solid #1e2d45" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-black text-slate-400">[E{row.idx}] {row.creator} · {row.embeddingScore}</span>
                    <span className="text-[10px] font-mono font-black" style={{ color: dispositionColor(row.disposition) }}>{row.disposition}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 truncate">{row.quote || "(no quote)"}</p>
                  {row.rejectionReason && (
                    <p className="text-[10px] text-slate-700 italic">{row.rejectionReason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function ChatMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      elements.push(
        <p key={key++} className="text-[11px] font-mono font-black text-[#38bdf8] uppercase tracking-widest mt-3 mb-1 first:mt-0">
          {line.slice(4)}
        </p>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <p key={key++} className="text-xs font-mono font-black text-slate-300 uppercase tracking-wider mt-3 mb-1 first:mt-0">
          {line.slice(3)}
        </p>
      );
    } else if (/^[•\-\*] /.test(line)) {
      elements.push(
        <div key={key++} className="flex items-start gap-2">
          <span className="text-[#38bdf8] shrink-0 mt-0.5 text-xs">•</span>
          <span className="text-sm text-slate-200 leading-relaxed">{line.replace(/^[•\-\*] /, "")}</span>
        </div>
      );
    } else if (line.startsWith("Evidence Card")) {
      elements.push(
        <div key={key++} className="rounded-lg px-3 py-2 mt-1 mb-1 space-y-0.5"
          style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }}>
          <p className="text-[10px] font-mono font-black text-[#38bdf8] uppercase tracking-widest">Evidence Card</p>
        </div>
      );
    } else if (/^(Creator|Video|Timestamp|Quote|Relevance):/.test(line)) {
      const colon = line.indexOf(":");
      const label = line.slice(0, colon);
      const value = line.slice(colon + 1).trim();
      elements.push(
        <div key={key++} className="flex gap-1.5 text-xs -mt-1 pl-3" style={{ marginTop: label === "Creator" ? "4px" : "-4px" }}>
          <span className="font-mono font-black text-slate-500 shrink-0">{label}:</span>
          <span className={`font-mono ${label === "Quote" ? "text-slate-300 italic" : "text-slate-400"}`}>{value}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-1" />);
    } else {
      elements.push(
        <p key={key++} className="text-sm text-slate-200 leading-relaxed">{line}</p>
      );
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ── Research Chat ─────────────────────────────────────────────────────────────

type ChatMessage = { role: "user" | "assistant"; content: string };

function ResearchChat({ report, activeFindingIndex }: { report: ResearchReport; activeFindingIndex: number | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeFinding = activeFindingIndex !== null ? (report.themes[activeFindingIndex] ?? null) : null;

  async function sendMessage(text: string, hideUserBubble = false) {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const next = hideUserBubble ? messages : [...messages, userMsg];
    if (!hideUserBubble) setMessages(next);
    setInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/research/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, reportSnapshot: report, chatHistory: [...next, userMsg], activeFindingIndex: activeFindingIndex ?? undefined }),
      });
      const data = await res.json() as { answer?: string; error?: string };
      setMessages(prev => [...prev, { role: "assistant", content: data.answer ?? data.error ?? "Something went wrong." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Network error — please try again." }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }

  // Auto-fire opening analysis when component mounts with a fresh report
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void sendMessage(report.topic, true); }, []);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e2d45", background: "rgba(8,16,28,0.7)" }}>
      {/* Header */}
      <div className="px-5 py-3 space-y-1" style={{ borderBottom: "1px solid #1e2d45", background: "rgba(15,37,53,0.6)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-black text-[#38bdf8] uppercase tracking-widest">Research Analyst</span>
          <span className="text-[10px] font-mono text-slate-600">· evidence-grounded answers only</span>
        </div>
        {activeFinding
          ? <p className="text-[10px] font-mono text-slate-500">Focused on: <span className="text-[#38bdf8]">{activeFinding.title}</span> <span className="text-slate-600">— click another finding to switch</span></p>
          : <p className="text-[10px] font-mono text-slate-700">Click a finding title above to focus the analyst on it</p>
        }
      </div>

      {/* Chat thread */}
      <div className="px-5 py-4 space-y-4 max-h-[600px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && <span className="text-[10px] font-mono font-black text-[#38bdf8] shrink-0 mt-1">AI</span>}
              <div className="max-w-[85%] rounded-xl px-4 py-3"
                style={m.role === "user"
                  ? { background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.25)" }
                  : { background: "rgba(15,37,53,0.8)", border: "1px solid #1e2d45" }}>
                {m.role === "assistant"
                  ? <ChatMarkdown content={m.content} />
                  : <p className="text-sm text-slate-200 leading-relaxed">{m.content}</p>}
              </div>
              {m.role === "user" && <span className="text-[10px] font-mono font-black text-slate-600 shrink-0 mt-1">You</span>}
            </div>
          ))}
          {chatLoading && (
            <div className="flex gap-3 justify-start">
              <span className="text-[10px] font-mono font-black text-[#38bdf8] shrink-0 mt-1">AI</span>
              <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(15,37,53,0.8)", border: "1px solid #1e2d45" }}>
                <p className="text-sm text-slate-600 font-mono animate-pulse">Searching evidence pool...</p>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

      {/* Input */}
      <div className="px-5 py-3 flex gap-2" style={{ borderTop: "1px solid #1e2d45" }}>
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
          placeholder="Ask about the evidence..." disabled={chatLoading}
          className="flex-1 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none font-mono"
          style={{ background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
        <button type="button" onClick={() => void sendMessage(input)} disabled={chatLoading || !input.trim()}
          className="px-4 py-2 rounded-lg text-sm font-black text-[#0f2535] bg-[#38bdf8] hover:bg-[#7dd3fc] disabled:opacity-40 transition-colors shrink-0">
          Ask
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ResearchMode({ onBack }: { onBack?: () => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ResearchReport | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [debugData, setDebugData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [activeFindingIndex, setActiveFindingIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleReindexAll() {
    setReindexing(true);
    setReindexMsg(null);
    try {
      const res = await fetch("/api/research/reindex-all", { method: "POST" });
      const data = await res.json() as { analyses: number; indexed: number };
      setReindexMsg(`Indexed ${data.indexed} data points from ${data.analyses} videos.`);
    } catch {
      setReindexMsg("Re-index failed — try again");
    } finally {
      setReindexing(false);
    }
  }

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setLoading(true);
    setError(null);
    setReport(null);
    setDebugData(null);
    setActiveFindingIndex(null);
    try {
      const res = await fetch("/api/research/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, debug: debugMode }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as ResearchReport & { error?: string; _debug?: any };
      if (!res.ok || data.error) {
        setError(data.error ?? "Research failed");
      } else {
        setReport(data);
        if (data._debug) setDebugData(data);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  const keyThemes = report?.themes ?? [];

  return (
    <div className="min-h-screen text-slate-100 p-8 space-y-6 max-w-6xl mx-auto"
      style={{ background: "linear-gradient(140deg,#0f2535 0%,#166088 55%,#0e3154 100%)" }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {onBack && (
            <button type="button" onClick={onBack}
              className="flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-[#38bdf8] transition-colors mb-1">
              ← Back
            </button>
          )}
          <p className="text-base font-mono font-black text-[#38bdf8] uppercase tracking-widest">Research Mode</p>
          <p className="text-sm text-slate-400 font-mono">
            What are creators saying about this topic?
            {report?.totalIndexed ? ` Searching ${report.totalIndexed} indexed data points.` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDebugMode(v => !v)}
          className="text-[10px] font-mono font-black px-2 py-1 rounded shrink-0 transition-colors"
          style={{
            color: debugMode ? "#a78bfa" : "#64748b",
            background: debugMode ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${debugMode ? "rgba(167,139,250,0.4)" : "rgba(100,116,139,0.4)"}`,
          }}>
          {debugMode ? "● DEBUG ON" : "DEBUG"}
        </button>
      </div>

      {/* Search */}
      <form onSubmit={e => { e.preventDefault(); void runSearch(query); }} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a topic..."
          className="flex-1 rounded-xl px-4 py-3 text-base text-white placeholder:text-slate-500 focus:outline-none font-mono"
          style={{ background: "rgba(15,37,53,0.7)", border: "1px solid #1e2d45" }}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !query.trim()}
          className="px-5 py-3 bg-[#38bdf8] hover:bg-[#7dd3fc] disabled:opacity-40 text-[#0f2535] text-base font-black rounded-xl transition-colors whitespace-nowrap">
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {/* Suggested topics */}
      {!report && !loading && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Topics</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map(s => (
              <button key={s} onClick={() => { setQuery(s); void runSearch(s); }}
                className="text-sm font-mono px-4 py-2 rounded-lg transition-colors text-slate-300 hover:text-[#38bdf8]"
                style={{ border: "1px solid #1e2d45", background: "rgba(15,37,53,0.5)" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-300 font-mono space-y-2"
          style={{ background: "rgba(127,29,29,0.25)", border: "1px solid rgba(185,28,28,0.4)" }}>
          <p>{error}</p>
          {error.includes("indexed yet") && (
            <div className="space-y-1.5">
              <p className="text-sm text-red-400/70">New analyses are indexed automatically. To index your existing library now:</p>
              <button onClick={handleReindexAll} disabled={reindexing}
                className="text-sm font-mono font-bold text-white px-3 py-1 rounded disabled:opacity-50"
                style={{ background: "rgba(127,29,29,0.5)", border: "1px solid rgba(185,28,28,0.5)" }}>
                {reindexing ? "Indexing..." : "Index my library now"}
              </button>
              {reindexMsg && <p className="text-sm text-emerald-400">{reindexMsg}</p>}
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="rounded-xl h-16" style={{ background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
          {[220, 260, 200].map((h, i) => (
            <div key={i} className="rounded-2xl" style={{ height: `${h}px`, background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
          ))}
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="space-y-5">

          {/* Stats header with topic intent */}
          <div className="rounded-2xl p-5 space-y-3"
            style={{ background: "rgba(15,37,53,0.8)", border: "1px solid #1e2d45", boxShadow: "inset 0 1px #ffffff08" }}>
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="space-y-1.5 flex-1 min-w-0">
                <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Topic</p>
                <h2 className="text-xl font-black text-white">{report.topic}</h2>
                {report.topicIntent && (
                  <p className="text-sm text-slate-400 leading-relaxed">{report.topicIntent}</p>
                )}
              </div>
              <div className="flex items-center gap-6 text-sm font-mono text-slate-400 shrink-0">
                <div className="text-center">
                  <p className="text-xl font-black text-white">{report.videosMatched}</p>
                  <p className="text-xs">videos</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-white">{report.creatorsMatched}</p>
                  <p className="text-xs">creators</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-white">{report.quotesMatched}</p>
                  <p className="text-xs">quotes</p>
                </div>
              </div>
            </div>
          </div>

          {/* Consensus Answer — top-level synthesis before themes */}
          {keyThemes.length > 0 && <ConsensusAnswer report={report} />}

          {/* Key Findings */}
          {keyThemes.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                Evidence Themes — {keyThemes.length} {keyThemes.length === 1 ? "theme" : "themes"} · click a title to focus the analyst
              </p>
              {keyThemes.map((theme, i) => (
                <ThemeCard key={i} theme={theme} index={i}
                  isActive={activeFindingIndex === i}
                  onFocus={() => setActiveFindingIndex(i)} />
              ))}
            </div>
          )}

          {/* ── Topic Mismatch: evidence found but for the wrong topic ─────── */}
          {report.constraintValidation?.matchType === "NO_MATCH" && (
            <div className="rounded-xl px-5 py-4 space-y-4"
              style={{ background: "rgba(30,10,10,0.55)", border: "1px solid rgba(185,28,28,0.35)" }}>
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono font-black text-red-400 uppercase tracking-widest">⊘ Topic Mismatch — Evidence Gap Detected</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Your library contains content, but no creators explicitly discuss the specific topic you searched.
                  The retrieved evidence does not satisfy the required constraints for this query.
                </p>
              </div>

              {report.constraintValidation.failedConstraints.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono font-black text-red-400/70 uppercase tracking-widest">Missing Constraints</p>
                  <ul className="space-y-1">
                    {report.constraintValidation.failedConstraints.map((fc, i) => (
                      <li key={i} className="text-sm font-mono text-red-300/70 pl-3 border-l-2"
                        style={{ borderColor: "rgba(185,28,28,0.4)" }}>
                        {fc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.constraintValidation.adjacentTopics.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest">What Your Library Does Cover</p>
                  <div className="flex flex-wrap gap-2">
                    {report.constraintValidation.adjacentTopics.map(t => (
                      <span key={t} className="text-xs font-mono px-2.5 py-1 rounded-md text-slate-400"
                        style={{ background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.2)" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {report.suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest">Try a query your library can answer</p>
                  <div className="flex flex-wrap gap-2">
                    {report.suggestions.map(s => (
                      <button key={s} onClick={() => void runSearch(s)}
                        className="text-sm font-mono px-3 py-1.5 rounded-lg transition-colors text-slate-300 hover:text-[#38bdf8]"
                        style={{ border: "1px solid rgba(56,189,248,0.25)", background: "rgba(56,189,248,0.06)" }}>
                        {s} →
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Partial match warning — bridge inference or incomplete direct coverage ── */}
          {report.constraintValidation?.matchType === "PARTIAL" && keyThemes.length > 0 && (
            <div className="rounded-lg px-4 py-3 space-y-2"
              style={{ background: "rgba(30,20,5,0.5)", border: "1px solid rgba(251,191,36,0.3)" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-mono font-black text-amber-400/80 uppercase tracking-widest">
                  ⚠ Partial Evidence Coverage
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-slate-500">
                    Direct: <span className="text-amber-500/70">{report.constraintValidation.directCoverage}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Bridge: <span className="text-amber-500/70">{Math.round(report.constraintValidation.bridgeScore * 100)}%</span>
                  </span>
                </div>
              </div>

              {report.constraintValidation.bridgeCoveredComponents.length > 0 && (
                <p className="text-xs text-slate-500">
                  Structural alignment found via conceptual bridge
                  {" "}({report.constraintValidation.bridgeCoveredComponents.join(", ")} components).
                  Findings may include indirect evidence — claims are labeled accordingly.
                </p>
              )}

              {report.constraintValidation.failedConstraints.length > 0 && (
                <ul className="space-y-0.5 pt-0.5">
                  {report.constraintValidation.failedConstraints.map((fc, i) => (
                    <li key={i} className="text-xs font-mono text-amber-500/60">↳ {fc}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── No key themes: three-state fallback ─────────────────────────── */}
          {report.constraintValidation?.matchType !== "NO_MATCH" && keyThemes.length === 0 && (() => {
            const hasLimited    = report.limitedThemes.length > 0;
            const hasIntel      = report.intelligenceSignals.length > 0;
            const hasSuggestions = report.suggestions.length > 0;

            // STATE 1 — Limited Evidence: GPT found themes but none passed the consensus threshold
            if (hasLimited) return (
              <div className="space-y-4">
                <div className="rounded-xl px-5 py-4 space-y-1.5"
                  style={{ background: "rgba(30,20,5,0.5)", border: "1px solid rgba(251,191,36,0.25)" }}>
                  <p className="text-sm font-mono font-black text-amber-400/80 uppercase tracking-widest">Limited Evidence</p>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Relevant references found, but not enough independent creator agreement to establish strong consensus.
                    {" "}Each finding below comes from a single source — treat as a signal, not a conclusion.
                  </p>
                </div>
                {report.limitedThemes.map((theme, i) => (
                  <ThemeCard key={i} theme={theme} index={i} limited />
                ))}
              </div>
            );

            // STATE 2 — Intelligence layer signals: no direct transcript evidence but synthesized data exists
            if (hasIntel) return (
              <div className="rounded-xl px-5 py-4 space-y-4"
                style={{ background: "rgba(30,25,5,0.6)", border: "1px solid rgba(251,191,36,0.3)" }}>
                <div className="space-y-1">
                  <p className="text-sm font-mono font-black text-amber-400/80 uppercase tracking-widest">Intelligence Layer Signals</p>
                  <p className="text-sm text-slate-500 leading-relaxed">Evidence exists in synthesized intelligence but direct quote coverage is limited. Analyze specific videos on this topic to generate direct quotes and timestamps.</p>
                </div>
                <div className="space-y-3">
                  {report.intelligenceSignals.map((sig, i) => (
                    <IntelligenceSignalCard key={i} signal={sig} />
                  ))}
                </div>
                {hasSuggestions && (
                  <div className="pt-1 space-y-2">
                    <p className="text-xs font-mono text-slate-600">Or search a topic with direct transcript coverage:</p>
                    <div className="flex flex-wrap gap-2">
                      {report.suggestions.map(s => (
                        <button key={s} onClick={() => void runSearch(s)}
                          className="text-sm font-mono px-3 py-1.5 rounded-lg transition-colors text-slate-300 hover:text-[#38bdf8]"
                          style={{ border: "1px solid rgba(56,189,248,0.25)", background: "rgba(56,189,248,0.06)" }}>
                          {s} →
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );

            // STATE 3 — Insufficient Evidence: nothing in any layer
            return (
              <div className="rounded-xl px-5 py-4 space-y-3"
                style={{ background: "rgba(15,37,53,0.5)", border: "1px solid rgba(185,28,28,0.3)" }}>
                <div className="space-y-1">
                  <p className="text-sm font-mono font-black text-red-400/70 uppercase tracking-widest">Insufficient Evidence</p>
                  <p className="text-sm text-slate-500">
                    {report.videosMatched > 0
                      ? "Evidence exists but consensus is weak. Analyze more videos specifically about this topic to strengthen the signal."
                      : "No creators in your library explicitly discuss this topic. Analyze more videos on this subject."}
                    {hasSuggestions ? " Try one of these topics that are present in your library:" : ""}
                  </p>
                </div>
                {hasSuggestions && (
                  <div className="flex flex-wrap gap-2">
                    {report.suggestions.map(s => (
                      <button key={s} onClick={() => void runSearch(s)}
                        className="text-sm font-mono px-3 py-1.5 rounded-lg transition-colors text-slate-300 hover:text-[#38bdf8]"
                        style={{ border: "1px solid rgba(56,189,248,0.25)", background: "rgba(56,189,248,0.06)" }}>
                        {s} →
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Related Signals */}
          <RelatedSignalsPanel signals={report.relatedSignals} />

          {/* Research Analyst Chat */}
          <ResearchChat report={report} activeFindingIndex={activeFindingIndex} />

          {/* Debug panel */}
          {debugData && <DebugPanel data={debugData} />}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#1e2d45" }}>
            <p className="text-xs font-mono text-slate-700">
              {report.totalIndexed} data points · Quotes from real creator content
            </p>
            <button
              onClick={() => { setReport(null); setDebugData(null); setError(null); setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="text-sm font-mono text-[#38bdf8] hover:text-white transition-colors">
              New search →
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
