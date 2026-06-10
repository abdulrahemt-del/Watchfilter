"use client";

import { useState, useRef } from "react";
import type {
  ResearchReport,
  ResearchTheme,
  ThemeSource,
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

// Theme accent colors — cycle through these
const THEME_COLORS = [
  { accent: "#38bdf8", border: "rgba(56,189,248,0.28)",  bg: "rgba(56,189,248,0.06)"  },
  { accent: "#10b981", border: "rgba(16,185,129,0.28)",  bg: "rgba(16,185,129,0.06)"  },
  { accent: "#a78bfa", border: "rgba(167,139,250,0.28)", bg: "rgba(167,139,250,0.06)" },
  { accent: "#f97316", border: "rgba(249,115,22,0.28)",  bg: "rgba(249,115,22,0.06)"  },
  { accent: "#fbbf24", border: "rgba(251,191,36,0.28)",  bg: "rgba(251,191,36,0.06)"  },
  { accent: "#e879f9", border: "rgba(232,121,249,0.28)", bg: "rgba(232,121,249,0.06)" },
];

const SUGGESTED = [
  "AI agents",
  "pricing strategy",
  "founder market fit",
  "distribution channels",
  "customer acquisition",
  "retention",
  "product launches",
  "fundraising",
];

// ── Quote card ────────────────────────────────────────────────────────────────

function QuoteCard({ source, accent }: { source: ThemeSource; accent: string }) {
  const sigColor = SIGNAL_COLOR[source.signalStrength ?? ""] ?? "#94a3b8";
  const link = ytUrl(source.videoId, source.timestampStr);

  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: "rgba(8,16,28,0.6)", border: "1px solid #1e2d45" }}>
      {/* Creator + video + timestamp */}
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

      {/* Quote */}
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

// ── Theme card ────────────────────────────────────────────────────────────────

