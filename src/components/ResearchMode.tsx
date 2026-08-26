"use client";

import { useState, useRef, useEffect } from "react";
import type {
  ResearchReport,
  ResearchTheme,
  RelatedSignal,
  ThemeSource,
  IntelligenceSignal,
  CreatorAuthorityInfo,
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

// ── Authority badge ───────────────────────────────────────────────────────────

const AUTHORITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  High:   { color: "#38bdf8", bg: "rgba(56,189,248,0.12)",  border: "rgba(56,189,248,0.3)"  },
  Medium: { color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)" },
  Low:    { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.2)"  },
};

function AuthorityBadge({ tier }: { tier: string }) {
  const s = AUTHORITY_STYLE[tier] ?? AUTHORITY_STYLE.Medium;
  return (
    <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {tier}
    </span>
  );
}

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

// ── Query router ──────────────────────────────────────────────────────────────

const DEEP_KEYWORDS = [
  "opportunity", "opportunities", "emerging", "emerge",
  "trend", "trends", "future", "founder", "founders",
  "market", "markets", "debate", "debates", "contradiction",
  "invest", "investment", "startup", "startups", "moat",
  "saturated", "white space", "blind spot", "blind spots",
  "missing", "overlooked", "undiscovered", "forecast",
  "predict", "prediction", "analyst", "intelligence",
  "where do creators disagree", "find opportunities",
  "what are founders",
];

function classifyQuery(q: string): "research" | "deep" {
  const lower = q.toLowerCase();
  return DEEP_KEYWORDS.some(kw => lower.includes(kw)) ? "deep" : "research";
}

// ── Quote card ────────────────────────────────────────────────────────────────

function QuoteCard({ source, accent }: { source: ThemeSource; accent: string }) {
  const sigColor = SIGNAL_COLOR[source.signalStrength ?? ""] ?? "#94a3b8";
  const link = ytUrl(source.videoId, source.timestampStr);

  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-mono font-black text-slate-700 uppercase tracking-wider truncate">
            {source.creator}
          </p>
          <p className="text-xs font-mono text-slate-400 truncate">{source.videoTitle}</p>
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
          <p className="text-base text-slate-700 italic leading-relaxed">
            &ldquo;{source.quote}&rdquo;
          </p>
        </blockquote>
      )}
    </div>
  );
}

// ── Contradiction Panel ───────────────────────────────────────────────────────

