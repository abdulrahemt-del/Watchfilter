"use client";

import { useState, useRef } from "react";
import type {
  ResearchReport,
  ResearchFinding,
  ResearchHypothesisResult,
  ResearchPattern,
  ContraFinding,
  SourceRef,
  QuoteCluster,
  CreatorStance,
  ResearchAction,
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
  Insufficient:{ color: "#94a3b8", label: "INSUFFICIENT" },
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

const HYPOTHESIS_STATUS_META = {
  supported:    { color: "#10b981", bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.30)",  label: "SUPPORTED",    icon: "✓" },
  inconclusive: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)",  label: "INCONCLUSIVE", icon: "⊙" },
  rejected:     { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.25)", label: "REJECTED",     icon: "✗" },
};

const PATTERN_META: Record<ResearchPattern["patternType"], { label: string; color: string; icon: string }> = {
  repeated_behavior:  { label: "REPEATED BEHAVIOR",  color: "#38bdf8", icon: "↻" },
  repeated_outcome:   { label: "REPEATED OUTCOME",   color: "#10b981", icon: "→" },
  repeated_strategy:  { label: "REPEATED STRATEGY",  color: "#a78bfa", icon: "⊕" },
  repeated_mistake:   { label: "REPEATED MISTAKE",   color: "#f87171", icon: "✕" },
  success_factor:     { label: "SUCCESS FACTOR",     color: "#10b981", icon: "★" },
  failure_factor:     { label: "FAILURE FACTOR",     color: "#f87171", icon: "▼" },
};

