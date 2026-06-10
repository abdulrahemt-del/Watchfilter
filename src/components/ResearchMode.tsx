"use client";

import { useState, useRef } from "react";
import type {
  ResearchReport,
  ResearchFinding,
  ContraFinding,
  SourceRef,
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

const CONFIDENCE_META = {
  High:     { color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.25)", label: "HIGH CONFIDENCE" },
  Moderate: { color: "#fbbf24", bg: "rgba(251,191,36,0.07)",  border: "rgba(251,191,36,0.25)",  label: "MODERATE CONFIDENCE" },
  Limited:  { color: "#f87171", bg: "rgba(248,113,113,0.07)", border: "rgba(248,113,113,0.25)", label: "LIMITED EVIDENCE" },
};

const QUALITY_META = {
  Strong:   { color: "#10b981", label: "Strong Evidence" },
  Moderate: { color: "#fbbf24", label: "Moderate Evidence" },
  Limited:  { color: "#f87171", label: "Limited Evidence" },
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

// ── Source citation card ──────────────────────────────────────────────────────

function SourceCitation({ ref: r, index }: { ref: SourceRef; index: number }) {
  const sigColor = SIGNAL_COLOR[r.signalStrength ?? ""] ?? "#94a3b8";
  const link = ytUrl(r.videoId, r.timestampStr);

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{
        background: "rgba(15,37,53,0.6)",
        border: "1px solid #1e2d45",
        boxShadow: "inset 0 1px #ffffff05",
      }}
    >
      {/* Creator row */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <p className="text-[11px] font-mono font-black text-slate-300 uppercase tracking-wider truncate">
            {r.creator}
          </p>
          <p className="text-[10px] font-mono text-slate-500 truncate">{r.videoTitle}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {r.signalStrength && (
            <span
              className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
              style={{ color: sigColor, background: `${sigColor}15`, border: `1px solid ${sigColor}35` }}
            >
              {r.signalStrength}
            </span>
          )}
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono font-bold text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-400/50 px-2 py-0.5 rounded transition-colors"
          >
            {r.timestampStr ? `@${r.timestampStr} ↗` : "Watch ↗"}
          </a>
        </div>
      </div>

      {/* Quote */}
      {r.quote && (
        <blockquote className="border-l-2 border-blue-500/40 pl-3">
          <p className="text-sm text-slate-200 italic leading-relaxed">
            &ldquo;{r.quote}&rdquo;
          </p>
        </blockquote>
      )}

      {/* Why it supports */}
      {r.whyItSupports && (
        <p className="text-[11px] text-slate-400 leading-relaxed">
          <span className="font-mono font-black text-slate-500 not-italic">WHY THIS MATTERS: </span>
          {r.whyItSupports}
        </p>
      )}

      <span className="text-[9px] font-mono text-slate-600">Source {index + 1}</span>
    </div>
  );
}

// ── Finding block ─────────────────────────────────────────────────────────────

function FindingBlock({ finding, index }: { finding: ResearchFinding; index: number }) {
  const [open, setOpen] = useState(true);
  const meta = CONFIDENCE_META[finding.confidence];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e2d45", boxShadow: "0 4px 24px #0000002a,inset 0 1px #ffffff08" }}>
      {/* Finding header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-5 space-y-3 transition-colors"
        style={{ background: "linear-gradient(140deg,#0f2535 0%,#0e3154 100%)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-[11px] font-mono font-black text-slate-500 shrink-0 mt-0.5">
              FINDING {index + 1}
            </span>
            <p className="text-sm font-bold text-white leading-snug">{finding.statement}</p>
          </div>
          <span className="text-[10px] font-mono text-slate-600 shrink-0">{open ? "▲" : "▼"}</span>
        </div>

        <div className="flex items-center gap-2 pl-[4.5rem]">
          <span
            className="text-[9px] font-mono font-black px-2 py-0.5 rounded"
            style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
          >
            {meta.label}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {finding.sourceCount} {finding.sourceCount === 1 ? "source" : "independent sources"}
          </span>
        </div>
      </button>

      {/* Evidence under this finding */}
      {open && (
        <div
          className="border-t px-5 pb-5 pt-4 space-y-3"
          style={{ borderColor: "#1e2d45", background: "rgba(10,20,35,0.7)" }}
        >
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Supporting Evidence</p>
          {finding.sourceRefs.map((ref, i) => (
            <SourceCitation key={i} ref={ref} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Contrarian block ──────────────────────────────────────────────────────────

function ContraBlock({ contra }: { contra: ContraFinding }) {
  const [open, setOpen] = useState(true);
  const link = ytUrl(contra.sourceRef.videoId, contra.sourceRef.timestampStr);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(251,191,36,0.25)", boxShadow: "0 4px 24px #0000002a,inset 0 1px #ffffff05" }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-5 space-y-3 transition-colors"
        style={{ background: "linear-gradient(140deg,#1a1200 0%,#0f2535 100%)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-[11px] font-mono font-black text-amber-600 shrink-0 mt-0.5">
              CONTRARIAN
            </span>
            <p className="text-sm font-bold text-amber-200 leading-snug">{contra.statement}</p>
          </div>
          <span className="text-[10px] font-mono text-amber-800 shrink-0">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div
          className="border-t px-5 pb-5 pt-4 space-y-3"
          style={{ borderColor: "rgba(251,191,36,0.15)", background: "rgba(10,20,35,0.7)" }}
        >
          <p className="text-[10px] font-mono text-amber-700 uppercase tracking-widest">Source</p>
          <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid rgba(251,191,36,0.2)", background: "rgba(15,37,53,0.6)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-[11px] font-mono font-black text-amber-300 uppercase tracking-wider truncate">
                  {contra.sourceRef.creator}
                </p>
                <p className="text-[10px] font-mono text-amber-700 truncate">{contra.sourceRef.videoTitle}</p>
              </div>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono font-bold text-amber-400 hover:text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded transition-colors shrink-0"
              >
                {contra.sourceRef.timestampStr ? `@${contra.sourceRef.timestampStr} ↗` : "Watch ↗"}
              </a>
            </div>
            {contra.sourceRef.quote && (
              <blockquote className="border-l-2 border-amber-500/40 pl-3">
                <p className="text-sm text-amber-200 italic leading-relaxed">
                  &ldquo;{contra.sourceRef.quote}&rdquo;
                </p>
              </blockquote>
            )}
            {contra.sourceRef.whyItSupports && (
              <p className="text-[11px] text-amber-600 leading-relaxed">
                <span className="font-mono font-black">WHY THIS MATTERS: </span>
                {contra.sourceRef.whyItSupports}
              </p>
            )}
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

  const qualityMeta = report ? QUALITY_META[report.evidenceQuality] : null;

  return (
    <div
      className="min-h-screen text-slate-100 p-8 space-y-6 max-w-6xl mx-auto"
      style={{ background: "linear-gradient(140deg,#0f2535 0%,#166088 55%,#0e3154 100%)" }}
    >

      {/* Header */}
      <div className="space-y-1">
        <p className="text-sm font-mono font-black text-[#38bdf8] uppercase tracking-widest">Research Mode</p>
        <p className="text-xs text-slate-400 font-mono">
          Evidence-first search across {report?.totalIndexed ? `${report.totalIndexed} indexed data points` : "your analyzed video library"}.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={e => { e.preventDefault(); void runSearch(query); }} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search everything you've learned..."
          className="flex-1 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none font-mono"
          style={{ background: "rgba(15,37,53,0.7)", border: "1px solid #1e2d45" }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 py-3 bg-[#38bdf8] hover:bg-[#7dd3fc] disabled:opacity-40 text-[#0f2535] text-sm font-black rounded-xl transition-colors whitespace-nowrap"
        >
          {loading ? "Researching..." : "Search"}
        </button>
      </form>

      {/* Suggested queries */}
      {!report && !loading && (
        <div className="space-y-3">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Suggested searches</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map(s => (
              <button
                key={s}
                onClick={() => { setQuery(s); void runSearch(s); }}
                className="text-[11px] font-mono px-3 py-1.5 rounded-lg transition-colors text-slate-300 hover:text-[#38bdf8]"
                style={{ border: "1px solid #1e2d45", background: "rgba(15,37,53,0.5)" }}
              >
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
              <p className="text-[11px] text-red-400/70">
                New analyses index automatically. To index your existing library:
              </p>
              <button
                onClick={handleReindexAll}
                disabled={reindexing}
                className="text-[11px] font-mono font-bold text-white px-3 py-1 rounded disabled:opacity-50 transition-colors"
                style={{ background: "rgba(127,29,29,0.5)", border: "1px solid rgba(185,28,28,0.5)" }}
              >
                {reindexing ? "Indexing..." : "Index my library now"}
              </button>
              {reindexMsg && <p className="text-[11px] text-emerald-400">{reindexMsg}</p>}
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-20 rounded-2xl" style={{ background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
          <div className="h-48 rounded-2xl" style={{ background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
          <div className="h-48 rounded-2xl" style={{ background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
          <div className="h-32 rounded-2xl" style={{ background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="space-y-5">

          {/* Report header */}
          <div className="rounded-2xl p-5 space-y-4"
            style={{ background: "rgba(15,37,53,0.7)", border: "1px solid #1e2d45", boxShadow: "0 4px 32px #0000002e,inset 0 1px #ffffff08" }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 min-w-0">
                <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Intelligence Report</p>
                <h2 className="text-base font-black text-white leading-tight">{report.topic}</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {/* Evidence quality */}
                <span
                  className="text-[10px] font-mono font-black px-2.5 py-1 rounded-lg"
                  style={{ color: qualityMeta?.color, background: `${qualityMeta?.color}15`, border: `1px solid ${qualityMeta?.color}30` }}
                >
                  {qualityMeta?.label}
                </span>
                {/* Stats */}
                <div className="flex gap-3 text-[11px] font-mono text-slate-400">
                  <span><span className="text-white font-black">{report.creatorsMatched}</span> creators</span>
                  <span><span className="text-white font-black">{report.videosMatched}</span> videos</span>
                  <span><span className="text-white font-black">{report.consensusScore}/10</span> consensus</span>
                  <span>
                    <span
                      className="font-black"
                      style={{ color: report.confidenceScore >= 70 ? "#10b981" : report.confidenceScore >= 50 ? "#fbbf24" : "#f87171" }}
                    >
                      {report.confidenceScore}%
                    </span>{" "}
                    confidence
                  </span>
                </div>
              </div>
            </div>

            {/* Summary — clearly labelled as synthesis */}
            <div className="border-t pt-3" style={{ borderColor: "#1e2d45" }}>
              <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-1.5">Summary</p>
              <p className="text-sm text-slate-300 leading-relaxed">{report.summary}</p>
            </div>
          </div>

          {/* Findings — each with inline evidence */}
          {report.findings.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
                Findings — {report.findings.length} with cited evidence
              </p>
              {report.findings.map((f, i) => (
                <FindingBlock key={i} finding={f} index={i} />
              ))}
            </div>
          )}

          {/* Contrarian */}
          {report.contrarian && (
            <div className="space-y-3">
              <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Dissenting View</p>
              <ContraBlock contra={report.contrarian} />
            </div>
          )}

          {/* Implications */}
          {report.implications.length > 0 && (
            <div className="rounded-2xl p-5 space-y-3"
              style={{ background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }}>
              <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Strategic Implications</p>
              {report.implications.map((imp, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="text-red-400 shrink-0 mt-0.5">→</span>
                  <div className="space-y-0.5">
                    <p className="text-sm text-slate-300 leading-relaxed">{imp.statement}</p>
                    <p className="text-[10px] font-mono text-slate-600">{imp.basedOnFindings}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {report.actions.length > 0 && (
            <div className="rounded-2xl p-5 space-y-3"
              style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <p className="text-[10px] font-mono text-emerald-700 uppercase tracking-widest">Action Opportunities</p>
              {report.actions.map((a, i) => (
                <div key={i} className="rounded-xl p-4 space-y-1.5"
                  style={{ background: "rgba(15,37,53,0.5)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <p className="text-sm font-bold text-emerald-300">{a.title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{a.description}</p>
                  <p className="text-[10px] font-mono text-emerald-800">{a.derivedFrom}</p>
                </div>
              ))}
            </div>
          )}

          {/* Evidence gaps */}
          {report.evidenceGaps && (
            <div className="rounded-xl px-4 py-3 flex gap-3 items-start"
              style={{ background: "rgba(15,37,53,0.5)", border: "1px solid #1e2d45" }}>
              <span className="text-[10px] font-mono font-black text-slate-600 uppercase tracking-wider shrink-0 pt-0.5">GAPS</span>
              <p className="text-xs text-slate-500 leading-relaxed">{report.evidenceGaps}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#1e2d45" }}>
            <p className="text-[10px] font-mono text-slate-700">
              {report.totalIndexed} data points searched · Evidence-first synthesis
            </p>
            <button
              onClick={() => { setReport(null); setError(null); setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="text-[11px] font-mono text-blue-500 hover:text-blue-400 transition-colors"
            >
              New search →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