function ContradictionPanel({
  theme,
  creatorAuthority,
}: {
  theme: ResearchTheme;
  creatorAuthority?: Record<string, CreatorAuthorityInfo>;
}) {
  const hasContrarians = theme.contrarians.length > 0;

  // Unique supporting creators (deduped)
  const seenSupporters = new Set<string>();
  const supporters = theme.sources.filter(s => {
    if (seenSupporters.has(s.creator)) return false;
    seenSupporters.add(s.creator);
    return true;
  }).slice(0, 5);

  const opposers = theme.contrarians.slice(0, 4);

  if (!hasContrarians) {
    // Lightweight agreement bar — only when ≥2 creators
    if (supporters.length < 2) return null;
    return (
      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg flex-wrap"
        style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)" }}>
        <span className="text-[10px] font-mono font-black text-emerald-500/70 uppercase tracking-widest shrink-0">
          ✓ Cross-creator agreement
        </span>
        <div className="flex flex-wrap gap-2">
          {supporters.map((s, i) => {
            const auth = creatorAuthority?.[s.creator];
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-slate-400">{s.creator}</span>
                {auth && <AuthorityBadge tier={auth.tier} />}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Full contradiction split panel
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(251,191,36,0.3)" }}>
      <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap"
        style={{ background: "rgba(251,191,36,0.07)", borderBottom: "1px solid rgba(251,191,36,0.15)" }}>
        <span className="text-[9px] font-mono font-black text-amber-400 uppercase tracking-widest">⚡ Contradiction Detected</span>
        <span className="text-[10px] font-mono text-slate-600">
          {supporters.length} support · {opposers.length} challenge
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x" style={{ borderColor: "rgba(251,191,36,0.12)" }}>
        {/* Supporters */}
        <div className="p-4 space-y-3" style={{ background: "rgba(16,185,129,0.04)" }}>
          <p className="text-[10px] font-mono font-black text-emerald-500 uppercase tracking-widest">
            Support ({supporters.length})
          </p>
          <div className="space-y-3">
            {supporters.map((s, i) => {
              const auth = creatorAuthority?.[s.creator];
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono font-black text-slate-300">{s.creator}</span>
                    {auth && <AuthorityBadge tier={auth.tier} />}
                  </div>
                  {s.quote && (
                    <p className="text-[11px] text-slate-500 leading-relaxed border-l-2 pl-2 italic"
                      style={{ borderColor: "rgba(16,185,129,0.3)" }}>
                      &ldquo;{s.quote.length > 130 ? s.quote.slice(0, 130) + "…" : s.quote}&rdquo;
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Challengers */}
        <div className="p-4 space-y-3" style={{ background: "rgba(251,191,36,0.04)" }}>
          <p className="text-[10px] font-mono font-black text-amber-500 uppercase tracking-widest">
            Challenge ({opposers.length})
          </p>
          <div className="space-y-3">
            {opposers.map((o, i) => {
              const auth = creatorAuthority?.[o.creator];
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono font-black text-amber-300/80">{o.creator}</span>
                    {auth && <AuthorityBadge tier={auth.tier} />}
                  </div>
                  {o.quote && (
                    <p className="text-[11px] text-slate-500 leading-relaxed border-l-2 pl-2 italic"
                      style={{ borderColor: "rgba(251,191,36,0.25)" }}>
                      &ldquo;{o.quote.length > 130 ? o.quote.slice(0, 130) + "…" : o.quote}&rdquo;
                    </p>
                  )}
                  {o.reason && (
                    <p className="text-[10px] font-mono text-slate-700">{o.reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
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
          {signal.confidence !== undefined && (
            <span title="WatchFilter's own editorial read — not a YouTube metric">
              {signal.confidence >= 70 ? "High" : signal.confidence >= 40 ? "Medium" : "Low"} confidence
            </span>
          )}
        </div>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed">{signal.text}</p>
      <p className="text-[10px] font-mono text-slate-400 italic">No direct quotes available — derived from subscription feed intelligence</p>
    </div>
  );
}

// ── Theme card ────────────────────────────────────────────────────────────────

function ThemeCard({
  theme, index, limited = false, isActive = false, onFocus, creatorAuthority,
}: {
  theme: ResearchTheme; index: number; limited?: boolean; isActive?: boolean; onFocus?: () => void;
  creatorAuthority?: Record<string, CreatorAuthorityInfo>;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = THEME_COLORS[index % THEME_COLORS.length];
  const otherSources = theme.sources.filter(s => s !== theme.representativeQuote);
  const confStyle = CONFIDENCE_STYLE[theme.confidenceLabel ?? "Low"] ?? CONFIDENCE_STYLE.Low;

  return (
    <div className="rounded-2xl overflow-hidden transition-all"
      style={{
        border: isActive ? "1px solid #3b82f6" : "1px solid #e2e8f0",
        boxShadow: isActive ? "0 0 0 2px rgba(59,130,246,0.15), 0 2px 8px rgba(0,0,0,0.06)" : "0 1px 4px rgba(0,0,0,0.06)",
      }}>

      <div className="p-5 space-y-4"
        style={{ background: "white" }}>

        {/* Title row + evidence bar */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 cursor-pointer" onClick={onFocus}
              role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onFocus?.()}>
              <span className="text-xs font-mono font-black shrink-0 mt-0.5 px-1.5 py-0.5 rounded"
                style={{ color: color.accent, background: color.bg, border: `1px solid ${color.border}` }}>
                #{index + 1}
              </span>
              <h3 className="text-base font-black text-slate-900 leading-snug">{theme.title}</h3>
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
              <span><span className="text-slate-900 font-black">{theme.creatorCount}</span><span className="text-slate-400"> creators</span></span>
              <span className="text-slate-300">·</span>
              <span><span className="text-slate-900 font-black">{theme.videoCount}</span><span className="text-slate-400"> videos</span></span>
              <span className="text-slate-300">·</span>
              <span><span className="text-slate-900 font-black">{theme.quoteCount}</span><span className="text-slate-400"> quotes</span></span>
            </div>
            <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded uppercase tracking-wider shrink-0"
              style={{ color: confStyle.color, background: confStyle.bg, border: `1px solid ${confStyle.border}` }}>
              {confStyle.icon} {theme.confidenceLabel ?? "Low"} Confidence
            </span>
          </div>

          {theme.confidenceReasoning && (
            <p className="text-[10px] font-mono text-slate-400 leading-relaxed">{theme.confidenceReasoning}</p>
          )}
        </div>

        {/* Market signal — analyst verdict */}
        {theme.marketSignal && (
          <div className="rounded-lg px-3 py-2"
            style={{ background: `${color.accent}0d`, border: `1px solid ${color.accent}22` }}>
            <p className="text-xs font-mono font-black text-slate-400 uppercase tracking-widest mb-0.5">Analyst Verdict</p>
            <p className="text-sm font-mono text-slate-700 leading-relaxed">{theme.marketSignal}</p>
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-slate-600 leading-relaxed">{theme.description}</p>

        {/* Relevance reason */}
        {theme.relevanceReason && (
          <p className="text-xs font-mono text-slate-400 italic pl-3 border-l-2"
            style={{ borderColor: `${color.accent}22` }}>
            {theme.relevanceReason}
          </p>
        )}

        {/* Recommended Actions — gated operator playbook */}
        {theme.operatorPlaybook.withheld ? (
          <div className="rounded-lg px-3 py-2"
            style={{ background: "rgba(100,116,139,0.06)", border: "1px solid rgba(100,116,139,0.18)" }}>
            <p className="text-[10px] font-mono font-black uppercase tracking-widest mb-0.5 text-slate-400">
              ◌ Recommended Actions
            </p>
            <p className="text-sm leading-relaxed text-slate-500 font-mono italic">
              <span className="text-amber-600">⚠ Recommendation withheld.</span> Baseline data consists of an isolated, unvalidated signal. Further cross-channel research is required before executing a definitive strategic playbook on this vector.
            </p>
          </div>
        ) : (
          <div className="rounded-lg px-3 py-2.5 space-y-2"
            style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.22)" }}>
            <p className="text-[10px] font-mono font-black uppercase tracking-widest text-emerald-600">
              ▶ Recommended Actions
            </p>
            <div className="space-y-0.5">
              <p className="text-[10px] font-mono font-black text-emerald-600 uppercase tracking-wider">Strategic Step</p>
              <p className="text-sm leading-relaxed text-emerald-900">{theme.operatorPlaybook.strategicStep}</p>
            </div>
            {theme.operatorPlaybook.implementationMetric && (
              <div className="space-y-0.5">
                <p className="text-[10px] font-mono font-black text-emerald-600 uppercase tracking-wider">How to Measure It</p>
                <p className="text-sm font-mono text-emerald-800">{theme.operatorPlaybook.implementationMetric}</p>
              </div>
            )}
          </div>
        )}

        {/* Contradiction Engine */}
        <ContradictionPanel theme={theme} creatorAuthority={creatorAuthority} />

        {/* Creator pills */}
        {theme.creators.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {theme.creators.map((c, i) => (
              <span key={i} className="text-xs font-mono px-2 py-0.5 rounded-md text-slate-500"
                style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}>
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
              <p className="text-base text-slate-700 italic leading-relaxed">
                &ldquo;{theme.representativeQuote.quote}&rdquo;
              </p>
            </blockquote>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono font-black text-slate-500 truncate">
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
        <div style={{ background: "#f8fafc" }}>
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-slate-100"
            style={{ borderTop: "1px solid #e2e8f0" }}>
            <span className="text-xs font-mono text-slate-500">
              {expanded ? "Hide" : "Show"} {otherSources.length} more {otherSources.length === 1 ? "quote" : "quotes"}
            </span>
            <span className="text-xs font-mono text-slate-400">{expanded ? "▲" : "▼"}</span>
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
      style={{ background: "white", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <div className="space-y-0.5">
        <p className="text-xs font-mono font-black text-slate-400 uppercase tracking-widest">Related Signals</p>
        <p className="text-xs font-mono text-slate-400">Adjacent observations — not central to your query</p>
      </div>
      <div className="space-y-0">
        {signals.map((sig, i) => (
          <div key={i}>
            {i > 0 && <div className="border-t my-4" style={{ borderColor: "#e2e8f0" }} />}
            <div className="space-y-1.5">
              <p className="text-sm font-black text-slate-900">{sig.title}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{sig.description}</p>
              {sig.sources[0]?.quote && (
                <blockquote className="border-l-2 pl-3 text-xs text-slate-500 italic"
                  style={{ borderColor: "#cbd5e1" }}>
                  &ldquo;{sig.sources[0].quote}&rdquo;
                  {sig.sources[0].creator && (
                    <span className="not-italic text-slate-400"> — {sig.sources[0].creator}</span>
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
      style={{ background: "white", border: "1px solid rgba(16,185,129,0.3)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <p className="text-xs font-mono font-black text-emerald-600 uppercase tracking-widest">Consensus Answer</p>
          <p className="text-[10px] font-mono text-slate-400">
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
        <p className="text-base text-slate-700 leading-relaxed">{report.synthesis}</p>
      )}

      {/* Key agreements */}
      {agreements.length > 0 && (
        <ul className="space-y-1.5">
          {agreements.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
              <span className="text-emerald-500 shrink-0 mt-0.5">•</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Notable disagreements */}
      {disagreements.length > 0 && (
        <div className="rounded-lg px-3 py-2 space-y-1"
          style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)" }}>
          <p className="text-[10px] font-mono font-black text-amber-600 uppercase tracking-widest">Notable Disagreements</p>
          {disagreements.map((d, i) => (
            <p key={i} className="text-xs text-slate-500 leading-relaxed">{d}</p>
          ))}
        </div>
      )}

      {/* Supporting creators */}
      {allCreators.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[10px] font-mono text-slate-400 shrink-0">Supporting creators:</p>
          {allCreators.map((c, i) => (
            <span key={i} className="text-xs font-mono px-2 py-0.5 rounded text-slate-500"
              style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}>
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

// ── Evidence card (compact + expandable) ─────────────────────────────────────

type EvidenceCardData = {
  creator: string;
  video: string;
  timestamp: string;
  quote: string;
  relevance: string;
};

function CompactEvidenceCard({ card }: { card: EvidenceCardData }) {
  const [expanded, setExpanded] = useState(false);
  if (!card.creator && !card.quote) return null;
  return (
    <div className="rounded-lg p-3 space-y-2"
      style={{ background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.18)" }}>
      {card.quote && (
        <blockquote className="text-sm text-slate-200 italic leading-relaxed border-l-2 pl-3"
          style={{ borderColor: "rgba(56,189,248,0.4)" }}>
          &ldquo;{card.quote}&rdquo;
        </blockquote>
      )}
      {card.creator && (
        <p className="text-[11px] font-mono font-black text-slate-400 uppercase tracking-wide">{card.creator}</p>
      )}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="text-[10px] font-mono text-slate-600 hover:text-slate-400 transition-colors">
        {expanded ? "Hide Details ▲" : "Show Details ▼"}
      </button>
      {expanded && (
        <div className="space-y-1 pt-1.5 border-t" style={{ borderColor: "#1e2d45" }}>
          {card.video && (
            <div className="flex gap-1.5 text-xs">
              <span className="font-mono font-black text-slate-500 shrink-0">Video:</span>
              <span className="font-mono text-slate-400">{card.video}</span>
            </div>
          )}
          {card.timestamp && (
            <div className="flex gap-1.5 text-xs">
              <span className="font-mono font-black text-slate-500 shrink-0">Timestamp:</span>
              <span className="font-mono text-slate-400">{card.timestamp}</span>
            </div>
          )}
          {card.relevance && (
            <div className="flex gap-1.5 text-xs">
              <span className="font-mono font-black text-slate-500 shrink-0">Relevance:</span>
              <span className="font-mono text-slate-400">{card.relevance}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceCardGroup({ cards }: { cards: EvidenceCardData[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? cards : cards.slice(0, 2);
  const hiddenCount = cards.length - 2;
  return (
    <div className="space-y-2 my-1">
      {visible.map((card, i) => <CompactEvidenceCard key={i} card={card} />)}
      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-[11px] font-mono text-slate-500 hover:text-[#38bdf8] transition-colors pl-1">
          + Show {hiddenCount} more supporting {hiddenCount === 1 ? "quote" : "quotes"}
        </button>
      )}
      {showAll && cards.length > 2 && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-[11px] font-mono text-slate-500 hover:text-[#38bdf8] transition-colors pl-1">
          Show less ▲
        </button>
      )}
    </div>
  );
}

// ── Inline text renderer ──────────────────────────────────────────────────────

function InlineText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+`)/g;
  let last = 0;
  let i = 0;
  let m = regex.exec(text);
  while (m !== null) {
    if (m.index > last) parts.push(<span key={i++}>{text.slice(last, m.index)}</span>);
    const tok = m[0];
    if (tok.startsWith("**"))
      parts.push(<strong key={i++} className="text-white font-bold">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("*"))
      parts.push(<em key={i++} className="italic text-slate-200">{tok.slice(1, -1)}</em>);
    else
      parts.push(<code key={i++} className="text-[#38bdf8] text-[0.85em] font-mono bg-[#38bdf8]/10 px-1 rounded">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
    m = regex.exec(text);
  }
  if (last < text.length) parts.push(<span key={i++}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

// ── Markdown table ────────────────────────────────────────────────────────────

function TableBlock({ rows }: { rows: string[][] }) {
  if (rows.length < 2) return null;
  const headers = rows[0];
  const body = rows.slice(2);
  return (
    <div className="overflow-x-auto my-2 rounded-lg" style={{ border: "1px solid #1e2d45" }}>
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr style={{ borderBottom: "1px solid #1e2d45", background: "rgba(56,189,248,0.06)" }}>
            {headers.map((h, ci) => (
              <th key={ci} className="text-left py-2 px-3 text-[#38bdf8] font-black uppercase tracking-wide text-[10px]">
                {h.trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: ri < body.length - 1 ? "1px solid #0e1a28" : "none" }}>
              {row.map((cell, ci) => (
                <td key={ci} className="py-1.5 px-3 text-slate-400 align-top leading-relaxed">{cell.trim()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Blockquote block (Verification Source) ────────────────────────────────────

function BlockquoteBlock({ lines }: { lines: string[] }) {
  return (
    <div className="my-1 pl-3 border-l-2 space-y-1" style={{ borderColor: "rgba(56,189,248,0.4)" }}>
      {lines.map((line, i) => {
        const isBullet = /^\*\s/.test(line);
        const text = isBullet ? line.replace(/^\*\s/, "") : line;
        return (
          <div key={i} className="flex items-start gap-1.5">
            {isBullet && <span className="text-[#38bdf8] shrink-0 text-xs mt-0.5">•</span>}
            <p className="text-sm text-slate-300 leading-relaxed font-mono">
              <InlineText text={text} />
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Sequence block ────────────────────────────────────────────────────────────

type SequenceStep = { subtitle: string; title: string; body: string };

function SequenceBlock({ steps }: { steps: SequenceStep[] }) {
  return (
    <div className="my-2 space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="rounded-lg p-3 space-y-1"
          style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.2)" }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-black text-purple-400 uppercase tracking-widest">{step.subtitle}</span>
            <span className="text-[10px] font-mono text-slate-600">·</span>
            <span className="text-xs font-mono font-black text-white">{step.title}</span>
          </div>
          {step.body && (
            <p className="text-sm text-slate-300 leading-relaxed"><InlineText text={step.body} /></p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Elicitations block ────────────────────────────────────────────────────────

type ElicitationItem = { label: string; query: string };

function ElicitationsBlock({
  message, items, onQuery,
}: { message: string; items: ElicitationItem[]; onQuery?: (q: string) => void }) {
  return (
    <div className="my-2 rounded-xl p-4 space-y-3"
      style={{ background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.2)" }}>
      {message && (
        <p className="text-[10px] font-mono font-black text-[#38bdf8] uppercase tracking-widest">{message}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <button key={i} type="button" onClick={() => onQuery?.(item.query)}
            className="text-xs font-mono px-3 py-1.5 rounded-lg transition-colors text-slate-300 hover:text-white"
            style={{ border: "1px solid rgba(56,189,248,0.3)", background: "rgba(56,189,248,0.08)" }}>
            {item.label} →
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Collapsible section (for Evidence From Creators) ─────────────────────────

function CollapseSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(56,189,248,0.25)" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors hover:opacity-90"
        style={{ background: "rgba(56,189,248,0.08)" }}>
        <span className="text-[10px] font-mono font-black text-[#38bdf8] uppercase tracking-widest">{title}</span>
        <span className="text-[10px] font-mono text-slate-400">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {open && (
        <div className="px-3 py-2.5 space-y-1" style={{ background: "rgba(56,189,248,0.03)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function ChatMarkdown({ content, onQuery }: { content: string; onQuery?: (q: string) => void }) {
  type TextSeg       = { type: "text"; lines: string[] };
  type CardSeg       = { type: "cards"; cards: EvidenceCardData[] };
  type TableSeg      = { type: "table"; rows: string[][] };
  type BlockquoteSeg = { type: "blockquote"; lines: string[] };
  type SequenceSeg   = { type: "sequence"; steps: SequenceStep[] };
  type ElicitSeg     = { type: "elicitations"; message: string; items: ElicitationItem[] };
  type Seg = TextSeg | CardSeg | TableSeg | BlockquoteSeg | SequenceSeg | ElicitSeg;

  const segments: Seg[] = [];
  const rawLines = content.split("\n");
  const CARD_FIELD = /^(Creator|Video|Timestamp|Quote|Relevance):/;

  let textLines: string[] = [];
  let cardGroup: EvidenceCardData[] = [];
  let card: Partial<EvidenceCardData> | null = null;
  let tableRows: string[][] = [];
  let bqLines: string[] = [];
  let xmlBuffer: string[] = [];
  let inXml: "sequence" | "elicitations" | null = null;

  const flushCard = () => {
    if (card && (card.creator || card.quote)) {
      cardGroup.push({ creator: card.creator ?? "", video: card.video ?? "", timestamp: card.timestamp ?? "", quote: card.quote ?? "", relevance: card.relevance ?? "" });
    }
    card = null;
  };
  const flushCardGroup = () => {
    flushCard();
    if (cardGroup.length > 0) { segments.push({ type: "cards", cards: [...cardGroup] }); cardGroup = []; }
  };
  const flushText = () => {
    while (textLines.length > 0 && textLines[textLines.length - 1].trim() === "") textLines.pop();
    if (textLines.length > 0) { segments.push({ type: "text", lines: [...textLines] }); textLines = []; }
  };
  const flushTable = () => {
    if (tableRows.length > 0) { segments.push({ type: "table", rows: [...tableRows] }); tableRows = []; }
  };
  const flushBlockquote = () => {
    if (bqLines.length > 0) { segments.push({ type: "blockquote", lines: [...bqLines] }); bqLines = []; }
  };

  const parseSequence = (xmlStr: string): SequenceStep[] => {
    const steps: SequenceStep[] = [];
    const rx = /<Step\s+subtitle="([^"]*?)"\s+title="([^"]*?)"[^>]*>([\s\S]*?)<\/Step>/g;
    let sm = rx.exec(xmlStr);
    while (sm !== null) {
      steps.push({ subtitle: sm[1], title: sm[2], body: sm[3].trim() });
      sm = rx.exec(xmlStr);
    }
    return steps;
  };

  const parseElicitations = (xmlStr: string): { message: string; items: ElicitationItem[] } => {
    const msgMatch = /message="([^"]*?)"/.exec(xmlStr);
    const message = msgMatch ? msgMatch[1] : "";
    const items: ElicitationItem[] = [];
    const rx = /<Elicitation\s+label="([^"]*?)"\s+query="([^"]*?)"\s*\/>/g;
    let em = rx.exec(xmlStr);
    while (em !== null) {
      items.push({ label: em[1], query: em[2] });
      em = rx.exec(xmlStr);
    }
    return { message, items };
  };

  for (const line of rawLines) {
    const trimmed = line.trim();

    if (inXml) {
      xmlBuffer.push(line);
      if (inXml === "sequence" && trimmed === "</Sequence>") {
        const steps = parseSequence(xmlBuffer.join("\n"));
        if (steps.length > 0) segments.push({ type: "sequence", steps });
        xmlBuffer = []; inXml = null;
      } else if (inXml === "elicitations" && trimmed === "</ElicitationsGroup>") {
        const { message, items } = parseElicitations(xmlBuffer.join("\n"));
        if (items.length > 0) segments.push({ type: "elicitations", message, items });
        xmlBuffer = []; inXml = null;
      }
      continue;
    }

    if (trimmed.startsWith("<Sequence>")) {
      flushCardGroup(); flushText(); flushTable(); flushBlockquote();
      inXml = "sequence"; xmlBuffer = [line]; continue;
    }
    if (trimmed.startsWith("<ElicitationsGroup")) {
      flushCardGroup(); flushText(); flushTable(); flushBlockquote();
      inXml = "elicitations"; xmlBuffer = [line]; continue;
    }

    if (line.startsWith("Evidence Card")) {
      flushText(); flushTable(); flushBlockquote(); flushCard();
      card = {}; continue;
    }
    if (card !== null && CARD_FIELD.test(line)) {
      const colon = line.indexOf(":");
      const label = line.slice(0, colon).toLowerCase().trim();
      let value = line.slice(colon + 1).trim();
      if (label === "quote" && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      switch (label) {
        case "creator":   card.creator   = value; break;
        case "video":     card.video     = value; break;
        case "timestamp": card.timestamp = value; break;
        case "quote":     card.quote     = value; break;
        case "relevance": card.relevance = value; break;
      }
      continue;
    }
    if (card !== null && trimmed === "") continue;
    if (card !== null) flushCardGroup();

    if (line.startsWith("> ") || trimmed === ">") {
      flushText(); flushTable();
      bqLines.push(line.startsWith("> ") ? line.slice(2) : "");
      continue;
    }
    if (bqLines.length > 0 && !line.startsWith(">")) flushBlockquote();

    if (line.startsWith("|")) {
      flushText(); flushBlockquote();
      tableRows.push(line.split("|").slice(1, -1));
      continue;
    }
    if (tableRows.length > 0 && !line.startsWith("|")) flushTable();

    textLines.push(line);
  }

  flushCardGroup();
  flushText();
  flushTable();
  flushBlockquote();

  const renderLine = (line: string, k: number): React.ReactNode => {
    if (/^\*\s/.test(line) || /^[•\-]\s/.test(line)) {
      const text = line.replace(/^[\*•\-]\s/, "");
      return (
        <div key={k} className="flex items-start gap-2">
          <span className="text-[#38bdf8] shrink-0 mt-0.5 text-xs">•</span>
          <span className="text-sm text-slate-200 leading-relaxed"><InlineText text={text} /></span>
        </div>
      );
    }
    if (/^\d+\.\s/.test(line)) {
      const numMatch = line.match(/^(\d+)\.\s/);
      const num = numMatch ? numMatch[1] : "1";
      const text = line.replace(/^\d+\.\s/, "");
      return (
        <div key={k} className="flex items-start gap-2">
          <span className="text-[#38bdf8] shrink-0 mt-0.5 text-xs font-mono font-black">{num}.</span>
          <span className="text-sm text-slate-200 leading-relaxed"><InlineText text={text} /></span>
        </div>
      );
    }
    if (line.trim() === "") return <div key={k} className="h-1" />;
    return <p key={k} className="text-sm text-slate-200 leading-relaxed"><InlineText text={line} /></p>;
  };

  const renderText = (seg: TextSeg, si: number) => {
    // Split lines into sections grouped by headings
    type Section = { heading: string | null; level: 1 | 2 | 3; lines: string[] };
    const sections: Section[] = [{ heading: null, level: 3, lines: [] }];
    for (const line of seg.lines) {
      if (line.startsWith("### ")) {
        sections.push({ heading: line.slice(4), level: 3, lines: [] });
      } else if (line.startsWith("## ")) {
        sections.push({ heading: line.slice(3), level: 2, lines: [] });
      } else if (line.startsWith("# ")) {
        sections.push({ heading: line.slice(2), level: 1, lines: [] });
      } else {
        sections[sections.length - 1].lines.push(line);
      }
    }

    let k = 0;
    const outerElements: React.ReactNode[] = [];

    for (const sec of sections) {
      const innerEls = sec.lines.map(line => renderLine(line, k++));

      if (!sec.heading) {
        outerElements.push(...innerEls);
        continue;
      }

      const isEvidence = /evidence/i.test(sec.heading);

      if (isEvidence) {
        outerElements.push(
          <CollapseSection key={k++} title={sec.heading}>
            {innerEls}
          </CollapseSection>
        );
      } else {
        if (sec.level === 1) {
          outerElements.push(
            <p key={k++} className="text-sm font-mono font-black text-white mt-2 mb-0.5 first:mt-0">
              <InlineText text={sec.heading} />
            </p>
          );
        } else if (sec.level === 2) {
          outerElements.push(
            <p key={k++} className="text-xs font-mono font-black text-slate-300 uppercase tracking-wider mt-3 mb-1 first:mt-0">
              <InlineText text={sec.heading} />
            </p>
          );
        } else {
          outerElements.push(
            <p key={k++} className="text-[11px] font-mono font-black text-[#38bdf8] uppercase tracking-widest mt-3 mb-1 first:mt-0">
              <InlineText text={sec.heading} />
            </p>
          );
        }
        outerElements.push(...innerEls);
      }
    }

    return <div key={si} className="space-y-0.5">{outerElements}</div>;
  };

  return (
    <div className="space-y-1.5">
      {segments.map((seg, si) => {
        switch (seg.type) {
          case "cards":        return <EvidenceCardGroup key={si} cards={seg.cards} />;
          case "table":        return <TableBlock key={si} rows={seg.rows} />;
          case "blockquote":   return <BlockquoteBlock key={si} lines={seg.lines} />;
          case "sequence":     return <SequenceBlock key={si} steps={seg.steps} />;
          case "elicitations": return <ElicitationsBlock key={si} message={seg.message} items={seg.items} onQuery={onQuery} />;
          default:             return renderText(seg as TextSeg, si);
        }
      })}
    </div>
  );
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
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <div className="px-5 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
        <span className="text-[10px] font-mono font-black text-sky-600 uppercase tracking-widest">Research Assistant</span>
        {activeFinding && (
          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[60%] text-right">
            {activeFinding.title}
          </span>
        )}
      </div>

      {/* Chat thread */}
      <div className="px-5 py-4 space-y-4 max-h-[600px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && <span className="text-[10px] font-mono font-black text-sky-600 shrink-0 mt-1">AI</span>}
              <div className="max-w-[85%] rounded-xl px-4 py-3"
                style={m.role === "user"
                  ? { background: "#e0f2fe", border: "1px solid #bae6fd" }
                  : { background: "#0f172a", border: "1px solid #1e2d45" }}>
                {m.role === "assistant"
                  ? <ChatMarkdown content={m.content} onQuery={(q) => void sendMessage(q)} />
                  : <p className="text-sm text-slate-700 leading-relaxed">{m.content}</p>}
              </div>
              {m.role === "user" && <span className="text-[10px] font-mono font-black text-slate-400 shrink-0 mt-1">You</span>}
            </div>
          ))}
          {chatLoading && (
            <div className="flex gap-3 justify-start">
              <span className="text-[10px] font-mono font-black text-sky-600 shrink-0 mt-1">AI</span>
              <div className="rounded-xl px-4 py-2.5" style={{ background: "#0f172a", border: "1px solid #1e2d45" }}>
                <p className="text-sm text-slate-500 font-mono animate-pulse">Searching evidence pool...</p>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

      {/* Input — pill bar */}
      <div className="px-4 pb-4 pt-3" style={{ borderTop: "1px solid #e2e8f0" }}>
        <div className="flex items-center gap-2 rounded-full px-3 py-2"
          style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}>

          {/* + new chat */}
          <button
            type="button"
            onClick={() => setMessages([])}
            title="New conversation"
            className="w-7 h-7 flex items-center justify-center rounded-full shrink-0 text-slate-400 hover:text-slate-600 hover:bg-white transition-all text-base font-light">
            +
          </button>

          {/* Text input */}
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
            placeholder="Ask anything"
            disabled={chatLoading}
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none min-w-0"
          />

          {/* Mic icon — decorative */}
          <button type="button" disabled
            className="shrink-0 text-slate-600 cursor-default">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="9" y1="22" x2="15" y2="22"/>
            </svg>
          </button>

          {/* Send button */}
          <button
            type="button"
            onClick={() => void sendMessage(input)}
            disabled={chatLoading || !input.trim()}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all"
            style={{
              background: input.trim() && !chatLoading ? "#0f172a" : "#e2e8f0",
            }}>
            {chatLoading ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke={input.trim() ? "#ffffff" : "#94a3b8"} strokeWidth="2.5" strokeLinecap="round"
                className="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke={input.trim() ? "#ffffff" : "#94a3b8"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ResearchMode({ onBack, onDeepResearch }: { onBack?: () => void; onDeepResearch?: () => void }) {
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
  const [routingPrompt, setRoutingPrompt] = useState<string | null>(null);
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

  function handleSubmit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    if (onDeepResearch && classifyQuery(trimmed) === "deep" && !routingPrompt) {
      setRoutingPrompt(trimmed);
      return;
    }
    setRoutingPrompt(null);
    void runSearch(trimmed);
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
    setRoutingPrompt(null);
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
    <div className="text-slate-900 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {onBack && (
            <button type="button" onClick={onBack}
              className="flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-slate-900 transition-colors mb-1">
              ← Back
            </button>
          )}
          <h1 className="text-2xl font-black text-slate-900">Research Mode</h1>
          <p className="text-sm text-slate-500">
            What are creators saying about this topic?
            {report?.totalIndexed ? ` Searching ${report.totalIndexed} indexed data points.` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDebugMode(v => !v)}
          className="text-[10px] font-mono font-black px-2 py-1 rounded shrink-0 transition-colors"
          style={{
            color: debugMode ? "#7c3aed" : "#64748b",
            background: debugMode ? "#f5f3ff" : "white",
            border: `1px solid ${debugMode ? "#c4b5fd" : "#e2e8f0"}`,
          }}>
          {debugMode ? "● DEBUG ON" : "DEBUG"}
        </button>
      </div>

      {/* Search */}
      <form onSubmit={e => { e.preventDefault(); handleSubmit(query); }} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a topic..."
          className="flex-1 rounded-xl px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
          style={{ background: "white", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !query.trim()}
          className="px-5 py-3 disabled:opacity-40 text-base font-black rounded-xl transition-colors whitespace-nowrap"
          style={{ background: loading ? "#f1f5f9" : "#0f172a", color: "white", border: "1px solid #e2e8f0" }}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {/* Routing prompt banner */}
      {routingPrompt && onDeepResearch && (
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: "#0f172a", border: "1px solid #1e3a5f", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-base">⚡</span>
              <p className="text-sm font-mono font-black text-sky-400 uppercase tracking-widest">Deep Research Query Detected</p>
            </div>
            <p className="text-base font-black text-white leading-snug">&ldquo;{routingPrompt}&rdquo;</p>
            <p className="text-sm text-slate-400 leading-relaxed">
              This query is best answered by Deep Research — it runs a multi-agent pipeline to surface opportunity signals, emerging trends, and debate maps from your creator library.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onDeepResearch}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all hover:opacity-90"
              style={{ background: "#38bdf8", color: "#0f172a" }}>
              ⚡ Run Deep Research
            </button>
            <button
              type="button"
              onClick={() => { setRoutingPrompt(null); void runSearch(routingPrompt); }}
              className="px-4 py-2.5 rounded-xl text-sm font-mono text-slate-400 hover:text-slate-200 transition-colors"
              style={{ border: "1px solid #2a3f58" }}>
              Search Research Mode anyway →
            </button>
          </div>
          <p className="text-[10px] font-mono text-slate-600">
            Research Mode answers "What do creators say?" · Deep Research answers "What does it mean?"
          </p>
        </div>
      )}

      {/* Suggested topics */}
      {!report && !loading && !routingPrompt && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Topics</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map(s => (
              <button key={s} onClick={() => { setQuery(s); handleSubmit(s); }}
                className="text-sm font-mono px-4 py-2 rounded-lg transition-colors text-slate-600 hover:text-slate-900 hover:border-slate-300"
                style={{ border: "1px solid #e2e8f0", background: "white" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-700 font-mono space-y-2"
          style={{ background: "#fee2e2", border: "1px solid #fca5a5" }}>
          <p>{error}</p>
          {error.includes("indexed yet") && (
            <div className="space-y-1.5">
              <p className="text-sm text-red-500">New analyses are indexed automatically. To index your existing library now:</p>
              <button onClick={handleReindexAll} disabled={reindexing}
                className="text-sm font-mono font-bold text-white px-3 py-1 rounded disabled:opacity-50"
                style={{ background: "#dc2626", border: "1px solid #b91c1c" }}>
                {reindexing ? "Indexing..." : "Index my library now"}
              </button>
              {reindexMsg && <p className="text-sm text-emerald-600">{reindexMsg}</p>}
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="rounded-xl h-16" style={{ background: "#c8d8e4", border: "1px solid #bcd0de" }} />
          {[220, 260, 200].map((h, i) => (
            <div key={i} className="rounded-2xl" style={{ height: `${h}px`, background: "#c8d8e4", border: "1px solid #bcd0de" }} />
          ))}
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="space-y-5">

          {/* Stats header with topic intent */}
          <div className="rounded-2xl p-5 space-y-3"
            style={{ background: "white", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="space-y-1.5 flex-1 min-w-0">
                <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Topic</p>
                <h2 className="text-xl font-black text-slate-900">{report.topic}</h2>
                {report.topicIntent && (
                  <p className="text-sm text-slate-500 leading-relaxed">{report.topicIntent}</p>
                )}
              </div>
              <div className="flex items-center gap-6 text-sm font-mono text-slate-400 shrink-0">
                <div className="text-center">
                  <p className="text-xl font-black text-slate-900">{report.videosMatched}</p>
                  <p className="text-xs">videos</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-slate-900">{report.creatorsMatched}</p>
                  <p className="text-xs">creators</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-slate-900">{report.quotesMatched}</p>
                  <p className="text-xs">quotes</p>
                </div>
              </div>
            </div>
          </div>

          {/* Escalation CTA — offer Deep Research when signal is strong */}
          {onDeepResearch && report.creatorsMatched >= 5 && report.quotesMatched >= 20 && (
            <div className="rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
              style={{ background: "#0f172a", border: "1px solid #1e3a5f" }}>
              <div className="space-y-0.5 min-w-0">
                <p className="text-[10px] font-mono font-black text-sky-400 uppercase tracking-widest">Strong Signal — Ready for Deep Research</p>
                <p className="text-sm text-slate-400">
                  {report.creatorsMatched} creators · {report.quotesMatched} quotes
                  {keyThemes.some(t => t.contrarians.length > 0) ? " · contradictions detected" : ""}
                  {" "}— enough evidence to run opportunity discovery and market analysis.
                </p>
              </div>
              <button
                type="button"
                onClick={onDeepResearch}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black shrink-0 transition-all hover:opacity-90"
                style={{ background: "#38bdf8", color: "#0f172a" }}>
                ⚡ Deep Research
              </button>
            </div>
          )}

          {/* Consensus Answer — top-level synthesis before themes */}
          {keyThemes.length > 0 && <ConsensusAnswer report={report} />}

          {/* Key Findings */}
          {keyThemes.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">
                Evidence Themes — {keyThemes.length} {keyThemes.length === 1 ? "theme" : "themes"}
              </p>
              {keyThemes.map((theme, i) => (
                <ThemeCard key={i} theme={theme} index={i} creatorAuthority={report.creatorAuthority} />
              ))}
            </div>
          )}

          {/* ── Topic Mismatch: evidence found but for the wrong topic ─────── */}
          {report.constraintValidation?.matchType === "NO_MATCH" && (
            <div className="rounded-xl px-5 py-4 space-y-4"
              style={{ background: "#fef2f2", border: "1px solid #fca5a5" }}>
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono font-black text-red-600 uppercase tracking-widest">⊘ Topic Mismatch — Evidence Gap Detected</p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Your library contains content, but no creators explicitly discuss the specific topic you searched.
                  The retrieved evidence does not satisfy the required constraints for this query.
                </p>
              </div>

              {report.constraintValidation.failedConstraints.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono font-black text-red-500 uppercase tracking-widest">Missing Constraints</p>
                  <ul className="space-y-1">
                    {report.constraintValidation.failedConstraints.map((fc, i) => (
                      <li key={i} className="text-sm font-mono text-red-600 pl-3 border-l-2"
                        style={{ borderColor: "#fca5a5" }}>
                        {fc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.constraintValidation.adjacentTopics.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest">What Your Library Does Cover</p>
                  <div className="flex flex-wrap gap-2">
                    {report.constraintValidation.adjacentTopics.map(t => (
                      <span key={t} className="text-xs font-mono px-2.5 py-1 rounded-md text-slate-500"
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {report.suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest">Try a query your library can answer</p>
                  <div className="flex flex-wrap gap-2">
                    {report.suggestions.map(s => (
                      <button key={s} onClick={() => void runSearch(s)}
                        className="text-sm font-mono px-3 py-1.5 rounded-lg transition-colors text-slate-600 hover:text-sky-700"
                        style={{ border: "1px solid #e2e8f0", background: "white" }}>
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
              style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-mono font-black text-amber-700 uppercase tracking-widest">
                  ⚠ Partial Evidence Coverage
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-slate-500">
                    Direct: <span className="text-amber-600">{report.constraintValidation.directCoverage}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Bridge: <span className="text-amber-600">{Math.round(report.constraintValidation.bridgeScore * 100)}%</span>
                  </span>
                </div>
              </div>

              {report.constraintValidation.bridgeCoveredComponents.length > 0 && (
                <p className="text-xs text-slate-600">
                  Structural alignment found via conceptual bridge
                  {" "}({report.constraintValidation.bridgeCoveredComponents.join(", ")} components).
                  Findings may include indirect evidence — claims are labeled accordingly.
                </p>
              )}

              {report.constraintValidation.failedConstraints.length > 0 && (
                <ul className="space-y-0.5 pt-0.5">
                  {report.constraintValidation.failedConstraints.map((fc, i) => (
                    <li key={i} className="text-xs font-mono text-amber-600">↳ {fc}</li>
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
                  style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
                  <p className="text-sm font-mono font-black text-amber-700 uppercase tracking-widest">Limited Evidence</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Relevant references found, but not enough independent creator agreement to establish strong consensus.
                    {" "}Each finding below comes from a single source — treat as a signal, not a conclusion.
                  </p>
                </div>
                {report.limitedThemes.map((theme, i) => (
                  <ThemeCard key={i} theme={theme} index={i} limited creatorAuthority={report.creatorAuthority} />
                ))}
              </div>
            );

            // STATE 2 — Intelligence layer signals: no direct transcript evidence but synthesized data exists
            if (hasIntel) return (
              <div className="rounded-xl px-5 py-4 space-y-4"
                style={{ background: "white", border: "1px solid #fcd34d", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div className="space-y-1">
                  <p className="text-sm font-mono font-black text-amber-700 uppercase tracking-widest">Intelligence Layer Signals</p>
                  <p className="text-sm text-slate-600 leading-relaxed">Evidence exists in synthesized intelligence but direct quote coverage is limited. Analyze specific videos on this topic to generate direct quotes and timestamps.</p>
                </div>
                <div className="space-y-3">
                  {report.intelligenceSignals.map((sig, i) => (
                    <IntelligenceSignalCard key={i} signal={sig} />
                  ))}
                </div>
                {hasSuggestions && (
                  <div className="pt-1 space-y-2">
                    <p className="text-xs font-mono text-slate-500">Or search a topic with direct transcript coverage:</p>
                    <div className="flex flex-wrap gap-2">
                      {report.suggestions.map(s => (
                        <button key={s} onClick={() => void runSearch(s)}
                          className="text-sm font-mono px-3 py-1.5 rounded-lg transition-colors text-slate-600 hover:text-sky-700"
                          style={{ border: "1px solid #e2e8f0", background: "#f8fafc" }}>
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
                style={{ background: "#fef2f2", border: "1px solid #fca5a5" }}>
                <div className="space-y-1">
                  <p className="text-sm font-mono font-black text-red-600 uppercase tracking-widest">Insufficient Evidence</p>
                  <p className="text-sm text-slate-600">
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
                        className="text-sm font-mono px-3 py-1.5 rounded-lg transition-colors text-slate-600 hover:text-sky-700"
                        style={{ border: "1px solid #e2e8f0", background: "white" }}>
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
          <ResearchChat report={report} activeFindingIndex={null} />

          {/* Debug panel */}
          {debugData && <DebugPanel data={debugData} />}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#e2e8f0" }}>
            <p className="text-xs font-mono text-slate-400">
              {report.totalIndexed} data points · Quotes from real creator content
            </p>
            <button
              onClick={() => { setReport(null); setDebugData(null); setError(null); setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="text-sm font-mono text-sky-600 hover:text-sky-800 transition-colors">
              New search →
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
