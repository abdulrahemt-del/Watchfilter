"use client";

import { useState, useRef } from "react";
import type { ResearchReport, EvidenceItem } from "@/app/api/research/search/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ytTimestampUrl(videoId: string, ts: string | null): string {
  if (!ts) return `https://www.youtube.com/watch?v=${videoId}`;
  // parse M:SS or H:MM:SS → seconds
  const parts = ts.split(":").map(Number);
  const secs = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts.length === 2
    ? parts[0] * 60 + parts[1]
    : parts[0];
  return `https://www.youtube.com/watch?v=${videoId}&t=${secs}s`;
}

const SIGNAL_COLOR: Record<string, string> = {
  "Very High": "#10b981",
  "High":      "#6ee7b7",
  "Medium":    "#fbbf24",
  "Low":       "#94a3b8",
};

const SUGGESTED = [
  "pricing strategy",
  "founder market fit",
  "distribution channels",
  "AI agents",
  "customer acquisition",
  "retention",
  "product launches",
  "fundraising",
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBadge({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl px-4 py-3 min-w-[90px]">
      <span className="text-lg font-black" style={{ color: color ?? "#e2e8f0" }}>{value}</span>
      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mt-0.5">{label}</span>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[11px] font-mono font-black uppercase tracking-widest" style={{ color }}>{title}</span>
      </div>
      <div className="pl-3.5">{children}</div>
    </div>
  );
}

function EvidenceCard({ item, rank }: { item: EvidenceItem; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const sigColor = SIGNAL_COLOR[item.signalStrength ?? ""] ?? "#94a3b8";
  const watchUrl = ytTimestampUrl(item.videoId, item.timestampStr);
  const relevance = Math.round(item.score * 100);

  return (
    <div
      className="border border-slate-800 rounded-xl p-4 space-y-2 hover:border-slate-600 transition-colors cursor-pointer"
      style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)" }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono text-slate-500 shrink-0">#{rank}</span>
          <span className="text-xs font-black text-slate-200 truncate">{item.channelName ?? "Unknown"}</span>
          {item.signalStrength && (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
              style={{ color: sigColor, background: `${sigColor}18`, border: `1px solid ${sigColor}40` }}>
              {item.signalStrength}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-slate-500 shrink-0">{relevance}% match</span>
      </div>

      <p className="text-[11px] text-slate-400 font-mono truncate">{item.videoTitle ?? "Unknown video"}</p>

      {item.quote && (
        <blockquote className="border-l-2 border-blue-500/50 pl-3 text-xs text-slate-300 italic leading-relaxed">
          &ldquo;{item.quote}&rdquo;
        </blockquote>
      )}

      {expanded && (
        <div className="space-y-2 pt-1 border-t border-slate-800">
          {item.insight && item.insight !== item.quote && (
            <p className="text-xs text-slate-300 font-medium leading-snug">{item.insight}</p>
          )}
          {item.whyMatters && (
            <p className="text-[11px] text-slate-400 leading-relaxed">{item.whyMatters}</p>
          )}
          {item.takeaway && (
            <p className="text-[11px] text-emerald-400 leading-relaxed">
              <span className="font-mono font-bold text-emerald-500">ACTION: </span>{item.takeaway}
            </p>
          )}
          {item.contrarian && (
            <p className="text-[11px] text-amber-400 leading-relaxed">
              <span className="font-mono font-bold text-amber-500">CONTRARIAN: </span>{item.contrarian}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          {item.timestampStr && (
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 hover:border-blue-400/50 px-2 py-0.5 rounded"
            >
              @{item.timestampStr} ↗
            </a>
          )}
          {!item.timestampStr && (
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors"
            >
              Watch ↗
            </a>
          )}
        </div>
        <span className="text-[9px] font-mono text-slate-600">{expanded ? "▲ less" : "▼ more"}</span>
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
  const [tab, setTab] = useState<"report" | "evidence">("report");
  const [filterChannel, setFilterChannel] = useState<string>("");
  const [filterSignal, setFilterSignal] = useState<string>("");
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleReindexAll() {
    setReindexing(true);
    setReindexMsg(null);
    try {
      const res = await fetch("/api/research/reindex-all", { method: "POST" });
      const data = await res.json() as { analyses: number; indexed: number; failed: number };
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
    setTab("report");

    try {
      const res = await fetch("/api/research/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          filters: {
            channel: filterChannel || undefined,
            signalStrength: filterSignal || undefined,
          },
        }),
      });
      const data = await res.json() as ResearchReport & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Search failed");
      } else {
        setReport(data);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runSearch(query);
  }

  const filteredEvidence = report?.evidence ?? [];
  const channels = [...new Set(filteredEvidence.map(e => e.channelName).filter(Boolean))] as string[];

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-black text-white tracking-tight">Research Mode</h1>
        <p className="text-sm text-slate-400 font-mono">
          Query your private knowledge base built from {report?.totalIndexed ? `${report.totalIndexed} indexed data points` : "all your analyzed videos"}.
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search everything you&apos;ve learned..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-black rounded-xl transition-colors whitespace-nowrap"
        >
          {loading ? "Researching..." : "Research"}
        </button>
      </form>

      {/* Suggested queries */}
      {!report && !loading && (
        <div className="space-y-3">
          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-widest">Try searching for</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map(s => (
              <button
                key={s}
                onClick={() => { setQuery(s); void runSearch(s); }}
                className="text-[11px] font-mono px-3 py-1.5 border border-slate-700 hover:border-blue-500/50 hover:text-blue-300 text-slate-400 rounded-lg transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-300 font-mono space-y-2">
          <p>{error}</p>
          {error.includes("indexed yet") && (
            <div className="space-y-1">
              <p className="text-[11px] text-red-400/70">
                New analyses are indexed automatically. To index your existing library:
              </p>
              <button
                onClick={handleReindexAll}
                disabled={reindexing}
                className="text-[11px] font-mono font-bold text-white bg-red-800/60 hover:bg-red-700/60 border border-red-700/50 px-3 py-1 rounded disabled:opacity-50 transition-colors"
              >
                {reindexing ? "Indexing library..." : "Index my library now"}
              </button>
              {reindexMsg && <p className="text-[11px] text-emerald-400">{reindexMsg}</p>}
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-24 bg-slate-800 rounded-xl" />
          <div className="grid grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-16 bg-slate-800 rounded-xl" />)}
          </div>
          <div className="h-48 bg-slate-800 rounded-xl" />
        </div>
      )}

      {/* Results */}
      {report && !loading && (
        <div className="space-y-6">

          {/* Summary header */}
          <div className="border border-slate-700 rounded-2xl p-5 space-y-4"
            style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f172a 100%)" }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Research Report</p>
                <h2 className="text-lg font-black text-white leading-tight">{report.topic}</h2>
              </div>
              <div className="flex gap-2 flex-wrap">
                <StatBadge label="Videos" value={report.videosMatched} color="#60a5fa" />
                <StatBadge label="Creators" value={report.creatorsMatched} color="#a78bfa" />
                <StatBadge label="Consensus" value={`${report.consensusScore}/10`} color="#34d399" />
                <StatBadge label="Confidence" value={`${report.confidenceScore}%`} color={report.confidenceScore >= 75 ? "#34d399" : report.confidenceScore >= 50 ? "#fbbf24" : "#f87171"} />
              </div>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{report.summary}</p>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 border-b border-slate-800 pb-0">
            {(["report", "evidence"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {t === "report" ? "Intelligence Report" : `Evidence (${report.evidence.length})`}
              </button>
            ))}
          </div>

          {/* Report tab */}
          {tab === "report" && (
            <div className="space-y-6">

              {/* Key Findings */}
              {report.keyFindings.length > 0 && (
                <Section title="Key Findings" color="#60a5fa">
                  <ul className="space-y-2">
                    {report.keyFindings.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-300 leading-relaxed">
                        <span className="text-blue-500 font-black shrink-0">{i + 1}.</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Consensus */}
                {report.consensus && (
                  <Section title="Consensus" color="#34d399">
                    <p className="text-sm text-slate-300 leading-relaxed">{report.consensus}</p>
                  </Section>
                )}

                {/* Contrarian */}
                {report.contrarian && (
                  <Section title="Contrarian View" color="#fbbf24">
                    <p className="text-sm text-slate-300 leading-relaxed">{report.contrarian}</p>
                  </Section>
                )}
              </div>

              {/* Patterns */}
              {report.patterns.length > 0 && (
                <Section title="Recurring Patterns" color="#a78bfa">
                  <div className="space-y-2">
                    {report.patterns.map((p, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="text-[10px] font-mono font-black text-purple-500 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                          P{i + 1}
                        </span>
                        <p className="text-sm text-slate-300 leading-relaxed">{p}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Implications */}
              {report.implications.length > 0 && (
                <Section title="Strategic Implications" color="#f87171">
                  <ul className="space-y-2">
                    {report.implications.map((imp, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-300 leading-relaxed">
                        <span className="text-red-400 shrink-0">→</span>
                        {imp}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Actions */}
              {report.actions.length > 0 && (
                <Section title="Action Opportunities" color="#34d399">
                  <div className="space-y-3">
                    {report.actions.map((a, i) => (
                      <div key={i} className="border border-emerald-900/50 rounded-xl p-3 space-y-1"
                        style={{ background: "rgba(16,185,129,0.04)" }}>
                        <p className="text-sm font-bold text-emerald-300">{a.title}</p>
                        <p className="text-xs text-slate-400 leading-relaxed">{a.description}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          )}

          {/* Evidence tab */}
          {tab === "evidence" && (
            <div className="space-y-4">

              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                <select
                  value={filterChannel}
                  onChange={e => setFilterChannel(e.target.value)}
                  className="text-xs font-mono bg-slate-900 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Creators</option>
                  {channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                </select>
                <select
                  value={filterSignal}
                  onChange={e => setFilterSignal(e.target.value)}
                  className="text-xs font-mono bg-slate-900 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Signals</option>
                  {["Very High", "High", "Medium", "Low"].map(s => <option key={s} value={s}>{s} Signal</option>)}
                </select>
                {(filterChannel || filterSignal) && (
                  <button
                    onClick={() => { setFilterChannel(""); setFilterSignal(""); }}
                    className="text-xs font-mono text-slate-400 hover:text-white px-2 py-1.5 border border-slate-700 rounded-lg transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Evidence grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredEvidence
                  .filter(e => !filterChannel || e.channelName === filterChannel)
                  .filter(e => !filterSignal || e.signalStrength === filterSignal)
                  .map((item, i) => (
                    <EvidenceCard key={item.id} item={item} rank={i + 1} />
                  ))}
              </div>
            </div>
          )}

          {/* New search prompt */}
          <div className="pt-4 border-t border-slate-800 flex items-center gap-3">
            <p className="text-xs text-slate-500 font-mono flex-1">
              {report.totalIndexed} data points indexed · Search refines automatically
            </p>
            <button
              onClick={() => { setReport(null); setError(null); setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="text-xs font-mono text-blue-400 hover:text-blue-300 transition-colors"
            >
              New search →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
