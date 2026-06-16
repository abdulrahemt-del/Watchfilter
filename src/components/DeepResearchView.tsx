"use client";

import { useState, useCallback, useRef } from "react";
import type {
  InvestmentMemo,
  TrendEntry,
  DebateCluster,
  OpportunityEntry,
  RiskEntry,
  RecommendedAction,
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
      <span style={{ fontSize: "0.68rem", fontWeight: 800, color, minWidth: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {pct}%
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
        <ConfidencePill level={trend.confidence} />
      </div>
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
          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#94a3b8" }}>
            {Math.round(debate.strength * 100)}% strength
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

// ── Opportunity card ──────────────────────────────────────────────────────────

function OpportunityCard({ opp, rank }: { opp: OpportunityEntry; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const score = Math.min(100, Math.round(opp.opportunity_score * 100));
  const rankColor = rank === 1 ? "#f59e0b" : rank === 2 ? "#94a3b8" : rank === 3 ? "#cd7c54" : "#475569";

  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem" }}>
        <span style={{ fontSize: "1.1rem", fontWeight: 900, color: rankColor, minWidth: 24, fontVariantNumeric: "tabular-nums" }}>
          #{rank}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: "0 0 0.35rem", fontSize: "0.82rem", fontWeight: 700, color: "#0f172a" }}>
            {opp.name}
          </p>
          <ScoreBar score={opp.opportunity_score} />
        </div>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "0.8rem", padding: "0.25rem", flexShrink: 0 }}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {opp.why_now && (
            <div>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#10b981" }}>Why Now</p>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#374151" }}>{opp.why_now}</p>
            </div>
          )}
          {opp.supporting_evidence.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#3b82f6" }}>Supporting Evidence</p>
              {opp.supporting_evidence.map((e, i) => (
                <p key={i} style={{ margin: "0.15rem 0", fontSize: "0.73rem", color: "#374151", paddingLeft: "0.75rem", borderLeft: "2px solid #dbeafe" }}>
                  {e}
                </p>
              ))}
            </div>
          )}
          {opp.counterarguments.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#ef4444" }}>Counterarguments</p>
              {opp.counterarguments.map((c, i) => (
                <p key={i} style={{ margin: "0.15rem 0", fontSize: "0.73rem", color: "#374151", paddingLeft: "0.75rem", borderLeft: "2px solid #fee2e2" }}>
                  {c}
                </p>
              ))}
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
      </div>

      {/* Emerging Trends */}
      {memo.emerging_trends.length > 0 && (
        <section>
          <SectionHeader title="Emerging Trends" count={memo.emerging_trends.length} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
            {memo.emerging_trends.map((t, i) => <TrendCard key={i} trend={t} />)}
          </div>
        </section>
      )}

      {/* Debate Map */}
      {memo.debate_map.length > 0 && (
        <section>
          <SectionHeader title="Debate Map" count={memo.debate_map.length} />
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>
            Where your creators disagree — the highest-signal intelligence in the library.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {memo.debate_map.map((d, i) => <DebateCard key={i} debate={d} />)}
          </div>
        </section>
      )}

      {/* Opportunity Ranking */}
      {memo.opportunity_ranking.length > 0 && (
        <section>
          <SectionHeader title="Opportunity Ranking" count={memo.opportunity_ranking.length} />
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>
            Score = emergence × contradiction pressure × (1 − consensus stability). Click any row to expand.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {memo.opportunity_ranking.map((o, i) => <OpportunityCard key={i} opp={o} rank={i + 1} />)}
          </div>
        </section>
      )}

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
