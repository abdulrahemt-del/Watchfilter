"use client";

import { useState, useRef } from "react";
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

function ThemeCard({ theme, index }: { theme: ResearchTheme; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [showConsensus, setShowConsensus] = useState(false);
  const color = THEME_COLORS[index % THEME_COLORS.length];
  const otherSources = theme.sources.filter(s => s !== theme.representativeQuote);

  const confidenceColor =
    theme.confidence >= 85 ? "#10b981"
    : theme.confidence >= 70 ? "#38bdf8"
    : theme.confidence >= 55 ? "#fbbf24"
    : "#ef4444";

  const hasConsensusData =
    theme.creatorConsensus.agree.length > 0 ||
    theme.creatorConsensus.neutral.length > 0 ||
    theme.creatorConsensus.disagree.length > 0;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${color.border}`, boxShadow: "0 4px 24px #00000025" }}>

      <div className="p-5 space-y-4"
        style={{ background: "linear-gradient(140deg,#0c1e30 0%,#0e2d4a 100%)" }}>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-xs font-mono font-black shrink-0 mt-1 px-1.5 py-0.5 rounded"
              style={{ color: color.accent, background: color.bg, border: `1px solid ${color.border}` }}>
              T{index + 1}
            </span>
            <div className="min-w-0 space-y-1.5">
              <h3 className="text-base font-black text-white leading-snug">{theme.title}</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-emerald-500">
                  ● Key Theme
                </span>
                <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded"
                  style={{ color: confidenceColor, background: `${confidenceColor}12`, border: `1px solid ${confidenceColor}28` }}>
                  {theme.confidence}% · {theme.consensusStrength}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0 text-xs font-mono text-slate-500">
            <span><span className="text-white font-black">{theme.creatorCount}</span> creators</span>
            <span><span className="text-white font-black">{theme.videoCount}</span> videos</span>
            <span><span className="text-white font-black">{theme.quoteCount}</span> quotes</span>
          </div>
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

        {/* Contrarians */}
        {theme.contrarians.length > 0 && (
          <div className="rounded-xl p-4 space-y-3"
            style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.18)" }}>
            <p className="text-[10px] font-mono font-black text-amber-500 uppercase tracking-widest">⚠ Contrarian View</p>
            {theme.contrarians.map((c, i) => (
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
            ))}
          </div>
        )}

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

// ── Synthesis panel ───────────────────────────────────────────────────────────

function SynthesisPanel({ synthesis }: { synthesis: string }) {
  if (!synthesis) return null;
  return (
    <div className="rounded-2xl p-5 space-y-3"
      style={{ background: "rgba(15,37,53,0.65)", border: "1px solid rgba(16,185,129,0.25)" }}>
      <p className="text-xs font-mono font-black text-emerald-700 uppercase tracking-widest">Research Synthesis</p>
      <p className="text-base text-slate-200 leading-relaxed">{synthesis}</p>
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

// ── Main component ────────────────────────────────────────────────────────────

export function ResearchMode() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ResearchReport | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [debugData, setDebugData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
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
            color: debugMode ? "#a78bfa" : "#334155",
            background: debugMode ? "rgba(167,139,250,0.1)" : "transparent",
            border: `1px solid ${debugMode ? "rgba(167,139,250,0.3)" : "#1e2d45"}`,
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

          {/* Key Themes */}
          {keyThemes.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                Key Themes — {keyThemes.length} {keyThemes.length === 1 ? "theme" : "themes"}
              </p>
              {keyThemes.map((theme, i) => (
                <ThemeCard key={i} theme={theme} index={i} />
              ))}
            </div>
          )}

          {/* Zero-evidence state */}
          {keyThemes.length === 0 && (
            <div className="space-y-3">

              {/* Intelligence layer signals — shown when synthesized data exists but no direct quotes */}
              {report.intelligenceSignals.length > 0 ? (
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
                  {report.suggestions.length > 0 && (
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
              ) : (
                /* Hard insufficient evidence — nothing in any layer */
                <div className="rounded-xl px-5 py-4 space-y-3"
                  style={{ background: "rgba(15,37,53,0.5)", border: "1px solid rgba(185,28,28,0.3)" }}>
                  <div className="space-y-1">
                    <p className="text-sm font-mono font-black text-red-400/70 uppercase tracking-widest">Insufficient Evidence</p>
                    <p className="text-sm text-slate-500">No creators in your library explicitly discuss this topic. Analyze more videos on this subject, or try one of these topics that are present in your library:</p>
                  </div>
                  {report.suggestions.length > 0 && (
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
              )}
            </div>
          )}

          {/* Related Signals */}
          <RelatedSignalsPanel signals={report.relatedSignals} />

          {/* What the Evidence Suggests */}
          <SynthesisPanel synthesis={report.synthesis} />

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
