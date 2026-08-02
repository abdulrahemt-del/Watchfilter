"use client";

import { useState, useCallback, useRef } from "react";
import type {
  InvestmentMemo,
  TrendEntry,
  DebateCluster,
  OpportunityEntry,
  MarketMapEntry,
  NarrativeShift,
  EarlyMover,
  ResearchGap,
  RiskEntry,
  RecommendedAction,
  OpportunityStage,
  ConsensusStage,
  FailureMode,
} from "@/app/api/research/deep/route";

// ── Agent log ─────────────────────────────────────────────────────────────────

type LogEntry = { agent: string; message: string };

const AGENT_COLOR: Record<string, string> = {
  Explorer:    "#8b5cf6",
  Critic:      "#ef4444",
  Retriever:   "#3b82f6",
  Synthesizer: "#10b981",
  Scorer:      "#f59e0b",
};

function AgentLog({ entries, running }: { entries: LogEntry[]; running: boolean }) {
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #1e293b",
        borderRadius: 10,
        padding: "0.85rem 1rem",
        fontFamily: "monospace",
      }}
    >
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569" }}>
        Agent Terminal
      </p>
      {entries.map((e, i) => {
        const isLast = i === entries.length - 1;
        const color = AGENT_COLOR[e.agent] ?? "#94a3b8";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.2rem 0" }}>
            {isLast && running ? (
              <span style={{ width: 14, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                <span style={{ display: "inline-block", width: 9, height: 9, border: `2px solid #334155`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.65s linear infinite" }} />
              </span>
            ) : (
              <span style={{ width: 14, flexShrink: 0, textAlign: "center", color: "#22c55e", fontSize: "0.7rem", fontWeight: 700 }}>✓</span>
            )}
            <span style={{ color, fontSize: "0.72rem", fontWeight: 700, minWidth: 92, flexShrink: 0 }}>
              {e.agent}
            </span>
            <span style={{ color: "#64748b", fontSize: "0.72rem" }}>—</span>
            <span style={{ color: "#94a3b8", fontSize: "0.72rem" }}>{e.message}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.round(score * 100));
  const color = pct >= 65 ? "#10b981" : pct >= 35 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ flex: 1, height: 5, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: "0.68rem", fontWeight: 800, color, minWidth: 34, textAlign: "right" }} title="WatchFilter's own editorial read — not a YouTube metric">
        {pct >= 65 ? "Strong" : pct >= 35 ? "Moderate" : "Weak"}
      </span>
    </div>
  );
}

// ── Confidence pill ───────────────────────────────────────────────────────────

function ConfidencePill({ level }: { level: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    High:   { bg: "#dcfce7", color: "#166534", border: "#86efac" },
    Medium: { bg: "#fef3c7", color: "#92400e", border: "#fbbf24" },
    Low:    { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
  };
  const s = styles[level] ?? styles.Low;
  return (
    <span style={{ fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 20, border: `1px solid ${s.border}`, color: s.color, background: s.bg }}>
      {level}
    </span>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
      <h2 style={{ margin: 0, fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        {title}
      </h2>
      {count !== undefined && (
        <span style={{ fontSize: "0.6rem", fontWeight: 700, background: "#f1f5f9", color: "#64748b", padding: "1px 6px", borderRadius: 20, border: "1px solid #e2e8f0" }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ── Trend card ────────────────────────────────────────────────────────────────

function TrendCard({ trend }: { trend: TrendEntry }) {
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
        <h3 style={{ margin: 0, fontSize: "0.82rem", fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>
          {trend.title}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", alignItems: "flex-end" }}>
          <ConfidencePill level={trend.confidence} />
          {trend.consensus_stage && <ConsensusLifecycleBadge stage={trend.consensus_stage} />}
        </div>
      </div>
      {trend.consensus_stage_reason && (
        <p style={{ margin: 0, fontSize: "0.68rem", color: CONSENSUS_META[trend.consensus_stage!].color, fontWeight: 500 }}>
          {trend.consensus_stage_reason}
        </p>
      )}
      <p style={{ margin: 0, fontSize: "0.75rem", color: "#475569", lineHeight: 1.5 }}>
        {trend.description}
      </p>
      {trend.why_emerging && (
        <div style={{ background: "#f8fafc", borderRadius: 6, padding: "0.45rem 0.6rem", borderLeft: "3px solid #6366f1" }}>
          <p style={{ margin: 0, fontSize: "0.7rem", color: "#4f46e5", fontWeight: 600 }}>Why emerging</p>
          <p style={{ margin: "0.15rem 0 0", fontSize: "0.71rem", color: "#475569" }}>{trend.why_emerging}</p>
        </div>
      )}
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {trend.supporting_creators.map(c => (
          <span key={c} style={{ fontSize: "0.62rem", padding: "1px 7px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 20, color: "#374151" }}>
            {c}
          </span>
        ))}
      </div>
      <div>
        <p style={{ margin: "0 0 0.25rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>
          Emergence Score
        </p>
        <ScoreBar score={trend.emergence_score} />
      </div>
    </div>
  );
}

// ── Debate card ───────────────────────────────────────────────────────────────

function DebateCard({ debate }: { debate: DebateCluster }) {
  const rel = debate.relationship.replace(/_/g, " ");
  const relColor = debate.relationship === "direct_opposition" ? "#ef4444" : debate.relationship === "partial_disagreement" ? "#f59e0b" : "#6366f1";

  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.65rem 0.9rem", background: "#fafafa", borderBottom: "1px solid #e2e8f0" }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0f172a" }}>{debate.topic}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.62rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${relColor}18`, color: relColor, border: `1px solid ${relColor}44`, textTransform: "capitalize" }}>
            {rel}
          </span>
          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#94a3b8" }} title="WatchFilter's own editorial read — not a YouTube metric">
            {debate.strength >= 0.65 ? "strong" : debate.strength >= 0.35 ? "moderate" : "weak"} strength
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {[
          { label: "Position A", side: debate.position_a, accent: "#16a34a" },
          { label: "Position B", side: debate.position_b, accent: "#b45309" },
        ].map(({ label, side, accent }) => (
          <div key={label} style={{ padding: "0.65rem 0.9rem", borderRight: label === "Position A" ? "1px solid #f1f5f9" : "none" }}>
            <p style={{ margin: "0 0 0.3rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: accent }}>
              {label}
            </p>
            <p style={{ margin: "0 0 0.4rem", fontSize: "0.73rem", color: "#374151", lineHeight: 1.4 }}>
              {side.summary}
            </p>
            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
              {side.creators.map(c => (
                <span key={c} style={{ fontSize: "0.6rem", padding: "1px 6px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 20, color: "#64748b" }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {debate.resolution && (
        <div style={{ padding: "0.5rem 0.9rem", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
          <p style={{ margin: 0, fontSize: "0.7rem", color: "#475569" }}>
            <strong style={{ color: "#0f172a" }}>Resolution: </strong>{debate.resolution}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Consensus lifecycle ───────────────────────────────────────────────────────

const CONSENSUS_META: Record<ConsensusStage, { icon: string; label: string; color: string; bg: string; border: string }> = {
  EARLY_SIGNAL: { icon: "🔵", label: "EARLY SIGNAL", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  EMERGING:     { icon: "🟢", label: "EMERGING",     color: "#166534", bg: "#dcfce7", border: "#86efac" },
  MAINSTREAM:   { icon: "🟡", label: "MAINSTREAM",   color: "#854d0e", bg: "#fef9c3", border: "#fde047" },
  SATURATED:    { icon: "🔴", label: "SATURATED",    color: "#991b1b", bg: "#fee2e2", border: "#fca5a5" },
};

function ConsensusLifecycleBadge({ stage }: { stage: ConsensusStage }) {
  const m = CONSENSUS_META[stage];
  return (
    <span style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 20, background: m.bg, border: `1px solid ${m.border}`, color: m.color, display: "inline-flex", alignItems: "center", gap: 3 }}>
      {m.icon} {m.label}
    </span>
  );
}

// ── Opportunity stage ─────────────────────────────────────────────────────────

const STAGE_META: Record<OpportunityStage, { icon: string; color: string; bg: string; border: string }> = {
  EMERGING:  { icon: "🟢", color: "#166534", bg: "#dcfce7", border: "#86efac" },
  GROWING:   { icon: "🟡", color: "#854d0e", bg: "#fef9c3", border: "#fde047" },
  SATURATED: { icon: "🔴", color: "#991b1b", bg: "#fee2e2", border: "#fca5a5" },
};

function StageBadge({ stage }: { stage: OpportunityStage }) {
  const m = STAGE_META[stage];
  return (
    <span style={{ fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 8px", borderRadius: 20, background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>
      {m.icon} {stage}
    </span>
  );
}

// ── Market Map ────────────────────────────────────────────────────────────────

function MarketMapSection({ entries }: { entries: MarketMapEntry[] }) {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => b.market_score - a.market_score);
  const compColor = (c: string) => c === "LOW" ? "#10b981" : c === "MEDIUM" ? "#f59e0b" : "#ef4444";
  const fitColor = (f: string) => f === "SOLO" ? "#6366f1" : f === "SMALL TEAM" ? "#3b82f6" : "#94a3b8";

  return (
    <section>
      <SectionHeader title="Opportunity Market Map" count={sorted.length} />
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>
        market_score = 0.30 × emergence + 0.25 × pain + 0.20 × market size + 0.15 × accessibility + 0.10 × (1 − competition). Ranked highest first.
      </p>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 80px 100px 90px 100px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "0.45rem 1rem", gap: "0.5rem" }}>
          {["Industry / Opportunity", "Stage", "Score", "Competition", "Accessibility", "Founder Fit"].map(h => (
            <span key={h} style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>{h}</span>
          ))}
        </div>
        {sorted.map((e, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 80px 100px 90px 100px", padding: "0.6rem 1rem", gap: "0.5rem", alignItems: "center", borderBottom: i < sorted.length - 1 ? "1px solid #f1f5f9" : "none", background: i % 2 === 0 ? "white" : "#fafafa" }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 700, color: "#0f172a" }}>{e.industry}</p>
              <p style={{ margin: "0.1rem 0 0", fontSize: "0.67rem", color: "#64748b" }}>{e.opportunity}</p>
            </div>
            <StageBadge stage={e.stage} />
            <div>
              <span style={{ fontSize: "0.78rem", fontWeight: 800, color: e.market_score >= 0.65 ? "#10b981" : e.market_score >= 0.35 ? "#f59e0b" : "#ef4444" }}>
                {Math.round(e.market_score * 100)}%
              </span>
            </div>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: compColor(e.competition) }}>{e.competition}</span>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: fitColor(e.founder_fit) }}>{e.founder_fit}</span>
            <span style={{ fontSize: "0.67rem", color: "#64748b" }}>{e.stage_reason}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Narrative Shifts ──────────────────────────────────────────────────────────

function NarrativeShiftSection({ shifts }: { shifts: NarrativeShift[] }) {
  const visible = shifts.filter(s => s.shift_confidence > 0.70);
  if (visible.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Narrative Shifts" count={visible.length} />
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>
        Creator belief changes detected across evidence — temporal intelligence only shown for high-confidence shifts.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {visible.map((s, i) => (
          <div key={i} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0f172a" }}>{s.creator}</span>
              <span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>on</span>
              <span style={{ fontSize: "0.73rem", fontWeight: 600, color: "#6366f1" }}>{s.topic}</span>
              <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#f5f3ff", border: "1px solid #c4b5fd", color: "#6d28d9", marginLeft: "auto" }} title="WatchFilter's own editorial read — not a YouTube metric">
                {s.shift_confidence >= 0.85 ? "High" : "Medium"} confidence
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 6, background: "#fee2e2", color: "#991b1b", fontWeight: 600 }}>{s.from_stance}</span>
              <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>→</span>
              <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 6, background: "#dcfce7", color: "#166534", fontWeight: 600 }}>{s.to_stance}</span>
              {s.period && <span style={{ fontSize: "0.67rem", color: "#94a3b8" }}>over {s.period}</span>}
            </div>
            {s.evidence && (
              <p style={{ margin: 0, fontSize: "0.71rem", color: "#475569", fontStyle: "italic", borderLeft: "2px solid #e0e7ff", paddingLeft: "0.6rem" }}>
                "{s.evidence}"
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Early Movers ──────────────────────────────────────────────────────────────

function EarlyMoversSection({ movers }: { movers: EarlyMover[] }) {
  if (movers.length === 0) return null;
  const sorted = [...movers].sort((a, b) => b.predictive_score - a.predictive_score);
  return (
    <section>
      <SectionHeader title="Early Movers" count={sorted.length} />
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>
        Creators who discussed trends before broad adoption — rewarded for prediction consistency.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {sorted.map((m, i) => (
          <div key={i} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.75rem 1rem", display: "flex", gap: "0.9rem", alignItems: "flex-start" }}>
            <div style={{ flexShrink: 0, textAlign: "center", minWidth: 48 }} title="WatchFilter's own editorial read — not a YouTube metric">
              <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 900, color: "#6366f1" }}>
                {m.predictive_score >= 0.7 ? "High" : m.predictive_score >= 0.4 ? "Med" : "Low"}
              </p>
              <p style={{ margin: 0, fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>score</p>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0f172a" }}>{m.creator}</span>
                {m.months_ahead !== undefined && m.months_ahead > 0 && (
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e" }}>
                    ~{m.months_ahead}mo ahead
                  </span>
                )}
                <span style={{ fontSize: "0.67rem", color: "#64748b" }}>{m.topic}</span>
              </div>
              <p style={{ margin: 0, fontSize: "0.73rem", color: "#475569" }}>{m.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Research Gaps ─────────────────────────────────────────────────────────────

function ResearchGapsSection({ gaps, creatorCount }: { gaps: ResearchGap[]; creatorCount: number }) {
  const weakGraph = creatorCount < 4;
  if (gaps.length === 0 && !weakGraph) return null;
  const typeColor: Record<string, string> = { "domain expert": "#6366f1", "practitioner": "#10b981", "investor": "#f59e0b" };

  return (
    <section>
      <SectionHeader title="Research Gaps" count={gaps.length} />
      {weakGraph && (
        <div style={{ padding: "0.65rem 0.9rem", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, marginBottom: "0.65rem", fontSize: "0.75rem", color: "#92400e" }}>
          ⚠ Additional creator coverage may materially improve results. Current analysis draws from {creatorCount} creator{creatorCount !== 1 ? "s" : ""}.
        </div>
      )}
      {gaps.length > 0 && (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
          {gaps.map((g, i) => (
            <div key={i} style={{ padding: "0.65rem 0.9rem", borderBottom: i < gaps.length - 1 ? "1px solid #f1f5f9" : "none", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, flexShrink: 0, marginTop: 2, background: "#f1f5f9", border: "1px solid #e2e8f0", color: g.recommended_type ? (typeColor[g.recommended_type] ?? "#64748b") : "#64748b" }}>
                {g.recommended_type ?? "missing"}
              </span>
              <div>
                <p style={{ margin: "0 0 0.15rem", fontSize: "0.75rem", fontWeight: 700, color: "#0f172a" }}>{g.missing_perspective}</p>
                <p style={{ margin: 0, fontSize: "0.7rem", color: "#64748b" }}>{g.why_matters}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Opportunity card ──────────────────────────────────────────────────────────

function MetaBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 72 }}>
      <span style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: "0.68rem", fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function OpportunityCard({ opp, rank }: { opp: OpportunityEntry; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const rankColor = rank === 1 ? "#f59e0b" : rank === 2 ? "#94a3b8" : rank === 3 ? "#cd7c54" : "#475569";

  const compColor = opp.competition === "Low" ? "#10b981" : opp.competition === "Medium" ? "#f59e0b" : "#ef4444";
  const barrierColor = opp.barrier_to_entry === "Low" ? "#10b981" : opp.barrier_to_entry === "Medium" ? "#f59e0b" : "#ef4444";
  const sizeColor = opp.market_size === "Large" ? "#10b981" : opp.market_size === "Medium" ? "#f59e0b" : "#64748b";

  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.75rem 1rem" }}>
        <span style={{ fontSize: "1.1rem", fontWeight: 900, color: rankColor, minWidth: 24, flexShrink: 0, fontVariantNumeric: "tabular-nums", paddingTop: 2 }}>
          #{rank}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
            <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 700, color: "#0f172a" }}>{opp.name}</p>
            {opp.single_creator_insight && (
              <span style={{ fontSize: "0.58rem", fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e", flexShrink: 0 }}>
                SINGLE-CREATOR INSIGHT
              </span>
            )}
            {opp.industry && (
              <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#475569", flexShrink: 0 }}>
                {opp.industry}
              </span>
            )}
            {opp.stage && <StageBadge stage={opp.stage} />}
          </div>
          {opp.customer && (
            <p style={{ margin: "0 0 0.35rem", fontSize: "0.71rem", color: "#64748b" }}>
              Target: <strong style={{ color: "#374151" }}>{opp.customer}</strong>
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ flex: 1 }}><ScoreBar score={opp.opportunity_score} /></div>
            {opp.market_score !== undefined && (
              <span style={{ fontSize: "0.6rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
                mkt {Math.round(opp.market_score * 100)}%
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "0.8rem", padding: "0.25rem", flexShrink: 0 }}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Meta badges */}
      {(opp.market_size ?? opp.competition ?? opp.barrier_to_entry ?? opp.founder_fit) && (
        <div style={{ display: "flex", gap: "1.25rem", padding: "0.55rem 1rem", background: "#fafafa", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
          {opp.market_size && <MetaBadge label="Market Size" value={opp.market_size} color={sizeColor} />}
          {opp.competition && <MetaBadge label="Competition" value={opp.competition} color={compColor} />}
          {opp.barrier_to_entry && <MetaBadge label="Barrier to Entry" value={opp.barrier_to_entry} color={barrierColor} />}
          {opp.founder_fit && <MetaBadge label="Founder Fit" value={opp.founder_fit} color="#6366f1" />}
        </div>
      )}

      {expanded && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          {opp.stage_reason && (
            <div style={{ padding: "0.45rem 0.7rem", background: opp.stage ? STAGE_META[opp.stage].bg : "#f8fafc", borderRadius: 8, border: `1px solid ${opp.stage ? STAGE_META[opp.stage].border : "#e2e8f0"}` }}>
              <p style={{ margin: 0, fontSize: "0.72rem", color: "#374151" }}>{opp.stage_reason}</p>
            </div>
          )}
          {opp.pain_point && (
            <div>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#ef4444" }}>Pain Point</p>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#374151" }}>{opp.pain_point}</p>
            </div>
          )}
          {opp.why_now && (
            <div>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#10b981" }}>Why Now</p>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#374151" }}>{opp.why_now}</p>
            </div>
          )}
          {opp.market_friction && (
            <div style={{ padding: "0.5rem 0.7rem", background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#b45309" }}>Why This Doesn't Already Exist</p>
              <p style={{ margin: 0, fontSize: "0.74rem", color: "#78350f" }}>{opp.market_friction}</p>
            </div>
          )}
          {opp.existing_solutions && (
            <div>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Existing Solutions</p>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#374151" }}>{opp.existing_solutions}</p>
            </div>
          )}
          {opp.gap && (
            <div>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6366f1" }}>Gap in Market</p>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#374151" }}>{opp.gap}</p>
            </div>
          )}
          {opp.supporting_evidence.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#3b82f6" }}>Supporting Evidence</p>
              {opp.supporting_evidence.map((e, i) => (
                <p key={i} style={{ margin: "0.15rem 0", fontSize: "0.73rem", color: "#374151", paddingLeft: "0.75rem", borderLeft: "2px solid #dbeafe" }}>{e}</p>
              ))}
            </div>
          )}
          {opp.counterarguments.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#f59e0b" }}>Counterarguments</p>
              {opp.counterarguments.map((c, i) => (
                <p key={i} style={{ margin: "0.15rem 0", fontSize: "0.73rem", color: "#374151", paddingLeft: "0.75rem", borderLeft: "2px solid #fef3c7" }}>{c}</p>
              ))}
            </div>
          )}
          {(opp.failure_modes ?? []).length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.4rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#dc2626" }}>
                Failure Modes — What Would Make This Wrong?
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {(opp.failure_modes ?? []).map((fm: FailureMode, i: number) => {
                  const riskColor = fm.failure_risk === "HIGH" ? "#dc2626" : fm.failure_risk === "MEDIUM" ? "#d97706" : "#16a34a";
                  const riskBg   = fm.failure_risk === "HIGH" ? "#fee2e2" : fm.failure_risk === "MEDIUM" ? "#fff7ed" : "#f0fdf4";
                  return (
                    <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", padding: "0.4rem 0.6rem", background: riskBg, borderRadius: 7, border: `1px solid ${riskBg === "#fee2e2" ? "#fca5a5" : riskBg === "#fff7ed" ? "#fed7aa" : "#bbf7d0"}` }}>
                      <span style={{ fontSize: "0.6rem", fontWeight: 800, color: riskColor, textTransform: "uppercase", padding: "1px 5px", borderRadius: 4, background: "white", flexShrink: 0, marginTop: 1 }}>
                        {fm.failure_risk}
                      </span>
                      <p style={{ margin: 0, fontSize: "0.72rem", color: "#374151" }}>{fm.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Risk item ─────────────────────────────────────────────────────────────────

function RiskItem({ risk }: { risk: RiskEntry }) {
  const riskStyle: Record<string, { icon: string; color: string; bg: string }> = {
    noise:          { icon: "〰", color: "#64748b", bg: "#f8fafc" },
    overhyped:      { icon: "⚠", color: "#b45309", bg: "#fffbeb" },
    low_confidence: { icon: "?", color: "#7c3aed", bg: "#f5f3ff" },
  };
  const s = riskStyle[risk.risk_type] ?? riskStyle.noise;

  return (
    <div style={{ display: "flex", gap: "0.65rem", padding: "0.6rem 0.8rem", background: s.bg, borderRadius: 8, border: `1px solid ${s.color}22` }}>
      <span style={{ color: s.color, fontWeight: 700, fontSize: "0.8rem", flexShrink: 0 }}>{s.icon}</span>
      <div>
        <p style={{ margin: "0 0 0.15rem", fontSize: "0.75rem", fontWeight: 700, color: "#0f172a" }}>{risk.trend}</p>
        <p style={{ margin: 0, fontSize: "0.7rem", color: "#64748b" }}>{risk.reason}</p>
      </div>
    </div>
  );
}

// ── Recommended Action Card ───────────────────────────────────────────────────

const CONFIDENCE_META: Record<"HIGH" | "MEDIUM" | "LOW", { accent: string; bg: string; border: string; icon: string }> = {
  HIGH:   { accent: "#10b981", bg: "#f0fdf4", border: "#bbf7d0", icon: "▶" },
  MEDIUM: { accent: "#f59e0b", bg: "#fffbeb", border: "#fde68a", icon: "◐" },
  LOW:    { accent: "#6366f1", bg: "#f5f3ff", border: "#c4b5fd", icon: "◌" },
};

function RecommendedActionCard({ rec }: { rec: RecommendedAction }) {
  const meta = CONFIDENCE_META[rec.confidence_level];
  return (
    <section>
      <div style={{ fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: "0.6rem" }}>
        Recommended Action
      </div>
      <div style={{ background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 12, padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {/* Label + confidence */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 800, color: meta.accent, fontFamily: "monospace" }}>
            {rec.label}
          </span>
          <span style={{ fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 8px", borderRadius: 20, background: meta.border, color: meta.accent }}>
            {rec.confidence_level} CONFIDENCE
          </span>
        </div>

        {/* Action */}
        <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#0f172a", lineHeight: 1.45 }}>
          {rec.action}
        </p>

        {/* Detail */}
        {rec.detail && (
          <p style={{ margin: 0, fontSize: "0.78rem", color: "#475569", lineHeight: 1.55 }}>
            {rec.detail}
          </p>
        )}

        {/* HIGH: implementation */}
        {rec.implementation && (
          <div style={{ background: "white", borderRadius: 8, padding: "0.6rem 0.75rem", border: `1px solid ${meta.border}` }}>
            <p style={{ margin: "0 0 0.2rem", fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: meta.accent }}>Implementation</p>
            <p style={{ margin: 0, fontSize: "0.76rem", color: "#334155" }}>{rec.implementation}</p>
          </div>
        )}

        {/* MEDIUM: metrics + risks */}
        {rec.metrics && (
          <div style={{ background: "white", borderRadius: 8, padding: "0.6rem 0.75rem", border: `1px solid ${meta.border}` }}>
            <p style={{ margin: "0 0 0.2rem", fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: meta.accent }}>Metrics to Track</p>
            <p style={{ margin: 0, fontSize: "0.76rem", color: "#334155" }}>{rec.metrics}</p>
          </div>
        )}
        {rec.risks && (
          <div style={{ background: "white", borderRadius: 8, padding: "0.6rem 0.75rem", border: `1px solid ${meta.border}` }}>
            <p style={{ margin: "0 0 0.2rem", fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#f59e0b" }}>Risks</p>
            <p style={{ margin: 0, fontSize: "0.76rem", color: "#334155" }}>{rec.risks}</p>
          </div>
        )}

        {/* LOW: missing evidence + follow-up queries */}
        {rec.missing_evidence && (
          <div style={{ background: "white", borderRadius: 8, padding: "0.6rem 0.75rem", border: `1px solid ${meta.border}` }}>
            <p style={{ margin: "0 0 0.2rem", fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: meta.accent }}>Missing Evidence</p>
            <p style={{ margin: 0, fontSize: "0.76rem", color: "#334155" }}>{rec.missing_evidence}</p>
          </div>
        )}
        {rec.follow_up_queries && rec.follow_up_queries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <p style={{ margin: 0, fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: meta.accent }}>Follow-up Queries</p>
            {rec.follow_up_queries.map((q, i) => (
              <p key={i} style={{ margin: 0, fontSize: "0.74rem", color: "#334155", paddingLeft: "0.75rem", borderLeft: `2px solid ${meta.border}` }}>
                {q}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Memo ──────────────────────────────────────────────────────────────────────

function InvestmentMemoDisplay({ memo }: { memo: InvestmentMemo }) {
  const [appendixOpen, setAppendixOpen] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ background: "#0f172a", borderRadius: 12, padding: "1.25rem 1.5rem", color: "white" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <div>
            <p style={{ margin: "0 0 0.15rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8" }}>
              Investment Intelligence Memo
            </p>
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "white" }}>{memo.topic}</h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: "0.65rem", color: "#64748b" }}>
              {new Date(memo.generated_at).toLocaleString()}
            </p>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.65rem", color: "#64748b" }}>
              {memo.evidence_count} creator evidence points
            </p>
          </div>
        </div>

        {/* Key signals */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {memo.executive_summary.key_signals.map((sig, i) => (
            <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <span style={{ color: "#10b981", fontWeight: 700, fontSize: "0.75rem", flexShrink: 0, marginTop: 1 }}>→</span>
              <span style={{ fontSize: "0.78rem", color: "#e2e8f0" }}>{sig}</span>
            </div>
          ))}
        </div>

        {memo.executive_summary.market_interpretation && (
          <p style={{ margin: "0.85rem 0 0", fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.55, borderTop: "1px solid #1e293b", paddingTop: "0.75rem" }}>
            {memo.executive_summary.market_interpretation}
          </p>
        )}

        {/* Creator concentration row */}
        {memo.concentration_level && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #1e293b", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#475569" }}>Creator Diversity</span>
            <span style={{
              fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
              padding: "2px 8px", borderRadius: 20,
              background: memo.concentration_level === "HIGH" ? "#fee2e2" : memo.concentration_level === "MEDIUM" ? "#fef3c7" : "#dcfce7",
              color: memo.concentration_level === "HIGH" ? "#991b1b" : memo.concentration_level === "MEDIUM" ? "#92400e" : "#166534",
              border: `1px solid ${memo.concentration_level === "HIGH" ? "#fca5a5" : memo.concentration_level === "MEDIUM" ? "#fbbf24" : "#86efac"}`,
            }}>
              {memo.concentration_level} concentration · {Math.round((memo.creator_concentration ?? 0) * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Skew warning banner */}
      {memo.skew_warning && (
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", padding: "0.75rem 1rem", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10 }}>
          <span style={{ fontSize: "0.85rem", flexShrink: 0 }}>⚠</span>
          <p style={{ margin: 0, fontSize: "0.76rem", color: "#9a3412", lineHeight: 1.5 }}>
            <strong>Single-Creator Skew Detected.</strong> {memo.skew_warning} Treat insights as preliminary signals. Cross-reference with additional creators before acting.
          </p>
        </div>
      )}

      {/* Attribution report */}
      {memo.attribution_report && memo.attribution_report.total_claims > 0 && (() => {
        const ar = memo.attribution_report;
        const guestRisk = ar.guest_contamination_pct > 40 ? "#ef4444" : ar.guest_contamination_pct > 20 ? "#f59e0b" : "#10b981";
        return (
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.75rem 1rem" }}>
            <p style={{ margin: "0 0 0.6rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>
              Claim Attribution Breakdown
            </p>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
              {[
                { label: "Host", value: ar.host_claims, color: "#1d4ed8" },
                { label: "Guest", value: ar.guest_claims, color: "#c2410c" },
                { label: "3rd Party", value: ar.third_party_claims, color: "#166534" },
                { label: "Explicit", value: `${ar.explicit_pct}%`, color: "#10b981" },
              ].map(item => (
                <div key={item.label}>
                  <p style={{ margin: "0 0 0.05rem", fontSize: "0.57rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>{item.label}</p>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 900, color: item.color }}>{item.value}</p>
                </div>
              ))}
              {ar.guest_contamination_pct > 0 && (
                <div style={{ marginLeft: "auto", padding: "0.3rem 0.75rem", borderRadius: 8, background: `${guestRisk}11`, border: `1px solid ${guestRisk}44` }}>
                  <p style={{ margin: 0, fontSize: "0.67rem", fontWeight: 700, color: guestRisk }}>
                    {ar.guest_contamination_pct}% guest-derived
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 2. Opportunity Market Map */}
      {(memo.market_map ?? []).length > 0 && (
        <MarketMapSection entries={memo.market_map!} />
      )}

      {/* 3. Emerging Opportunities */}
      {memo.emerging_trends.length > 0 && (
        <section>
          <SectionHeader title="Emerging Trends" count={memo.emerging_trends.length} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
            {memo.emerging_trends.map((t, i) => <TrendCard key={i} trend={t} />)}
          </div>
        </section>
      )}

      {/* 4. Opportunity Ranking */}
      {memo.opportunity_ranking.length > 0 && (
        <section>
          <SectionHeader title="Emerging Opportunities" count={memo.opportunity_ranking.length} />
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>
            Each opportunity validated: ≥3 creators, &lt;50% concentration, topical relevance &gt;0.75. Click to expand.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {memo.opportunity_ranking.map((o, i) => <OpportunityCard key={i} opp={o} rank={i + 1} />)}
          </div>
        </section>
      )}

      {/* 5. Debate Map */}
      {memo.debate_map.length > 0 && (
        <section>
          <SectionHeader title="Debate Map" count={memo.debate_map.length} />
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>
            Where creators disagree — the highest-signal intelligence in the library.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {memo.debate_map.map((d, i) => <DebateCard key={i} debate={d} />)}
          </div>
        </section>
      )}

      {/* 6. Narrative Shifts */}
      <NarrativeShiftSection shifts={memo.narrative_shifts ?? []} />

      {/* 7. Early Movers */}
      <EarlyMoversSection movers={memo.early_movers ?? []} />

      {/* 8. Research Gaps */}
      <ResearchGapsSection gaps={memo.research_gaps ?? []} creatorCount={memo.creator_count ?? 0} />

      {/* Risk Signals */}
      {memo.risk_signals.length > 0 && (
        <section>
          <SectionHeader title="Risk & False Signal Watch" count={memo.risk_signals.length} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
            {memo.risk_signals.map((r, i) => <RiskItem key={i} risk={r} />)}
          </div>
        </section>
      )}

      {/* Recommended Action */}
      {memo.recommended_actions && (
        <RecommendedActionCard rec={memo.recommended_actions} />
      )}

      {/* Evidence Appendix */}
      {memo.evidence_appendix.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setAppendixOpen(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", padding: 0, marginBottom: appendixOpen ? "0.75rem" : 0 }}
          >
            <span style={{ fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
              Evidence Appendix ({memo.evidence_appendix.length})
            </span>
            <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>{appendixOpen ? "▲" : "▼"}</span>
          </button>

          {appendixOpen && (
            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
              {memo.evidence_appendix.map((item, i) => (
                <div key={i} style={{ padding: "0.55rem 0.9rem", borderBottom: i < memo.evidence_appendix.length - 1 ? "1px solid #f1f5f9" : "none", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "0.6rem", padding: "1px 6px", borderRadius: 4, background: item.type === "creator" ? "#dbeafe" : "#f3e8ff", color: item.type === "creator" ? "#1e40af" : "#6b21a8", fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                    {item.type === "creator" ? "CREATOR" : "WEB"}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: "0 0 0.1rem", fontSize: "0.73rem", color: "#0f172a" }}>{item.claim}</p>
                    <p style={{ margin: 0, fontSize: "0.67rem", color: "#94a3b8" }}>
                      {item.creator} · {item.video}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function DeepResearchView() {
  const [topic, setTopic] = useState("");
  const [running, setRunning] = useState(false);
  const [agentLog, setAgentLog] = useState<LogEntry[]>([]);
  const [memo, setMemo] = useState<InvestmentMemo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runResearch = useCallback(async () => {
    if (!topic.trim() || running) return;

    setRunning(true);
    setAgentLog([]);
    setMemo(null);
    setError(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch("/api/research/deep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as {
              event: string;
              agent?: string;
              message?: string;
              memo?: InvestmentMemo;
            };
            if (data.event === "stage") {
              setAgentLog(prev => [...prev, { agent: data.agent ?? "", message: data.message ?? "" }]);
            } else if (data.event === "complete" && data.memo) {
              setMemo(data.memo);
            } else if (data.event === "error") {
              setError(data.message ?? "Pipeline error");
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setRunning(false);
    }
  }, [topic, running]);

  function handleStop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Header */}
      <div>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>
          Deep Research
        </h1>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
          Multi-agent intelligence pipeline — atomic claim extraction, contradiction detection, and opportunity scoring
        </p>
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: "0.6rem" }}>
        <input
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void runResearch(); }}
          placeholder='Enter a topic or question — e.g. "AI agent monetization" or "short-form vs long-form content"'
          disabled={running}
          style={{
            flex: 1,
            padding: "0.6rem 0.9rem",
            fontSize: "0.85rem",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            background: running ? "#f8fafc" : "white",
            color: "#0f172a",
            outline: "none",
          }}
        />
        {running ? (
          <button
            type="button"
            onClick={handleStop}
            style={{ padding: "0.6rem 1.1rem", fontSize: "0.8rem", fontWeight: 700, borderRadius: 8, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            ✕ Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void runResearch()}
            disabled={!topic.trim()}
            style={{
              padding: "0.6rem 1.25rem",
              fontSize: "0.82rem",
              fontWeight: 700,
              borderRadius: 8,
              border: "none",
              background: !topic.trim() ? "#f1f5f9" : "#0f172a",
              color: !topic.trim() ? "#94a3b8" : "white",
              cursor: !topic.trim() ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            ⚡ Run Deep Research
          </button>
        )}
      </div>

      {/* Agent log */}
      <AgentLog entries={agentLog} running={running} />

      {/* Error */}
      {error && (
        <div style={{ padding: "0.85rem 1rem", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, color: "#991b1b", fontSize: "0.8rem" }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!running && !memo && agentLog.length === 0 && !error && (
        <div style={{ padding: "3rem 2rem", textAlign: "center", background: "#f8fafc", border: "1px dashed #e2e8f0", borderRadius: 12 }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "1.5rem" }}>🔬</p>
          <p style={{ margin: "0 0 0.4rem", fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}>Investment Intelligence Memo</p>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b", maxWidth: 440, marginLeft: "auto", marginRight: "auto", lineHeight: 1.55 }}>
            Enter any topic above. Five AI agents will extract atomic claims, detect debates, validate externally, score opportunities, and produce a structured investment-grade memo.
          </p>
        </div>
      )}

      {/* Memo */}
      {memo && <InvestmentMemoDisplay memo={memo} />}
    </div>
  );
}