function ThemeCard({ theme, index }: { theme: ResearchTheme; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const color = THEME_COLORS[index % THEME_COLORS.length];
  const otherSources = theme.sources.filter(s => s !== theme.representativeQuote);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${color.border}`, boxShadow: "0 4px 24px #00000025" }}>

      {/* Theme header */}
      <div className="p-5 space-y-4"
        style={{ background: "linear-gradient(140deg,#0c1e30 0%,#0e2d4a 100%)" }}>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-xs font-mono font-black shrink-0 mt-0.5 px-1.5 py-0.5 rounded"
              style={{ color: color.accent, background: color.bg, border: `1px solid ${color.border}` }}>
              T{index + 1}
            </span>
            <h3 className="text-base font-black text-white leading-snug">{theme.title}</h3>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs font-mono text-slate-500">
            <span><span className="text-white font-black">{theme.creatorCount}</span> {theme.creatorCount === 1 ? "creator" : "creators"}</span>
            <span><span className="text-white font-black">{theme.quoteCount}</span> {theme.quoteCount === 1 ? "quote" : "quotes"}</span>
          </div>
        </div>

        {/* Description */}
        <p className="text-base text-slate-300 leading-relaxed">{theme.description}</p>

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

// ── Synthesis panel ───────────────────────────────────────────────────────────

function SynthesisPanel({ synthesis }: { synthesis: string }) {
  if (!synthesis) return null;
  return (
    <div className="rounded-2xl p-5 space-y-3"
      style={{ background: "rgba(15,37,53,0.65)", border: "1px solid rgba(16,185,129,0.25)" }}>
      <p className="text-xs font-mono font-black text-emerald-700 uppercase tracking-widest">What Creators Are Saying</p>
      <p className="text-base text-slate-200 leading-relaxed">{synthesis}</p>
    </div>
  );
}

// ── Disagreements panel ───────────────────────────────────────────────────────

function DisagreementsPanel({ disagreements }: { disagreements: string[] }) {
  if (!disagreements.length) return null;
  return (
    <div className="rounded-2xl p-5 space-y-3"
      style={{ background: "rgba(15,37,53,0.65)", border: "1px solid rgba(251,191,36,0.25)" }}>
      <p className="text-xs font-mono font-black text-amber-700 uppercase tracking-widest">What Creators Disagree On</p>
      <div className="space-y-2">
        {disagreements.map((d, i) => (
          <div key={i} className="flex gap-3 items-start">
            <span className="text-amber-500 shrink-0 mt-0.5 font-black">⟷</span>
            <p className="text-base text-slate-300 leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Takeaways panel ───────────────────────────────────────────────────────────

function TakeawaysPanel({ takeaways }: { takeaways: string[] }) {
  if (!takeaways.length) return null;
  return (
    <div className="rounded-2xl p-5 space-y-3"
      style={{ background: "rgba(15,37,53,0.65)", border: "1px solid rgba(56,189,248,0.25)" }}>
      <p className="text-xs font-mono font-black text-[#38bdf8]/70 uppercase tracking-widest">Actionable Takeaways</p>
      <div className="space-y-2.5">
        {takeaways.map((t, i) => (
          <div key={i} className="flex gap-3 items-start">
            <span className="text-[#38bdf8] shrink-0 mt-0.5 font-black">→</span>
            <p className="text-base text-slate-300 leading-relaxed">{t}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ResearchMode() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);
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
    try {
      const res = await fetch("/api/research/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json() as ResearchReport & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Research failed");
      } else {
        setReport(data);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen text-slate-100 p-8 space-y-6 max-w-6xl mx-auto"
      style={{ background: "linear-gradient(140deg,#0f2535 0%,#166088 55%,#0e3154 100%)" }}>

      {/* Header */}
      <div className="space-y-1">
        <p className="text-base font-mono font-black text-[#38bdf8] uppercase tracking-widest">Research Mode</p>
        <p className="text-sm text-slate-400 font-mono">
          What are creators saying about this topic?
          {report?.totalIndexed ? ` Searching ${report.totalIndexed} indexed data points.` : ""}
        </p>
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
          <div className="rounded-xl h-12" style={{ background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
          {[180, 220, 200, 180].map((h, i) => (
            <div key={i} className="rounded-2xl" style={{ height: `${h}px`, background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
          ))}
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="space-y-5">

          {/* Stats header */}
          <div className="rounded-2xl p-5"
            style={{ background: "rgba(15,37,53,0.8)", border: "1px solid #1e2d45", boxShadow: "inset 0 1px #ffffff08" }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Topic</p>
                <h2 className="text-xl font-black text-white">{report.topic}</h2>
              </div>
              <div className="flex items-center gap-6 text-sm font-mono text-slate-400">
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
          {report.themes.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                Key Themes — {report.themes.length} {report.themes.length === 1 ? "theme" : "themes"} identified
              </p>
              {report.themes.map((theme, i) => (
                <ThemeCard key={i} theme={theme} index={i} />
              ))}
            </div>
          )}

          {report.themes.length === 0 && (
            <div className="rounded-xl px-5 py-4"
              style={{ background: "rgba(15,37,53,0.5)", border: "1px solid #1e2d45" }}>
              <p className="text-sm text-slate-500">No recurring themes found. Try a different search term or index more videos.</p>
            </div>
          )}

          {/* What Creators Are Saying */}
          <SynthesisPanel synthesis={report.synthesis} />

          {/* What Creators Disagree On */}
          <DisagreementsPanel disagreements={report.disagreements} />

          {/* Actionable Takeaways */}
          <TakeawaysPanel takeaways={report.takeaways} />

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#1e2d45" }}>
            <p className="text-xs font-mono text-slate-700">
              {report.totalIndexed} data points · Quotes from real creator content
            </p>
            <button
              onClick={() => { setReport(null); setError(null); setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="text-sm font-mono text-[#38bdf8] hover:text-white transition-colors">
              New search →
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
