"use client";

import { useState, useRef } from "react";
import type {
  ResearchReport,
  ResearchFinding,
  ContraFinding,
  SourceRef,
  QuoteCluster,
  CreatorStance,
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
  High:     { color: "#10b981", bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.30)", label: "HIGH CONFIDENCE" },
  Moderate: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.30)",  label: "MODERATE CONFIDENCE" },
  Limited:  { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.30)", label: "LIMITED EVIDENCE" },
};

const STRENGTH_META: Record<string, { color: string; label: string }> = {
  Strong:      { color: "#10b981", label: "STRONG CONSENSUS" },
  Moderate:    { color: "#fbbf24", label: "MODERATE CONSENSUS" },
  Weak:        { color: "#f87171", label: "WEAK CONSENSUS" },
  Insufficient:{ color: "#94a3b8", label: "INSUFFICIENT EVIDENCE" },
};

const QUALITY_META: Record<string, { color: string; label: string }> = {
  Strong:       { color: "#10b981", label: "Strong Evidence" },
  Moderate:     { color: "#fbbf24", label: "Moderate Evidence" },
  Limited:      { color: "#f87171", label: "Limited Evidence" },
  Insufficient: { color: "#94a3b8", label: "Insufficient Evidence" },
};

const STANCE_META = {
  agree:    { color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.25)",  label: "AGREE" },
  neutral:  { color: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.20)", label: "NEUTRAL" },
  disagree: { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.25)", label: "DISAGREE" },
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

const CARD_STYLE = {
  background: "rgba(15,37,53,0.65)",
  border: "1px solid #1e2d45",
  boxShadow: "inset 0 1px #ffffff06",
};

// ── Source citation ───────────────────────────────────────────────────────────

function SourceCitation({ r, index }: { r: SourceRef; index: number }) {
  const sigColor = SIGNAL_COLOR[r.signalStrength ?? ""] ?? "#94a3b8";
  const link = ytUrl(r.videoId, r.timestampStr);

  return (
    <div className="rounded-xl p-4 space-y-3" style={CARD_STYLE}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-mono font-black text-slate-300 uppercase tracking-wider truncate">
            {r.creator}
          </p>
          <p className="text-xs font-mono text-slate-500 truncate">{r.videoTitle}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {r.signalStrength && (
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
              style={{ color: sigColor, background: `${sigColor}15`, border: `1px solid ${sigColor}35` }}>
              {r.signalStrength}
            </span>
          )}
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono font-bold text-[#38bdf8] hover:text-white border border-[#38bdf8]/30 hover:border-[#38bdf8]/60 px-2 py-0.5 rounded transition-colors"
          >
            {r.timestampStr ? `@${r.timestampStr} ↗` : "Watch ↗"}
          </a>
        </div>
      </div>

      {r.quote && (
        <blockquote className="border-l-2 border-[#38bdf8]/40 pl-3">
          <p className="text-base text-slate-200 italic leading-relaxed">
            &ldquo;{r.quote}&rdquo;
          </p>
        </blockquote>
      )}

      {r.whyItSupports && (
        <p className="text-sm text-slate-400 leading-relaxed">
          <span className="font-mono font-black text-slate-500">WHY THIS SUPPORTS: </span>
          {r.whyItSupports}
        </p>
      )}

      <span className="text-xs font-mono text-slate-700">Source {index + 1}</span>
    </div>
  );
}

// ── Quote cluster ─────────────────────────────────────────────────────────────

function ClusterBlock({ cluster, startIndex }: { cluster: QuoteCluster; startIndex: number }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1e2d45" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
        style={{ background: "rgba(22,96,136,0.18)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]/60 shrink-0" />
          <span className="text-sm font-mono font-black text-[#38bdf8] uppercase tracking-wider">
            {cluster.theme}
          </span>
          <span className="text-xs font-mono text-slate-500">
            {cluster.sourceRefs.length} {cluster.sourceRefs.length === 1 ? "quote" : "quotes"}
          </span>
        </div>
        <span className="text-xs font-mono text-slate-600">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3" style={{ background: "rgba(10,20,35,0.5)" }}>
          {cluster.sourceRefs.map((ref, i) => (
            <SourceCitation key={i} r={ref} index={startIndex + i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Finding block ─────────────────────────────────────────────────────────────

function FindingBlock({ finding, index }: { finding: ResearchFinding; index: number }) {
  const [open, setOpen] = useState(true);
  const cMeta = CONFIDENCE_META[finding.confidence];
  const sMeta = STRENGTH_META[finding.consensusStrength] ?? STRENGTH_META.Insufficient;

  let refCount = 0;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e2d45", boxShadow: "0 4px 24px #00000028,inset 0 1px #ffffff08" }}>

      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-5 space-y-3.5 transition-colors"
        style={{ background: "linear-gradient(140deg,#0f2535 0%,#0e3154 100%)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-xs font-mono font-black text-slate-500 shrink-0 mt-1">F{index + 1}</span>
            <p className="text-base font-bold text-white leading-snug">{finding.statement}</p>
          </div>
          <span className="text-xs font-mono text-slate-600 shrink-0">{open ? "▲" : "▼"}</span>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <span className="text-xs font-mono font-black px-2 py-0.5 rounded"
            style={{ color: cMeta.color, background: cMeta.bg, border: `1px solid ${cMeta.border}` }}>
            {cMeta.label}
          </span>
          <span className="text-xs font-mono font-black px-2 py-0.5 rounded"
            style={{ color: sMeta.color, background: `${sMeta.color}10`, border: `1px solid ${sMeta.color}30` }}>
            {sMeta.label}
          </span>
          <span className="text-xs font-mono text-slate-400">
            <span className="text-white font-bold">{finding.creatorCount}</span> creators
          </span>
          <span className="text-slate-600 font-mono text-xs">·</span>
          <span className="text-xs font-mono text-slate-400">
            <span className="text-white font-bold">{finding.videoCount}</span> videos
          </span>
          <span className="text-slate-600 font-mono text-xs">·</span>
          <span className="text-xs font-mono text-slate-400">
            <span className="text-white font-bold">{finding.evidenceCount}</span> quotes
          </span>
          <span className="text-slate-600 font-mono text-xs">·</span>
          <span className="text-xs font-mono"
            style={{ color: cMeta.color }}>
            {finding.confidenceScore}% confidence
          </span>
        </div>
      </button>

      {/* Clustered evidence */}
      {open && (
        <div className="px-5 pb-5 pt-4 space-y-3" style={{ background: "rgba(10,20,35,0.6)" }}>
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Supporting Evidence</p>
          {finding.clusters.map((cl, ci) => {
            const start = refCount;
            refCount += cl.sourceRefs.length;
            return <ClusterBlock key={ci} cluster={cl} startIndex={start} />;
          })}
        </div>
      )}
    </div>
  );
}

// ── Research questions panel ──────────────────────────────────────────────────

function ResearchQuestionsPanel({ questions }: { questions: string[] }) {
  if (!questions.length) return null;
  return (
    <div className="rounded-2xl p-5 space-y-3.5"
      style={{ background: "rgba(15,37,53,0.65)", border: "1px solid #1e2d45" }}>
      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Research Questions</p>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="flex gap-3 items-baseline">
            <span className="text-xs font-mono font-black shrink-0 w-6 text-right"
              style={{ color: "rgba(56,189,248,0.45)" }}>
              Q{i}
            </span>
            <p className="text-base text-slate-300 leading-relaxed">{q}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Grouped findings ──────────────────────────────────────────────────────────

function GroupedFindings({ findings, questions }: { findings: ResearchFinding[]; questions: string[] }) {
  if (!findings.length) return null;

  // Map findings to their question index
  const grouped: { qi: number; question: string; items: { f: ResearchFinding; fi: number }[] }[] =
    questions.map((q, qi) => ({
      qi,
      question: q,
      items: findings
        .map((f, fi) => ({ f, fi }))
        .filter(({ f }) => f.answersQuestion === qi),
    })).filter(g => g.items.length > 0);

  // Orphaned findings — answersQuestion out of range
  const orphaned = findings
    .map((f, fi) => ({ f, fi }))
    .filter(({ f }) => f.answersQuestion < 0 || f.answersQuestion >= questions.length);

  return (
    <div className="space-y-6">
      {grouped.map(({ qi, question, items }) => (
        <div key={qi} className="space-y-3">
          {/* Question header */}
          <div className="flex gap-3 items-start">
            <span
              className="text-xs font-mono font-black px-2 py-0.5 rounded shrink-0 mt-0.5"
              style={{ color: "#38bdf8", background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.25)" }}
            >
              Q{qi}
            </span>
            <p className="text-base font-bold text-slate-200 leading-snug">{question}</p>
          </div>

          {/* Findings under this question */}
          <div className="space-y-3 pl-8">
            {items.map(({ f, fi }) => (
              <FindingBlock key={fi} finding={f} index={fi} />
            ))}
          </div>
        </div>
      ))}

      {/* Orphaned findings (shouldn't happen but handle gracefully) */}
      {orphaned.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Additional Findings</p>
          {orphaned.map(({ f, fi }) => (
            <FindingBlock key={fi} finding={f} index={fi} />
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
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(251,191,36,0.28)", boxShadow: "inset 0 1px #ffffff05" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-5 space-y-2 transition-colors"
        style={{ background: "linear-gradient(140deg,#1a1200 0%,#0f2535 100%)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-xs font-mono font-black text-amber-600 shrink-0 mt-0.5">DISSENT</span>
            <p className="text-base font-bold text-amber-200 leading-snug">{contra.statement}</p>
          </div>
          <span className="text-xs font-mono text-amber-800 shrink-0">{open ? "▲" : "▼"}</span>
        </div>
        <p className="text-xs font-mono text-amber-800 pl-[3.5rem]">
          From evidence — not a hypothetical objection
        </p>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-4 space-y-3" style={{ background: "rgba(10,20,35,0.7)" }}>
          <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid rgba(251,191,36,0.2)", background: "rgba(15,37,53,0.5)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-mono font-black text-amber-300 uppercase tracking-wider truncate">
                  {contra.sourceRef.creator}
                </p>
                <p className="text-xs font-mono text-amber-700 truncate">{contra.sourceRef.videoTitle}</p>
              </div>
              <a href={link} target="_blank" rel="noopener noreferrer"
                className="text-xs font-mono font-bold text-amber-400 hover:text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded transition-colors shrink-0">
                {contra.sourceRef.timestampStr ? `@${contra.sourceRef.timestampStr} ↗` : "Watch ↗"}
              </a>
            </div>
            {contra.sourceRef.quote && (
              <blockquote className="border-l-2 border-amber-500/40 pl-3">
                <p className="text-base text-amber-200 italic leading-relaxed">&ldquo;{contra.sourceRef.quote}&rdquo;</p>
              </blockquote>
            )}
            {contra.sourceRef.whyItSupports && (
              <p className="text-sm text-amber-600 leading-relaxed">
                <span className="font-mono font-black">WHY THIS CONTRASTS: </span>
                {contra.sourceRef.whyItSupports}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Consensus map ─────────────────────────────────────────────────────────────

function ConsensusMapBlock({ map }: { map: CreatorStance[] }) {
  if (!map.length) return null;

  const by = {
    agree:    map.filter(s => s.stance === "agree"),
    neutral:  map.filter(s => s.stance === "neutral"),
    disagree: map.filter(s => s.stance === "disagree"),
  };

  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(15,37,53,0.65)", border: "1px solid #1e2d45" }}>
      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Creator Consensus Map</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["agree", "neutral", "disagree"] as const).map(stance => {
          const items = by[stance];
          const meta = STANCE_META[stance];
          return (
            <div key={stance} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                <span className="text-xs font-mono font-black uppercase tracking-wider" style={{ color: meta.color }}>
                  {meta.label} ({items.length})
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-xs font-mono text-slate-700 pl-3.5">None in evidence pool</p>
              ) : (
                <div className="space-y-2 pl-3.5">
                  {items.map((s, i) => (
                    <div key={i} className="rounded-lg p-3 space-y-1"
                      style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
                      <p className="text-sm font-mono font-black uppercase tracking-wide truncate"
                        style={{ color: meta.color }}>{s.creator}</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{s.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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

  const qualityMeta = report ? (QUALITY_META[report.evidenceQuality] ?? QUALITY_META.Moderate) : null;

  return (
    <div
      className="min-h-screen text-slate-100 p-8 space-y-6 max-w-6xl mx-auto"
      style={{ background: "linear-gradient(140deg,#0f2535 0%,#166088 55%,#0e3154 100%)" }}
    >

      {/* Header */}
      <div className="space-y-1">
        <p className="text-base font-mono font-black text-[#38bdf8] uppercase tracking-widest">Research Mode</p>
        <p className="text-sm text-slate-400 font-mono">
          Evidence-first intelligence search across {report?.totalIndexed ? `${report.totalIndexed} indexed data points` : "your analyzed video library"}.
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
          className="flex-1 rounded-xl px-4 py-3 text-base text-white placeholder:text-slate-500 focus:outline-none font-mono"
          style={{ background: "rgba(15,37,53,0.7)", border: "1px solid #1e2d45" }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 py-3 bg-[#38bdf8] hover:bg-[#7dd3fc] disabled:opacity-40 text-[#0f2535] text-base font-black rounded-xl transition-colors whitespace-nowrap"
        >
          {loading ? "Researching..." : "Search"}
        </button>
      </form>

      {/* Suggested queries */}
      {!report && !loading && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Suggested searches</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map(s => (
              <button
                key={s}
                onClick={() => { setQuery(s); void runSearch(s); }}
                className="text-sm font-mono px-4 py-2 rounded-lg transition-colors text-slate-300 hover:text-[#38bdf8]"
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
              <p className="text-sm text-red-400/70">New analyses index automatically. To index your existing library:</p>
              <button
                onClick={handleReindexAll}
                disabled={reindexing}
                className="text-sm font-mono font-bold text-white px-3 py-1 rounded disabled:opacity-50 transition-colors"
                style={{ background: "rgba(127,29,29,0.5)", border: "1px solid rgba(185,28,28,0.5)" }}
              >
                {reindexing ? "Indexing..." : "Index my library now"}
              </button>
              {reindexMsg && <p className="text-sm text-emerald-400">{reindexMsg}</p>}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          {[24, 16, 48, 48, 36].map((h, i) => (
            <div key={i} className="rounded-2xl" style={{ height: `${h * 4}px`, background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
          ))}
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
                <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Intelligence Report</p>
                <h2 className="text-xl font-black text-white leading-tight">{report.topic}</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg"
                  style={{ color: qualityMeta?.color, background: `${qualityMeta?.color}18`, border: `1px solid ${qualityMeta?.color}30` }}>
                  {qualityMeta?.label}
                </span>
                <div className="flex gap-3 text-sm font-mono text-slate-400">
                  <span><span className="text-white font-black">{report.creatorsMatched}</span> creators</span>
                  <span><span className="text-white font-black">{report.videosMatched}</span> videos</span>
                  <span><span className="text-white font-black">{report.consensusScore}/10</span> consensus</span>
                  <span>
                    <span className="font-black" style={{ color: report.confidenceScore >= 68 ? "#10b981" : report.confidenceScore >= 50 ? "#fbbf24" : "#f87171" }}>
                      {report.confidenceScore}%
                    </span> confidence
                  </span>
                </div>
              </div>
            </div>
            <div className="border-t pt-3" style={{ borderColor: "#1e2d45" }}>
              <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-1.5">Summary</p>
              <p className="text-base text-slate-300 leading-relaxed">{report.summary}</p>
            </div>
          </div>

          {/* Research Questions */}
          {report.researchQuestions?.length > 0 && (
            <ResearchQuestionsPanel questions={report.researchQuestions} />
          )}

          {/* Findings grouped under their research questions */}
          {report.findings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                {report.findings.length} {report.findings.length === 1 ? "Finding" : "Findings"} — each with cited evidence
              </p>
              <GroupedFindings findings={report.findings} questions={report.researchQuestions ?? []} />
            </div>
          )}

          {/* Contrarian */}
          {report.contrarian ? (
            <div className="space-y-3">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Dissenting View</p>
              <ContraBlock contra={report.contrarian} />
            </div>
          ) : (
            <div className="rounded-xl px-4 py-2.5 flex items-center gap-2"
              style={{ background: "rgba(15,37,53,0.4)", border: "1px solid #1e2d45" }}>
              <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Contrarian</span>
              <span className="text-xs font-mono text-slate-600">—</span>
              <span className="text-sm font-mono text-slate-500">No direct contradictory evidence found in this query.</span>
            </div>
          )}

          {/* Creator Consensus Map */}
          {report.consensusMap.length > 0 && (
            <div className="space-y-3">
              <ConsensusMapBlock map={report.consensusMap} />
            </div>
          )}

          {/* Implications */}
          {report.implications.length > 0 && (
            <div className="rounded-2xl p-5 space-y-3"
              style={{ background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }}>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Strategic Implications</p>
              {report.implications.map((imp, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="text-[#38bdf8] shrink-0 mt-0.5 font-black">→</span>
                  <div className="space-y-0.5">
                    <p className="text-base text-slate-300 leading-relaxed">{imp.statement}</p>
                    <p className="text-xs font-mono text-slate-600">{imp.basedOnFindings}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {report.actions.length > 0 && (
            <div className="rounded-2xl p-5 space-y-3"
              style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <p className="text-xs font-mono text-emerald-700 uppercase tracking-widest">Action Opportunities</p>
              {report.actions.map((a, i) => (
                <div key={i} className="rounded-xl p-4 space-y-1.5"
                  style={{ background: "rgba(15,37,53,0.5)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <p className="text-base font-bold text-emerald-300">{a.title}</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{a.description}</p>
                  <p className="text-xs font-mono text-emerald-800">{a.derivedFrom}</p>
                </div>
              ))}
            </div>
          )}

          {/* Evidence gaps */}
          {report.evidenceGaps && (
            <div className="rounded-xl px-4 py-3 flex gap-3 items-start"
              style={{ background: "rgba(15,37,53,0.5)", border: "1px solid #1e2d45" }}>
              <span className="text-xs font-mono font-black text-slate-600 uppercase tracking-wider shrink-0 pt-0.5">GAPS</span>
              <p className="text-sm text-slate-500 leading-relaxed">{report.evidenceGaps}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#1e2d45" }}>
            <p className="text-xs font-mono text-slate-700">
              {report.totalIndexed} data points searched · Evidence validated before citation
            </p>
            <button
              onClick={() => { setReport(null); setError(null); setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="text-sm font-mono text-[#38bdf8] hover:text-white transition-colors"
            >
              New search →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