const ACTION_CATEGORY_META: Record<ResearchAction["category"], { label: string; color: string; border: string; bg: string }> = {
  decision:            { label: "Decision",            color: "#38bdf8", border: "rgba(56,189,248,0.25)",  bg: "rgba(56,189,248,0.06)"  },
  task:                { label: "Task",                color: "#10b981", border: "rgba(16,185,129,0.25)",  bg: "rgba(16,185,129,0.06)"  },
  experiment:          { label: "Experiment",          color: "#a78bfa", border: "rgba(167,139,250,0.25)", bg: "rgba(167,139,250,0.06)" },
  content_opportunity: { label: "Content Opportunity", color: "#fbbf24", border: "rgba(251,191,36,0.25)",  bg: "rgba(251,191,36,0.06)"  },
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
          <p className="text-sm font-mono font-black text-slate-300 uppercase tracking-wider truncate">{r.creator}</p>
          <p className="text-xs font-mono text-slate-500 truncate">{r.videoTitle}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {r.signalStrength && (
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
              style={{ color: sigColor, background: `${sigColor}15`, border: `1px solid ${sigColor}35` }}>
              {r.signalStrength}
            </span>
          )}
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="text-xs font-mono font-bold text-[#38bdf8] hover:text-white border border-[#38bdf8]/30 hover:border-[#38bdf8]/60 px-2 py-0.5 rounded transition-colors">
            {r.timestampStr ? `@${r.timestampStr} ↗` : "Watch ↗"}
          </a>
        </div>
      </div>
      {r.quote && (
        <blockquote className="border-l-2 border-[#38bdf8]/40 pl-3">
          <p className="text-base text-slate-200 italic leading-relaxed">&ldquo;{r.quote}&rdquo;</p>
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
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
        style={{ background: "rgba(22,96,136,0.18)" }}>
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]/60 shrink-0" />
          <span className="text-sm font-mono font-black text-[#38bdf8] uppercase tracking-wider">{cluster.theme}</span>
          <span className="text-xs font-mono text-slate-500">
            {cluster.sourceRefs.length} {cluster.sourceRefs.length === 1 ? "quote" : "quotes"}
          </span>
        </div>
        <span className="text-xs font-mono text-slate-600">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3" style={{ background: "rgba(10,20,35,0.5)" }}>
          {cluster.sourceRefs.map((ref, i) => <SourceCitation key={i} r={ref} index={startIndex + i} />)}
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
      <button onClick={() => setOpen(o => !o)} className="w-full text-left p-5 space-y-3.5"
        style={{ background: "linear-gradient(140deg,#0f2535 0%,#0e3154 100%)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-xs font-mono font-black text-slate-500 shrink-0 mt-1">F{index + 1}</span>
            <p className="text-base font-bold text-white leading-snug">{finding.statement}</p>
          </div>
          <span className="text-xs font-mono text-slate-600 shrink-0">{open ? "▲" : "▼"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <span className="text-xs font-mono font-black px-2 py-0.5 rounded"
            style={{ color: cMeta.color, background: cMeta.bg, border: `1px solid ${cMeta.border}` }}>
            {cMeta.label}
          </span>
          <span className="text-xs font-mono font-black px-2 py-0.5 rounded"
            style={{ color: sMeta.color, background: `${sMeta.color}10`, border: `1px solid ${sMeta.color}30` }}>
            {sMeta.label}
          </span>
          <span className="text-xs font-mono text-slate-400"><span className="text-white font-bold">{finding.creatorCount}</span> creators</span>
          <span className="text-slate-600 font-mono text-xs">·</span>
          <span className="text-xs font-mono text-slate-400"><span className="text-white font-bold">{finding.videoCount}</span> videos</span>
          <span className="text-slate-600 font-mono text-xs">·</span>
          <span className="text-xs font-mono text-slate-400"><span className="text-white font-bold">{finding.evidenceCount}</span> quotes</span>
          <span className="text-slate-600 font-mono text-xs">·</span>
          <span className="text-xs font-mono" style={{ color: cMeta.color }}>{finding.confidenceScore}% confidence</span>
        </div>
      </button>
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

// ── Research objective card ───────────────────────────────────────────────────

function ResearchObjectiveCard({ objective, query }: { objective: string; query: string }) {
  return (
    <div className="rounded-2xl p-5 space-y-2"
      style={{ background: "rgba(15,37,53,0.8)", border: "1px solid rgba(56,189,248,0.35)", boxShadow: "0 0 24px rgba(56,189,248,0.06),inset 0 1px #ffffff08" }}>
      <p className="text-xs font-mono font-black text-[#38bdf8]/60 uppercase tracking-widest">Research Objective</p>
      <p className="text-base text-white leading-relaxed font-medium">{objective}</p>
      <p className="text-xs font-mono text-slate-600">Query: &ldquo;{query}&rdquo;</p>
    </div>
  );
}

// ── Research framework ────────────────────────────────────────────────────────

function ResearchFrameworkPanel({ subtopics, questions }: { subtopics: string[]; questions: string[] }) {
  const [showSubtopics, setShowSubtopics] = useState(false);
  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(15,37,53,0.65)", border: "1px solid #1e2d45" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Research Framework</p>
        {subtopics.length > 0 && (
          <button onClick={() => setShowSubtopics(s => !s)}
            className="text-xs font-mono text-slate-600 hover:text-[#38bdf8] transition-colors">
            {showSubtopics ? "Hide subtopics ▲" : "Show subtopics ▼"}
          </button>
        )}
      </div>
      {showSubtopics && subtopics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {subtopics.map((s, i) => (
            <span key={i} className="text-xs font-mono px-2.5 py-1 rounded-lg text-slate-400"
              style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.15)" }}>
              {s}
            </span>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="flex gap-3 items-baseline">
            <span className="text-xs font-mono font-black shrink-0 w-6 text-right" style={{ color: "rgba(56,189,248,0.45)" }}>Q{i}</span>
            <p className="text-base text-slate-300 leading-relaxed">{q}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Evidence overview ─────────────────────────────────────────────────────────

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-slate-500">{label}</span>
        <span className="text-xs font-mono font-black" style={{ color }}>{value}%</span>
      </div>
      <div className="rounded-full h-1.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function EvidenceOverview({ report, qualityMeta }: {
  report: ResearchReport;
  qualityMeta: { color: string; label: string } | null;
}) {
  const confColor = report.confidenceScore >= 68 ? "#10b981" : report.confidenceScore >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: "rgba(15,37,53,0.7)", border: "1px solid #1e2d45", boxShadow: "0 4px 32px #0000002e,inset 0 1px #ffffff08" }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Evidence Overview</p>
          <h2 className="text-xl font-black text-white leading-tight">{report.topic}</h2>
        </div>
        {qualityMeta && (
          <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg shrink-0"
            style={{ color: qualityMeta.color, background: `${qualityMeta.color}18`, border: `1px solid ${qualityMeta.color}30` }}>
            {qualityMeta.label}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Creators", value: report.creatorsMatched, muted: false },
          { label: "Videos", value: report.videosMatched, muted: false },
          { label: "Quotes used", value: report.quotesUsed, muted: false },
          { label: "Quotes rejected", value: report.quotesRejected, muted: true },
        ].map(({ label, value, muted }) => (
          <div key={label} className="rounded-xl p-3 text-center" style={{ background: "rgba(10,20,35,0.5)", border: "1px solid #1e2d45" }}>
            <p className="text-xl font-black" style={{ color: muted ? "#475569" : "white" }}>{value}</p>
            <p className="text-xs font-mono text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2.5">
        <ProgressBar label="Question Coverage" value={report.coverageScore} color="#38bdf8" />
        <ProgressBar label="Consensus" value={report.consensusScore * 10} color="#a78bfa" />
        <ProgressBar label="Confidence" value={report.confidenceScore} color={confColor} />
      </div>
    </div>
  );
}

// ── Hypothesis testing panel ──────────────────────────────────────────────────

function HypothesisCard({ h, index, hasFinding }: {
  h: ResearchHypothesisResult;
  index: number;
  hasFinding: boolean;
}) {
  const meta = HYPOTHESIS_STATUS_META[h.status];
  return (
    <div className="rounded-xl p-4 space-y-2.5"
      style={{ background: "rgba(10,20,35,0.55)", border: `1px solid ${meta.border}` }}>
      <div className="flex items-start gap-3">
        <span className="text-xs font-mono font-black px-2 py-0.5 rounded shrink-0 mt-0.5"
          style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}>
          {meta.icon} {meta.label}
        </span>
        <p className="text-base text-slate-300 leading-snug">{h.statement}</p>
      </div>

      {h.status === "supported" && (
        <div className="space-y-1.5 pl-1">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="rounded-full h-1.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(h.supportStrength, 100)}%`, background: meta.color }} />
              </div>
            </div>
            <span className="text-xs font-mono font-black shrink-0" style={{ color: meta.color }}>{h.supportStrength}%</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
            <span><span className="text-emerald-400 font-bold">{h.supportingCreators}</span> supporting</span>
            {h.contradictingCreators > 0 && (
              <span><span className="text-red-400 font-bold">{h.contradictingCreators}</span> opposing</span>
            )}
            {hasFinding && (
              <span className="text-[#38bdf8]">→ finding generated</span>
            )}
          </div>
        </div>
      )}

      {h.status === "inconclusive" && h.supportingCreators > 0 && (
        <div className="flex items-center gap-3 text-xs font-mono text-slate-500 pl-1">
          <span><span className="text-amber-400 font-bold">{h.supportingCreators}</span> partial support</span>
          {h.contradictingCreators > 0 && (
            <span><span className="text-red-400 font-bold">{h.contradictingCreators}</span> opposing</span>
          )}
          <span className="text-amber-700">insufficient for finding</span>
        </div>
      )}

      {h.rejectionReason && (
        <p className="text-xs text-slate-500 leading-relaxed pl-1 border-l border-red-900/40 ml-1"
          style={{ paddingLeft: "0.75rem" }}>
          {h.rejectionReason}
        </p>
      )}
    </div>
  );
}

function HypothesisTestingPanel({ hypotheses, findings }: {
  hypotheses: ResearchHypothesisResult[];
  findings: ResearchFinding[];
}) {
  if (!hypotheses.length) return null;
  const [expanded, setExpanded] = useState(true);

  const supported = hypotheses.filter(h => h.status === "supported").length;
  const inconclusive = hypotheses.filter(h => h.status === "inconclusive").length;
  const rejected = hypotheses.filter(h => h.status === "rejected").length;
  const findingIndices = new Set(findings.map(f => f.hypothesisIndex));

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e2d45" }}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ background: "rgba(15,37,53,0.8)" }}>
        <div className="flex items-center gap-4">
          <p className="text-xs font-mono font-black text-slate-400 uppercase tracking-widest">Hypothesis Testing</p>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-1.5 py-0.5 rounded" style={{ color: "#10b981", background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.25)" }}>
              {supported} supported
            </span>
            {inconclusive > 0 && (
              <span className="px-1.5 py-0.5 rounded" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
                {inconclusive} inconclusive
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded" style={{ color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
              {rejected} rejected
            </span>
          </div>
        </div>
        <span className="text-xs font-mono text-slate-600">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-3 space-y-3" style={{ background: "rgba(8,16,28,0.6)" }}>
          {hypotheses.map((h, i) => (
            <HypothesisCard key={i} h={h} index={i} hasFinding={findingIndices.has(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Findings grouped by hypothesis ───────────────────────────────────────────

function FindingsByHypothesis({ findings, hypotheses }: {
  findings: ResearchFinding[];
  hypotheses: ResearchHypothesisResult[];
}) {
  if (!findings.length) return null;

  // Group findings by hypothesisIndex
  const groups = hypotheses
    .map((h, hi) => ({ h, hi, items: findings.filter(f => f.hypothesisIndex === hi) }))
    .filter(g => g.items.length > 0);

  // Orphaned (no matching hypothesis)
  const orphaned = findings.filter(f => f.hypothesisIndex >= hypotheses.length || f.hypothesisIndex < 0);

  return (
    <div className="space-y-6">
      {groups.map(({ h, hi, items }) => (
        <div key={hi} className="space-y-3">
          {/* Hypothesis header above its findings */}
          <div className="flex gap-3 items-start">
            <span className="text-xs font-mono font-black px-2 py-0.5 rounded shrink-0 mt-0.5"
              style={{ color: "#10b981", background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.25)" }}>
              H{hi} ✓
            </span>
            <p className="text-base font-bold text-slate-200 leading-snug">{h.statement}</p>
          </div>
          <div className="space-y-3 pl-8">
            {items.map((f, fi) => <FindingBlock key={fi} finding={f} index={findings.indexOf(f)} />)}
          </div>
        </div>
      ))}
      {orphaned.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Additional Findings</p>
          {orphaned.map((f, i) => <FindingBlock key={i} finding={f} index={i} />)}
        </div>
      )}
    </div>
  );
}

// ── Patterns panel ────────────────────────────────────────────────────────────

function PatternsPanel({ patterns }: { patterns: ResearchPattern[] }) {
  if (!patterns.length) return null;
  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(15,37,53,0.65)", border: "1px solid #1e2d45" }}>
      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Patterns</p>
      <div className="space-y-3">
        {patterns.map((p, i) => {
          const meta = PATTERN_META[p.patternType];
          return (
            <div key={i} className="flex gap-3 items-start rounded-xl p-3.5"
              style={{ background: "rgba(10,20,35,0.5)", border: "1px solid #1e2d45" }}>
              <span className="text-base font-black shrink-0 pt-0.5" style={{ color: meta.color }}>{meta.icon}</span>
              <div className="space-y-1 min-w-0">
                <span className="text-xs font-mono font-black" style={{ color: meta.color }}>{meta.label}</span>
                <p className="text-base text-slate-300 leading-relaxed">{p.description}</p>
                <p className="text-xs font-mono text-slate-600">{p.creatorCount} {p.creatorCount === 1 ? "creator" : "creators"}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Conclusions card ──────────────────────────────────────────────────────────

function ConclusionsCard({ conclusions, confidenceScore }: { conclusions: string; confidenceScore: number }) {
  if (!conclusions) return null;
  const confColor = confidenceScore >= 68 ? "#10b981" : confidenceScore >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div className="rounded-2xl p-6 space-y-3"
      style={{ background: "rgba(15,37,53,0.85)", border: "1px solid rgba(56,189,248,0.3)", boxShadow: "0 0 32px rgba(56,189,248,0.06),inset 0 1px #ffffff08" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono font-black text-[#38bdf8]/70 uppercase tracking-widest">What the Evidence Suggests</p>
        <span className="text-xs font-mono font-black px-2 py-0.5 rounded"
          style={{ color: confColor, background: `${confColor}10`, border: `1px solid ${confColor}30` }}>
          {confidenceScore}% confidence
        </span>
      </div>
      <p className="text-base text-slate-200 leading-relaxed">{conclusions}</p>
    </div>
  );
}

// ── Contrarian block ──────────────────────────────────────────────────────────

function ContraBlock({ contra }: { contra: ContraFinding }) {
  const [open, setOpen] = useState(true);
  const link = ytUrl(contra.sourceRef.videoId, contra.sourceRef.timestampStr);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(251,191,36,0.28)" }}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left p-5 space-y-2"
        style={{ background: "linear-gradient(140deg,#1a1200 0%,#0f2535 100%)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-xs font-mono font-black text-amber-600 shrink-0 mt-0.5">DISSENT</span>
            <p className="text-base font-bold text-amber-200 leading-snug">{contra.statement}</p>
          </div>
          <span className="text-xs font-mono text-amber-800 shrink-0">{open ? "▲" : "▼"}</span>
        </div>
        <p className="text-xs font-mono text-amber-800 pl-[3.5rem]">From evidence — not a hypothetical objection</p>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-4" style={{ background: "rgba(10,20,35,0.7)" }}>
          <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid rgba(251,191,36,0.2)", background: "rgba(15,37,53,0.5)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-mono font-black text-amber-300 uppercase tracking-wider truncate">{contra.sourceRef.creator}</p>
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
                      <p className="text-sm font-mono font-black uppercase tracking-wide truncate" style={{ color: meta.color }}>{s.creator}</p>
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

// ── Actionable intelligence ───────────────────────────────────────────────────

function ActionableIntelligence({ actions, implications }: {
  actions: ResearchAction[];
  implications: { statement: string; basedOnFindings: string }[];
}) {
  if (!actions.length && !implications.length) return null;

  const grouped = {
    decision:            actions.filter(a => a.category === "decision"),
    task:                actions.filter(a => a.category === "task"),
    experiment:          actions.filter(a => a.category === "experiment"),
    content_opportunity: actions.filter(a => a.category === "content_opportunity"),
  } as const;

  return (
    <div className="rounded-2xl p-5 space-y-5" style={{ background: "rgba(15,37,53,0.65)", border: "1px solid #1e2d45" }}>
      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Actionable Intelligence</p>

      {implications.length > 0 && (
        <div className="space-y-2.5">
          {implications.map((imp, i) => (
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

      {(["decision", "task", "experiment", "content_opportunity"] as const).map(cat => {
        const items = grouped[cat];
        if (!items.length) return null;
        const meta = ACTION_CATEGORY_META[cat];
        return (
          <div key={cat} className="space-y-2">
            <p className="text-xs font-mono font-black uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}s</p>
            <div className="space-y-2">
              {items.map((a, i) => (
                <div key={i} className="rounded-xl p-4 space-y-1.5"
                  style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-bold leading-snug" style={{ color: meta.color }}>{a.title}</p>
                    <span className="text-xs font-mono text-slate-500 shrink-0">{a.confidenceScore}%</span>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">{a.description}</p>
                  <p className="text-xs font-mono text-slate-600">{a.derivedFrom}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ResearchMode() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<"framework" | "testing" | "synthesis" | null>(null);
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
    setLoadingStage("framework");
    setError(null);
    setReport(null);

    const t1 = setTimeout(() => setLoadingStage("testing"), 2500);
    const t2 = setTimeout(() => setLoadingStage("synthesis"), 6000);

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
      clearTimeout(t1);
      clearTimeout(t2);
      setLoading(false);
      setLoadingStage(null);
    }
  }

  const STAGE_LABEL = {
    framework: "Building research design + generating hypotheses...",
    testing:   "Testing hypotheses against evidence...",
    synthesis: "Generating conclusions from supported hypotheses...",
  };

  const qualityMeta = report ? (QUALITY_META[report.evidenceQuality] ?? QUALITY_META.Moderate) : null;

  return (
    <div className="min-h-screen text-slate-100 p-8 space-y-6 max-w-6xl mx-auto"
      style={{ background: "linear-gradient(140deg,#0f2535 0%,#166088 55%,#0e3154 100%)" }}>

      {/* Header */}
      <div className="space-y-1">
        <p className="text-base font-mono font-black text-[#38bdf8] uppercase tracking-widest">Research Mode</p>
        <p className="text-sm text-slate-400 font-mono">
          Hypothesis-driven intelligence across {report?.totalIndexed ? `${report.totalIndexed} indexed data points` : "your analyzed video library"}.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={e => { e.preventDefault(); void runSearch(query); }} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="What do you want to understand?"
          className="flex-1 rounded-xl px-4 py-3 text-base text-white placeholder:text-slate-500 focus:outline-none font-mono"
          style={{ background: "rgba(15,37,53,0.7)", border: "1px solid #1e2d45" }}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !query.trim()}
          className="px-5 py-3 bg-[#38bdf8] hover:bg-[#7dd3fc] disabled:opacity-40 text-[#0f2535] text-base font-black rounded-xl transition-colors whitespace-nowrap">
          {loading ? "Researching..." : "Research"}
        </button>
      </form>

      {/* Suggested topics */}
      {!report && !loading && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Research topics</p>
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
              <p className="text-sm text-red-400/70">New analyses index automatically. To index your existing library:</p>
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

      {/* Loading with stage labels */}
      {loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
            <p className="text-sm font-mono text-[#38bdf8]">
              {loadingStage ? STAGE_LABEL[loadingStage] : "Initializing..."}
            </p>
          </div>
          <div className="space-y-4 animate-pulse">
            {[20, 16, 40, 56, 56, 36].map((h, i) => (
              <div key={i} className="rounded-2xl" style={{ height: `${h * 4}px`, background: "rgba(15,37,53,0.6)", border: "1px solid #1e2d45" }} />
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="space-y-5">

          {/* 1. Research Objective */}
          <ResearchObjectiveCard objective={report.researchObjective} query={report.query} />

          {/* 2. Research Framework */}
          {(report.subtopics?.length > 0 || report.researchQuestions?.length > 0) && (
            <ResearchFrameworkPanel subtopics={report.subtopics ?? []} questions={report.researchQuestions ?? []} />
          )}

          {/* 3. Evidence Overview */}
          <EvidenceOverview report={report} qualityMeta={qualityMeta} />

          {/* 4. Hypothesis Testing */}
          {report.hypotheses?.length > 0 && (
            <HypothesisTestingPanel hypotheses={report.hypotheses} findings={report.findings} />
          )}

          {/* 5. Key Findings (grouped by supporting hypothesis) */}
          {report.findings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                {report.findings.length} {report.findings.length === 1 ? "Finding" : "Findings"} from supported hypotheses
              </p>
              <FindingsByHypothesis findings={report.findings} hypotheses={report.hypotheses ?? []} />
            </div>
          )}

          {report.findings.length === 0 && report.hypotheses?.length > 0 && (
            <div className="rounded-xl px-5 py-4 space-y-1"
              style={{ background: "rgba(15,37,53,0.5)", border: "1px solid rgba(251,191,36,0.2)" }}>
              <p className="text-sm font-mono font-black text-amber-500">No hypotheses passed testing</p>
              <p className="text-sm text-slate-500">All hypotheses were rejected or inconclusive against the current evidence pool. See Research Gaps below.</p>
            </div>
          )}

          {/* 6. Patterns */}
          {report.patterns?.length > 0 && <PatternsPanel patterns={report.patterns} />}

          {/* 7. Contradictions */}
          {report.contrarian ? (
            <div className="space-y-3">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Contradictions</p>
              <ContraBlock contra={report.contrarian} />
            </div>
          ) : (
            <div className="rounded-xl px-4 py-2.5 flex items-center gap-2"
              style={{ background: "rgba(15,37,53,0.4)", border: "1px solid #1e2d45" }}>
              <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Contradictions</span>
              <span className="text-xs font-mono text-slate-600">—</span>
              <span className="text-sm font-mono text-slate-500">No direct contradictory evidence found.</span>
            </div>
          )}

          {/* 8. Creator Consensus Map */}
          {report.consensusMap.length > 0 && <ConsensusMapBlock map={report.consensusMap} />}

          {/* 9. Conclusions */}
          <ConclusionsCard conclusions={report.conclusions} confidenceScore={report.confidenceScore} />

          {/* 10. Actionable Intelligence */}
          <ActionableIntelligence actions={report.actions} implications={report.implications} />

          {/* 11. Research Gaps */}
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
              {report.totalIndexed} data points searched · Findings only from supported hypotheses
            </p>
            <button onClick={() => { setReport(null); setError(null); setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="text-sm font-mono text-[#38bdf8] hover:text-white transition-colors">
              New research →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
