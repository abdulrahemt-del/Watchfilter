"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { IntelligenceMemo } from "@/app/api/intelligence/query/route";
import type { PredictionRow } from "@/lib/db";

// ── Intelligence Brief (Executive Summary) ────────────────────────────────────

function IntelligenceBriefCard({ memo }: { memo: IntelligenceMemo }) {
  const score = memo.confidence_score;
  const scoreColor = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";

  const recPrefix = score >= 80 ? "We recommend:" : score >= 55 ? "Evidence suggests:" : "Current evidence indicates:";

  const biggestTradeoff = memo.tradeoffs?.[0]?.why_it_matters ?? null;
  const keyLimitation   = memo.decision_drivers?.negative_signals?.[0]?.insight
                       ?? memo.decision_drivers?.uncertainty_factors?.[0]
                       ?? null;
  const missingEvidence = memo.decision_drivers?.missing_evidence?.[0] ?? null;

  const stabilityColor = memo.recommendation_stability === "High" ? "#10b981"
    : memo.recommendation_stability === "Low" ? "#ef4444" : "#f59e0b";

  return (
    <section style={{ background: "#060b14", border: "1px solid #1e293b", borderRadius: 14, padding: "1.25rem 1.5rem" }}>
      {/* Header */}
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.52rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#334155" }}>
        Intelligence Brief
      </p>

      {/* Pill row */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.9rem", alignItems: "center" }}>
        {memo.directional && (
          <span style={{ fontSize: "0.62rem", fontWeight: 800, padding: "3px 10px", borderRadius: 20, background: "#1e293b", color: "#94a3b8", border: "1px solid #334155" }}>
            {memo.directional}
          </span>
        )}
        {memo.recommendation_type && (
          <span style={{ fontSize: "0.58rem", fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: "#0f172a", color: "#64748b", border: "1px solid #1e293b" }}>
            {memo.recommendation_type}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {memo.recommendation_stability && (
            <span style={{ fontSize: "0.57rem", fontWeight: 700, color: stabilityColor }}>
              {memo.recommendation_stability} stability
            </span>
          )}
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.15rem" }}>
            <span style={{ fontSize: "1.6rem", fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: "0.55rem", color: "#475569", fontWeight: 700 }}>/100</span>
          </div>
        </div>
      </div>

      {/* Decision summary */}
      <p style={{ margin: "0 0 1rem", fontSize: "0.95rem", color: "#e2e8f0", lineHeight: 1.65, fontWeight: 400 }}>
        <span style={{ color: "#6366f1", fontWeight: 700 }}>{recPrefix} </span>
        {memo.decision_summary}
      </p>

      {/* Three-column insight strip */}
      {(biggestTradeoff || keyLimitation || missingEvidence) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.6rem" }}>
          {biggestTradeoff && (
            <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderTop: "2px solid #f59e0b", borderRadius: 8, padding: "0.6rem 0.75rem" }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.48rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#d97706" }}>Biggest Tradeoff</p>
              <p style={{ margin: 0, fontSize: "0.65rem", color: "#94a3b8", lineHeight: 1.5 }}>{biggestTradeoff}</p>
            </div>
          )}
          {keyLimitation && (
            <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderTop: "2px solid #ef4444", borderRadius: 8, padding: "0.6rem 0.75rem" }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.48rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#dc2626" }}>Key Limitation</p>
              <p style={{ margin: 0, fontSize: "0.65rem", color: "#94a3b8", lineHeight: 1.5 }}>{keyLimitation}</p>
            </div>
          )}
          {missingEvidence && (
            <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderTop: "2px solid #6366f1", borderRadius: 8, padding: "0.6rem 0.75rem" }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.48rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6366f1" }}>Missing Evidence</p>
              <p style={{ margin: 0, fontSize: "0.65rem", color: "#94a3b8", lineHeight: 1.5 }}>{missingEvidence}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Source tag ────────────────────────────────────────────────────────────────

function SourceTag({ src }: { src: "youtube" | "reddit" | "web" }) {
  const m = {
    youtube: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", label: "▶ Creator Intelligence" },
    reddit:  { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0", label: "▲ Community Intelligence" },
    web:     { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "⬡ Web Intelligence" },
  }[src];
  return (
    <span style={{ fontSize: "0.57rem", fontWeight: 800, padding: "1px 6px", borderRadius: 20, background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>
      {m.label}
    </span>
  );
}

// ── Decision card (primary) ───────────────────────────────────────────────────

const CONF_STYLE: Record<string, { bg: string; color: string }> = {
  High:   { bg: "#dcfce7", color: "#14532d" },
  Medium: { bg: "#fef3c7", color: "#92400e" },
  Low:    { bg: "#fee2e2", color: "#991b1b" },
};

// ── Strategy Profile Grid — per-option evidence profiles (Phase 4) ────────────

const COVERAGE_DOT: Record<string, { color: string; label: string }> = {
  Strong:  { color: "#10b981", label: "Strong" },
  Medium:  { color: "#f59e0b", label: "Medium" },
  Weak:    { color: "#f97316", label: "Weak" },
  Missing: { color: "#334155", label: "Missing" },
};

function StrategyProfileGrid({ cv }: { cv: NonNullable<IntelligenceMemo["comparative_verdict"]> }) {
  const profiles = cv.strategy_profiles;
  if (!profiles || profiles.length < 2) return null;

  return (
    <section style={{ background: "#0a0f1a", borderRadius: 14, overflow: "hidden", border: "1px solid #1e293b" }}>
      {/* Header */}
      <div style={{ padding: "0.8rem 1.25rem", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#475569" }}>Strategy Evidence Profiles</span>
        <span style={{ fontSize: "0.52rem", color: "#334155", marginLeft: "auto" }}>independent evidence — evaluated before comparison</span>
      </div>

      {/* Side-by-side profiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {profiles.map((profile, pi) => {
          const sc = profile.source_coverage;
          const strengthColor = profile.evidence_strength >= 70 ? "#10b981" : profile.evidence_strength >= 45 ? "#f59e0b" : "#ef4444";
          const isLast = pi === profiles.length - 1;
          return (
            <div key={pi} style={{
              padding: "1.1rem 1.25rem",
              borderRight: isLast ? "none" : "1px solid #1e293b",
              display: "flex", flexDirection: "column", gap: "0.9rem",
            }}>
              {/* Option name + evidence strength */}
              <div>
                <p style={{ margin: "0 0 0.45rem", fontSize: "0.95rem", fontWeight: 800, color: "#f8fafc", lineHeight: 1.2 }}>{profile.option}</p>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <div style={{ flex: 1, height: 5, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${profile.evidence_strength}%`, height: "100%", background: strengthColor, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 800, color: strengthColor, minWidth: 28 }}>{profile.evidence_strength}</span>
                </div>
                <p style={{ margin: "0 0 0.45rem", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#334155" }}>Evidence Strength</p>
                {/* Source coverage dots */}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {(["creator", "community", "web"] as const).map(src => {
                    const cov = src === "creator" ? sc.creator : src === "community" ? sc.community : sc.web;
                    const dot = COVERAGE_DOT[cov] ?? COVERAGE_DOT.Missing;
                    return (
                      <div key={src} style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dot.color }} />
                        <span style={{ fontSize: "0.56rem", color: "#64748b" }}>{src.charAt(0).toUpperCase() + src.slice(1)}: <span style={{ color: dot.color, fontWeight: 700 }}>{dot.label}</span></span>
                      </div>
                    );
                  })}
                </div>
                {/* Coverage Gap badge — shown only when at least one source has no evidence collected */}
                {(sc.creator === "Missing" || sc.community === "Missing" || sc.web === "Missing") && (
                  <div style={{ marginTop: "0.3rem", display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.15rem 0.45rem", background: "#1c1917", border: "1px solid #ef4444", borderRadius: 4 }}>
                    <span style={{ fontSize: "0.5rem", color: "#ef4444", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Coverage Gap</span>
                    <span style={{ fontSize: "0.5rem", color: "#78716c" }}>
                      — no evidence collected from {[sc.creator === "Missing" && "creators", sc.community === "Missing" && "community", sc.web === "Missing" && "web"].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                )}
              </div>

              {/* Advantages */}
              {profile.advantages.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 0.3rem", fontSize: "0.52rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#10b981" }}>✓ Advantages</p>
                  {profile.advantages.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.2rem" }}>
                      <span style={{ color: "#10b981", fontSize: "0.62rem", flexShrink: 0 }}>•</span>
                      <p style={{ margin: 0, fontSize: "0.67rem", color: "#94a3b8", lineHeight: 1.5 }}>{a}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Costs */}
              {profile.costs.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 0.3rem", fontSize: "0.52rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#f59e0b" }}>⚡ Costs</p>
                  {profile.costs.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.2rem" }}>
                      <span style={{ color: "#f59e0b", fontSize: "0.62rem", flexShrink: 0 }}>•</span>
                      <p style={{ margin: 0, fontSize: "0.67rem", color: "#94a3b8", lineHeight: 1.5 }}>{c}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Failure modes */}
              {profile.failure_modes.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 0.3rem", fontSize: "0.52rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#ef4444" }}>✗ Fails When</p>
                  {profile.failure_modes.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.2rem" }}>
                      <span style={{ color: "#ef4444", fontSize: "0.62rem", flexShrink: 0 }}>•</span>
                      <p style={{ margin: 0, fontSize: "0.67rem", color: "#94a3b8", lineHeight: 1.5 }}>{f}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Best for */}
              {profile.best_for.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 0.3rem", fontSize: "0.52rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#a78bfa" }}>◎ Best For</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                    {profile.best_for.map((b, i) => (
                      <span key={i} style={{ fontSize: "0.6rem", padding: "2px 7px", borderRadius: 4, background: "#1e293b", color: "#94a3b8", border: "1px solid #334155" }}>{b}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Expected Outcome */}
              {profile.expected_outcome && (
                <div style={{ background: "#0d1f0d", border: "1px solid #166534", borderRadius: 7, padding: "0.5rem 0.7rem" }}>
                  <p style={{ margin: "0 0 0.2rem", fontSize: "0.5rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4ade80" }}>Expected Outcome · 90 days</p>
                  <p style={{ margin: 0, fontSize: "0.65rem", color: "#86efac", lineHeight: 1.5 }}>{profile.expected_outcome}</p>
                </div>
              )}

              {/* Evidence Gaps */}
              {profile.evidence_gaps && profile.evidence_gaps.length > 0 && (
                <div style={{ background: "#1c1917", border: "1px solid #292524", borderRadius: 7, padding: "0.5rem 0.7rem" }}>
                  <p style={{ margin: "0 0 0.3rem", fontSize: "0.5rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#78716c" }}>Evidence Gaps</p>
                  {profile.evidence_gaps.map((g, i) => (
                    <div key={i} style={{ display: "flex", gap: "0.35rem", marginBottom: "0.15rem" }}>
                      <span style={{ fontSize: "0.58rem", color: "#57534e", flexShrink: 0 }}>?</span>
                      <p style={{ margin: 0, fontSize: "0.63rem", color: "#78716c", lineHeight: 1.45 }}>{g}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Evidence distribution bar */}
      {cv.coverage_balance && cv.coverage_balance.length >= 2 && (
        <div style={{ padding: "0.7rem 1.25rem", borderTop: "1px solid #1e293b", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0" }}>
          {cv.coverage_balance.map((opt, i) => (
            <div key={i} style={{ padding: "0 0.75rem", borderRight: i === 0 ? "1px solid #1e293b" : "none", paddingLeft: i > 0 ? "1.25rem" : 0 }}>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#334155" }}>Evidence Signals</p>
              <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 800, color: opt.signal_count >= 5 ? "#10b981" : opt.signal_count >= 2 ? "#f59e0b" : "#ef4444" }}>
                {opt.signal_count} <span style={{ fontSize: "0.62rem", fontWeight: 400, color: "#475569" }}>matched signals</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Comparison completeness + missing dimensions + decision risk */}
      {(cv.comparison_completeness || cv.missing_dimensions?.length || cv.decision_risk) && (
        <div style={{ padding: "0.75rem 1.25rem", borderTop: "1px solid #1e293b", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
          {cv.comparison_completeness && (
            <div>
              <p style={{ margin: "0 0 0.15rem", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>Comparison Completeness</p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{
                  fontSize: "0.62rem", fontWeight: 800, padding: "2px 8px", borderRadius: 20,
                  background: cv.comparison_completeness === "High" ? "#dcfce7" : cv.comparison_completeness === "Low" ? "#fee2e2" : "#fef3c7",
                  color: cv.comparison_completeness === "High" ? "#14532d" : cv.comparison_completeness === "Low" ? "#991b1b" : "#92400e",
                }}>
                  {cv.comparison_completeness}
                </span>
                {cv.completeness_reason && (
                  <span style={{ fontSize: "0.63rem", color: "#64748b" }}>{cv.completeness_reason}</span>
                )}
              </div>
            </div>
          )}
          {cv.decision_risk && (
            <div>
              <p style={{ margin: "0 0 0.15rem", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>Decision Risk</p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{
                  fontSize: "0.62rem", fontWeight: 800, padding: "2px 8px", borderRadius: 20,
                  background: cv.decision_risk === "Low" ? "#dcfce7" : cv.decision_risk === "High" ? "#fee2e2" : "#fef3c7",
                  color: cv.decision_risk === "Low" ? "#14532d" : cv.decision_risk === "High" ? "#991b1b" : "#92400e",
                }}>
                  {cv.decision_risk}
                </span>
                {cv.decision_risk_reason && (
                  <span style={{ fontSize: "0.63rem", color: "#64748b" }}>{cv.decision_risk_reason}</span>
                )}
              </div>
            </div>
          )}
          {cv.missing_dimensions && cv.missing_dimensions.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                Missing Dimensions ({cv.missing_dimensions.length})
              </p>
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                {cv.missing_dimensions.slice(0, 5).map((d, i) => (
                  <span key={i} style={{ fontSize: "0.57rem", padding: "1px 6px", borderRadius: 3, background: "#1e293b", color: "#64748b", border: "1px solid #334155" }}>{d}</span>
                ))}
                {cv.missing_dimensions.length > 5 && (
                  <span style={{ fontSize: "0.57rem", color: "#475569" }}>+{cv.missing_dimensions.length - 5} more</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Strategy Roadmap — phased approach integrating both strategies ─────────────

function StrategyRoadmapSection({ cv }: { cv: NonNullable<IntelligenceMemo["comparative_verdict"]> }) {
  const roadmap = cv.strategy_roadmap;
  if (!roadmap || roadmap.length === 0) return null;

  const PHASE_COLORS = ["#6366f1", "#10b981", "#f59e0b"];

  return (
    <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.9rem 1.1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.9rem" }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#64748b" }}>Strategy Roadmap</span>
        <span style={{ fontSize: "0.52rem", color: "#94a3b8", marginLeft: "auto" }}>how to use both strategies over time</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
        {roadmap.map((phase, pi) => {
          const phaseColor = PHASE_COLORS[pi % PHASE_COLORS.length];
          return (
            <div key={pi} style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
              {/* Phase connector */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: phaseColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "0.6rem", fontWeight: 900, color: "white" }}>{pi + 1}</span>
                </div>
                {pi < roadmap.length - 1 && (
                  <div style={{ width: 2, flex: 1, minHeight: 20, background: "#e2e8f0", margin: "4px 0" }} />
                )}
              </div>
              {/* Phase content */}
              <div style={{ flex: 1, paddingBottom: pi < roadmap.length - 1 ? "0.9rem" : 0 }}>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.72rem", fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>{phase.phase}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  {phase.steps.map((step, si) => (
                    <div key={si} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "0.6rem", color: phaseColor, flexShrink: 0, paddingTop: 1, fontWeight: 700 }}>→</span>
                      <p style={{ margin: 0, fontSize: "0.68rem", color: "#374151", lineHeight: 1.5 }}>{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ComparativeVerdictCard({ memo }: { memo: IntelligenceMemo }) {
  const cv = memo.comparative_verdict;
  if (!cv || !cv.dimensions.length) return null;

  // Assign a consistent color to each unique winner
  const WINNER_PALETTE = ["#a78bfa", "#34d399", "#fb923c", "#60a5fa", "#f472b6"];
  const uniqueWinners = [...new Set(cv.dimensions.map(d => d.winner))];
  const winnerColor: Record<string, string> = {};
  uniqueWinners.forEach((w, i) => { winnerColor[w] = WINNER_PALETTE[i % WINNER_PALETTE.length]; });

  return (
    <div style={{ background: "#0f172a", borderRadius: 12, padding: "1.5rem 1.75rem", borderLeft: "4px solid #6366f1" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.1rem" }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#475569" }}>Decision Matrix</span>
        <span style={{ fontSize: "0.55rem", color: "#334155", marginLeft: "auto" }}>{cv.dimensions.length} dimensions evaluated</span>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 2fr", gap: "0.75rem", paddingBottom: "0.45rem", borderBottom: "1px solid #1e293b", marginBottom: "0.25rem" }}>
        {["Dimension", "Winner", "Reason"].map(h => (
          <span key={h} style={{ fontSize: "0.5rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "#334155" }}>{h}</span>
        ))}
      </div>

      {/* Dimension rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: "1.1rem" }}>
        {cv.dimensions.map((dim, i) => {
          const cs = CONF_STYLE[dim.confidence] ?? CONF_STYLE.Medium;
          const wColor = winnerColor[dim.winner] ?? "#a78bfa";
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1.1fr 1fr 2fr", gap: "0.75rem",
              padding: "0.6rem 0.4rem",
              borderBottom: i < cv.dimensions.length - 1 ? "1px solid #1e293b" : "none",
              background: i % 2 === 0 ? "transparent" : "#080d1440",
              borderRadius: 4,
            }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#64748b", alignSelf: "center" }}>{dim.label}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", alignSelf: "center" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 800, color: wColor, lineHeight: 1.2 }}>{dim.winner}</span>
                <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.5rem", fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: cs.bg, color: cs.color, display: "inline-block" }}>{dim.confidence}</span>
                  {(dim.evidence_count ?? 0) > 0 && (
                    <span style={{ fontSize: "0.5rem", color: "#64748b" }}>{dim.evidence_count} signal{dim.evidence_count !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: "0.69rem", color: "#64748b", lineHeight: 1.55, alignSelf: "center" }}>{dim.reasons[0] ?? ""}</span>
            </div>
          );
        })}
      </div>

      {cv.overall_recommendation && (
        <div style={{ padding: "0.6rem 0.85rem", background: "#1e293b", borderRadius: 8, borderLeft: "3px solid #6366f1" }}>
          <p style={{ margin: "0 0 0.15rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>Overall Recommendation</p>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "#e2e8f0", lineHeight: 1.6 }}>{cv.overall_recommendation}</p>
        </div>
      )}

      {/* Coverage balance — warn when evidence is heavily skewed toward one option */}
      {cv.coverage_balance && cv.comparison_quality && cv.comparison_quality !== "Strong" && (
        <div style={{ marginTop: "0.85rem", padding: "0.5rem 0.75rem", background: "#1e1a0a", borderRadius: 8, borderLeft: "3px solid #f59e0b", display: "flex", gap: "0.85rem", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={{ margin: "0 0 0.15rem", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#92400e" }}>
              Coverage Quality: {cv.comparison_quality}
            </p>
            <p style={{ margin: "0 0 0.4rem", fontSize: "0.68rem", color: "#b45309", lineHeight: 1.45 }}>
              Evidence is not equally distributed across both options — interpret this comparison with caution.
            </p>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              {cv.coverage_balance.map((opt, i) => (
                <span key={i} style={{ fontSize: "0.6rem", color: "#94a3b8" }}>
                  <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{opt.option}</span>: {opt.signal_count} signal{opt.signal_count !== 1 ? "s" : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Source Agreement Banner (Item 7) ─────────────────────────────────────────

const REL_STYLE: Record<string, { bg: string; border: string; textColor: string }> = {
  CONSENSUS:     { bg: "#f0fdf4", border: "#86efac",  textColor: "#166534" },
  COMPLEMENTARY: { bg: "#eff6ff", border: "#bfdbfe",  textColor: "#1d4ed8" },
  TRADEOFF:      { bg: "#fefce8", border: "#fde047",  textColor: "#854d0e" },
  CONTRADICTION: { bg: "#fff1f2", border: "#fecdd3",  textColor: "#9f1239" },
};

const AGR_SOURCE_META = {
  youtube: { label: "Creator",   icon: "▶", color: "#ef4444", bg: "#fee2e2", border: "#fca5a5" },
  reddit:  { label: "Community", icon: "▲", color: "#10b981", bg: "#f0fdf4", border: "#86efac" },
  web:     { label: "Web",       icon: "⬡", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
} as const;

const CONSENSUS_QUALITY_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  Strong:       { bg: "#dcfce7", color: "#14532d", border: "#86efac", label: "Strong Consensus" },
  Medium:       { bg: "#fef3c7", color: "#78350f", border: "#fcd34d", label: "Partial Consensus" },
  Weak:         { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", label: "Weak Consensus" },
  Insufficient: { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1", label: "Insufficient Evidence" },
};

function SourceAgreementBanner({ memo }: { memo: IntelligenceMemo }) {
  const states   = memo.consensus?.source_states;
  const reason   = memo.consensus?.relationship_reason;
  const relType  = memo.consensus?.relationship_type ?? "CONSENSUS";
  if (!states || !reason) return null;

  const relStyle   = REL_STYLE[relType] ?? REL_STYLE.CONSENSUS;
  const cqStyle    = memo.consensus_quality ? (CONSENSUS_QUALITY_STYLE[memo.consensus_quality] ?? CONSENSUS_QUALITY_STYLE.Medium) : null;

  return (
    <div style={{ background: relStyle.bg, border: `1px solid ${relStyle.border}`, borderRadius: 10, padding: "0.7rem 1rem", display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
      {/* Per-source agreement indicators */}
      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexShrink: 0 }}>
        {(["youtube", "reddit", "web"] as const).map(src => {
          const m     = AGR_SOURCE_META[src];
          const state = states[src];
          const isActive   = state === "SUPPORTS";
          const isOpposed  = state === "OPPOSES";
          const isMixed    = state === "MIXED";
          const checkColor = isActive ? "#10b981" : isOpposed ? "#ef4444" : isMixed ? "#f59e0b" : "#94a3b8";
          const checkChar  = isActive ? "✓" : isOpposed ? "✗" : isMixed ? "~" : "—";
          return (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: "0.2rem", padding: "2px 8px", borderRadius: 20, background: isActive ? m.bg : "#f8fafc", border: `1px solid ${isActive ? m.border : "#e2e8f0"}` }}>
              <span style={{ fontSize: "0.59rem", fontWeight: 800, color: isActive ? m.color : "#94a3b8" }}>{m.icon} {m.label}</span>
              <span style={{ fontSize: "0.68rem", fontWeight: 900, color: checkColor, lineHeight: 1 }}>{checkChar}</span>
            </div>
          );
        })}
      </div>
      <span style={{ color: "#cbd5e1", flexShrink: 0, lineHeight: 1 }}>·</span>
      <p style={{ margin: 0, flex: 1, fontSize: "0.72rem", color: relStyle.textColor, lineHeight: 1.45, minWidth: 160 }}>
        {reason}
      </p>
      {/* Consensus quality badge — derived from evidence depth, not just directional agreement */}
      {cqStyle && (
        <span style={{ fontSize: "0.55rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: cqStyle.bg, color: cqStyle.color, border: `1px solid ${cqStyle.border}`, flexShrink: 0, whiteSpace: "nowrap" }}>
          {cqStyle.label}
        </span>
      )}
    </div>
  );
}

const DIRECTIONAL_STYLE: Record<string, { bg: string; color: string; bar: string }> = {
  "Strong YES (conditional)": { bg: "#14532d", color: "#86efac", bar: "#22c55e" },
  "Lean YES":                 { bg: "#166534", color: "#bbf7d0", bar: "#4ade80" },
  "Neutral / Tradeoff":       { bg: "#292524", color: "#d6d3d1", bar: "#78716c" },
  "Lean NO":                  { bg: "#7c2d12", color: "#fdba74", bar: "#fb923c" },
  "Strong NO (conditional)":  { bg: "#7f1d1d", color: "#fca5a5", bar: "#f87171" },
};

const STRENGTH_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Strong:   { bg: "#dcfce7", color: "#14532d", border: "#86efac" },
  Moderate: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
  Weak:     { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
};

function DecisionCard({ memo }: { memo: IntelligenceMemo }) {
  const ds = DIRECTIONAL_STYLE[memo.directional] ?? { bg: "#1e293b", color: "#94a3b8", bar: "#475569" };
  const dd = memo.decision_drivers;
  const strengthStyle = dd ? (STRENGTH_STYLE[dd.decision_strength] ?? STRENGTH_STYLE.Moderate) : null;

  return (
    <div style={{ background: "#0f172a", borderRadius: 12, padding: "1.5rem 1.75rem", borderLeft: `4px solid ${ds.bar}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#475569" }}>
          Decision
        </span>
        {memo.directional && (
          <span style={{ fontSize: "0.62rem", fontWeight: 800, padding: "2px 10px", borderRadius: 20, background: ds.bg, color: ds.color, letterSpacing: "0.04em" }}>
            {memo.directional}
          </span>
        )}
        {dd && strengthStyle && (
          <span style={{ fontSize: "0.55rem", fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: strengthStyle.bg, color: strengthStyle.color, border: `1px solid ${strengthStyle.border}` }}>
            {dd.decision_strength} signal
          </span>
        )}
        {memo.recommendation_type && memo.recommendation_type !== "Universal" && (
          <span style={{ fontSize: "0.55rem", fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" }}>
            {memo.recommendation_type}
          </span>
        )}
      </div>
      {memo.confidence_score < 55 && (
        <div style={{ marginBottom: "0.6rem", padding: "0.4rem 0.7rem", background: "#1e293b", borderRadius: 6, borderLeft: "3px solid #f59e0b" }}>
          <p style={{ margin: 0, fontSize: "0.68rem", color: "#d97706", lineHeight: 1.55 }}>
            Current evidence is limited. This is the most likely conclusion, but additional creator or practitioner evidence could materially change the recommendation.
          </p>
        </div>
      )}
      <p style={{ margin: "0 0 0.75rem", fontSize: "1rem", color: "#f8fafc", lineHeight: 1.75, fontWeight: 400 }}>
        {memo.confidence_score >= 80
          ? <><span style={{ color: "#a78bfa", fontWeight: 700 }}>We recommend: </span>{memo.decision_summary}</>
          : memo.confidence_score >= 55
          ? <><span style={{ color: "#94a3b8", fontWeight: 600 }}>Evidence suggests </span>{memo.decision_summary}</>
          : memo.decision_summary
        }
      </p>
      {dd?.decision_justification && (
        <div style={{ marginBottom: "0.75rem", padding: "0.55rem 0.75rem", background: "#1e293b", borderRadius: 8, borderLeft: "3px solid #334155" }}>
          <p style={{ margin: "0 0 0.2rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>Why this decision</p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#94a3b8", lineHeight: 1.6 }}>{dd.decision_justification}</p>
        </div>
      )}
      {(memo.recommendation_conditions && memo.recommendation_conditions.length > 0) ? (
        <div style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "#f0f9ff", borderRadius: 8, borderLeft: "3px solid #0ea5e9" }}>
          <p style={{ margin: "0 0 0.45rem", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#0369a1" }}>This recommendation changes if...</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {memo.recommendation_conditions.map((cond, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                <span style={{ fontSize: "0.62rem", color: "#0ea5e9", flexShrink: 0, paddingTop: 2, fontWeight: 700 }}>›</span>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "#0c4a6e", lineHeight: 1.5 }}>{cond}</p>
              </div>
            ))}
          </div>
        </div>
      ) : memo.condition_qualifier ? (
        <div style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "#f0f9ff", borderRadius: 8, borderLeft: "3px solid #0ea5e9" }}>
          <p style={{ margin: "0 0 0.15rem", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#0369a1" }}>When This Changes</p>
          <p style={{ margin: 0, fontSize: "0.72rem", color: "#0c4a6e", lineHeight: 1.55 }}>{memo.condition_qualifier}</p>
        </div>
      ) : null}
      {memo.why_not_alternative && (
        <div style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "#1e293b", borderRadius: 8, borderLeft: "3px solid #475569" }}>
          <p style={{ margin: "0 0 0.15rem", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#475569" }}>Why Not the Alternative?</p>
          <p style={{ margin: 0, fontSize: "0.72rem", color: "#94a3b8", lineHeight: 1.55 }}>{memo.why_not_alternative}</p>
        </div>
      )}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#475569" }}>Sources</span>
        {(memo.sources_used ?? []).map(s => <SourceTag key={s} src={s} />)}
        {memo.recommendation_stability && (
          <span style={{
            fontSize: "0.52rem", fontWeight: 700, padding: "1px 7px", borderRadius: 20, marginLeft: "auto",
            background: memo.recommendation_stability === "High" ? "#dcfce7" : memo.recommendation_stability === "Low" ? "#fee2e2" : "#f1f5f9",
            color: memo.recommendation_stability === "High" ? "#14532d" : memo.recommendation_stability === "Low" ? "#991b1b" : "#475569",
            border: `1px solid ${memo.recommendation_stability === "High" ? "#86efac" : memo.recommendation_stability === "Low" ? "#fca5a5" : "#cbd5e1"}`,
          }}>
            {memo.recommendation_stability} stability
          </span>
        )}
      </div>
    </div>
  );
}

// ── Confidence section (score + explanation) ──────────────────────────────────

function agreeLabel(score: number): string {
  if (score >= 81) return "Strong Consensus";
  if (score >= 61) return "General Consensus";
  if (score >= 31) return "Emerging Consensus";
  return "Low Consensus";
}

function ConfidenceSection({ memo }: { memo: IntelligenceMemo }) {
  const score = memo.confidence_score;
  const bd    = memo.confidence_breakdown;
  const density = memo.insight_density;
  const agreeScore = memo.consensus.agreement_score;

  const color = score >= 72 ? "#10b981" : score >= 48 ? "#f59e0b" : "#ef4444";
  const agreeColor = agreeScore >= 65 ? "#10b981" : agreeScore >= 40 ? "#f59e0b" : "#ef4444";

  // Compute evidence quality score from source quality scores (mirrors backend formula)
  const sqScores = memo.source_quality_scores;
  const qualityWeighted = sqScores
    ? Math.round(
        (sqScores.youtube.excluded ? 0 : sqScores.youtube.score) * 0.40 +
        (sqScores.reddit.excluded  ? 0 : sqScores.reddit.score)  * 0.35 +
        (sqScores.web.excluded     ? 0 : sqScores.web.score)     * 0.25
      )
    : null;

  // Contributions reflect the blended formula: 40% formula-derived + 60% quality-weighted
  // Bars show the formula-derived component for transparency
  const contributions = [
    { label: "Agreement Strength",       value: Math.round(bd.agreement * 0.40 * 0.40),      max: 16, color: "#10b981" },
    { label: "Source Coverage",          value: Math.round(bd.sourceCoverage * 0.25 * 0.40),  max: 10, color: "#3b82f6" },
    { label: "Cross-Source Convergence", value: Math.round((bd.crossSourceBonus ?? 0) * 0.40), max: 6, color: "#8b5cf6" },
    ...(qualityWeighted !== null ? [{ label: "Evidence Quality (60%)", value: Math.round(qualityWeighted * 0.60), max: 60, color: "#f59e0b" }] : []),
  ];
  const penalty = Math.round(bd.contradictionPenalty * 0.10);

  return (
    <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.9rem 1.1rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5rem", flexWrap: "wrap" }}>

        {/* Score */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem", minWidth: 60 }}>
          <span style={{ fontSize: "2rem", fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: "0.57rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>Confidence</span>
        </div>

        {/* Contribution breakdown */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: "0 0 0.4rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>
            Confidence Breakdown
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {contributions.map(({ label, value, max, color: c }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.6rem", color: "#64748b", width: 130, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${(value / max) * 100}%`, height: "100%", background: c, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: "0.6rem", fontWeight: 700, color: c, width: 24, textAlign: "right" }}>+{value}</span>
              </div>
            ))}
            {penalty > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.6rem", color: "#64748b", width: 130, flexShrink: 0 }}>Contradiction Penalty</span>
                <div style={{ flex: 1, height: 4, background: "#f1f5f9", borderRadius: 2 }} />
                <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#ef4444", width: 24, textAlign: "right" }}>−{penalty}</span>
              </div>
            )}
          </div>
        </div>

        {/* Agreement + density */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", minWidth: 140 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div style={{ width: 60, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${agreeScore}%`, height: "100%", background: agreeColor, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: "0.65rem", fontWeight: 800, color: agreeColor }}>
              {memo.consensus_quality
                ? CONSENSUS_QUALITY_STYLE[memo.consensus_quality]?.label ?? agreeLabel(agreeScore)
                : agreeLabel(agreeScore)}
            </span>
          </div>
          {memo.consensus.supporting_sources != null && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.57rem", color: "#10b981" }}>↑ {memo.consensus.supporting_sources} supporting</span>
              {(memo.consensus.opposing_sources ?? 0) > 0 && (
                <span style={{ fontSize: "0.57rem", color: "#ef4444" }}>↓ {memo.consensus.opposing_sources} opposing</span>
              )}
              {(memo.consensus.unavailable_sources ?? 0) > 0 && (
                <span style={{ fontSize: "0.57rem", color: "#94a3b8" }}>◌ {memo.consensus.unavailable_sources} unavailable</span>
              )}
            </div>
          )}
          {density && (
            <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>
              {density.total_signals} signals · {density.unique_insights} unique insight{density.unique_insights !== 1 ? "s" : ""}
            </span>
          )}
        </div>

      </div>

      {/* +/- confidence factors derived from memo data */}
      {(() => {
        const positives: string[] = [];
        const negatives: string[] = [];

        if ((bd.crossSourceBonus ?? 0) >= 10) positives.push("Strong agreement across creators and web");
        else if ((bd.crossSourceBonus ?? 0) >= 5) positives.push("Partial cross-source agreement detected");

        if (bd.agreement >= 70) positives.push("High signal density across evidence");
        else if (bd.agreement >= 50) positives.push("Moderate signal density");

        if ((memo.consensus.supporting_sources ?? 0) >= 2 && (memo.consensus.opposing_sources ?? 0) === 0)
          positives.push("All available sources support the same conclusion");

        if (bd.sourceCoverage >= 70) positives.push("Broad source coverage");

        if ((memo.contradictions?.length ?? 0) > 0)
          negatives.push(`${memo.contradictions.length} contradiction${memo.contradictions.length > 1 ? "s" : ""} reduce certainty`);

        if (memo.reddit_gap) negatives.push("Limited community practitioner coverage");

        if (bd.sourceCoverage < 40) negatives.push("Weak source coverage — fewer than all three sources contributed");

        const ciLevel = memo.creator_intelligence?.coverage?.coverage_status ?? memo.creator_intelligence?.coverage?.level;
        if (ciLevel === "Low" || ciLevel === "Weak") negatives.push("Limited creator diversity on this topic");

        if (positives.length === 0 && negatives.length === 0) return null;
        return (
          <div style={{ marginTop: "0.75rem", paddingTop: "0.65rem", borderTop: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {positives.map((f, i) => (
              <div key={`p${i}`} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                <span style={{ fontSize: "0.62rem", color: "#10b981", flexShrink: 0, paddingTop: 1 }}>+</span>
                <span style={{ fontSize: "0.67rem", color: "#374151", lineHeight: 1.45 }}>{f}</span>
              </div>
            ))}
            {negatives.map((f, i) => (
              <div key={`n${i}`} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                <span style={{ fontSize: "0.62rem", color: "#ef4444", flexShrink: 0, paddingTop: 1 }}>−</span>
                <span style={{ fontSize: "0.67rem", color: "#374151", lineHeight: 1.45 }}>{f}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Why this confidence score — deterministic prose */}
      {(() => {
        const parts: string[] = [];
        const sqCreator   = memo.source_quality_scores?.youtube?.score  ?? 0;
        const sqCommunity = memo.source_quality_scores?.reddit?.score   ?? 0;
        const sqWeb       = memo.source_quality_scores?.web?.score      ?? 0;
        const activeSources = [sqCreator > 0 && "creators", sqCommunity > 0 && "community practitioners", sqWeb > 0 && "web sources"].filter(Boolean);

        if (score >= 75) {
          parts.push(`Confidence is high because evidence converges across ${activeSources.length >= 2 ? activeSources.slice(0, -1).join(", ") + " and " + activeSources.slice(-1) : activeSources[0] ?? "multiple sources"}.`);
        } else if (score >= 50) {
          parts.push(`Confidence is moderate — evidence is directional but not fully convergent across all sources.`);
        } else {
          parts.push(`Confidence is low due to limited or conflicting evidence.`);
        }

        const cvData = memo.comparative_verdict;
        if (cvData?.comparison_completeness === "Low" || cvData?.missing_dimensions?.length) {
          const missing = cvData.missing_dimensions?.slice(0, 2).join(" and ");
          parts.push(`Comparative coverage is incomplete${missing ? `: ${missing} dimension${cvData.missing_dimensions!.length > 1 ? "s are" : " is"} not covered by collected evidence` : ""}.`);
        }

        if ((memo.contradictions?.length ?? 0) > 0) {
          parts.push(`${memo.contradictions.length} contradiction${memo.contradictions.length > 1 ? "s were" : " was"} found and penalized.`);
        }

        if (parts.length === 0) return null;
        return (
          <div style={{ marginTop: "0.65rem", paddingTop: "0.65rem", borderTop: "1px solid #f1f5f9" }}>
            <p style={{ margin: "0 0 0.2rem", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>Why this confidence score</p>
            <p style={{ margin: 0, fontSize: "0.67rem", color: "#374151", lineHeight: 1.55 }}>{parts.join(" ")}</p>
          </div>
        );
      })()}

    </section>
  );
}

// ── Decision Drivers ─────────────────────────────────────────────────────────

const DD_SRC_META = {
  creator:   { icon: "▶", color: "#ef4444", bg: "#fee2e2", border: "#fca5a5", label: "Creator" },
  community: { icon: "▲", color: "#10b981", bg: "#f0fdf4", border: "#86efac", label: "Community" },
  web:       { icon: "⬡", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", label: "Web" },
} as const;

function SignalSourceBadges({ srcs }: { srcs: Array<"creator" | "community" | "web"> }) {
  return (
    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
      {srcs.map(s => {
        const m = DD_SRC_META[s];
        return (
          <span key={s} style={{ fontSize: "0.55rem", fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
            {m.icon} {m.label}
          </span>
        );
      })}
    </div>
  );
}

function DecisionDriversSection({ memo }: { memo: IntelligenceMemo }) {
  const dd = memo.decision_drivers;
  if (!dd) return null;
  const hasDrivers = dd.positive_signals.length > 0 || dd.negative_signals.length > 0 || dd.uncertainty_factors.length > 0;
  if (!hasDrivers) return null;

  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Decision Drivers
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "0.75rem" }}>

        {/* Positive Signals */}
        {dd.positive_signals.length > 0 && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "0.85rem 1rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#15803d" }}>
              ↑ Positive Signals
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {dd.positive_signals.map((sig, i) => {
                const scoreColor = sig.confidence_score >= 60 ? "#15803d" : sig.confidence_score >= 35 ? "#d97706" : "#991b1b";
                return (
                  <div key={i} style={{ paddingBottom: i < dd.positive_signals.length - 1 ? "0.6rem" : 0, borderBottom: i < dd.positive_signals.length - 1 ? "1px solid #dcfce7" : "none" }}>
                    {sig.is_cross_source && (
                      <span style={{ fontSize: "0.52rem", fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "#8b5cf620", color: "#7c3aed", border: "1px solid #c4b5fd", display: "inline-block", marginBottom: "0.25rem" }}>
                        ✦ Cross-Source
                      </span>
                    )}
                    <p style={{ margin: "0 0 0.35rem", fontSize: "0.73rem", color: "#166534", lineHeight: 1.5, fontWeight: 500 }}>{sig.insight}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <SignalSourceBadges srcs={sig.source_types} />
                      <span style={{ fontSize: "0.58rem", fontWeight: 700, color: scoreColor, marginLeft: "auto" }}>
                        {sig.confidence_score}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Negative Signals */}
        {dd.negative_signals.length > 0 && (
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "0.85rem 1rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#c2410c" }}>
              ↓ Negative Signals
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {dd.negative_signals.map((sig, i) => {
                const scoreColor = sig.confidence_score >= 60 ? "#15803d" : sig.confidence_score >= 35 ? "#d97706" : "#991b1b";
                return (
                  <div key={i} style={{ paddingBottom: i < dd.negative_signals.length - 1 ? "0.6rem" : 0, borderBottom: i < dd.negative_signals.length - 1 ? "1px solid #fed7aa" : "none" }}>
                    <p style={{ margin: "0 0 0.35rem", fontSize: "0.73rem", color: "#9a3412", lineHeight: 1.5, fontWeight: 500 }}>{sig.insight}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <SignalSourceBadges srcs={sig.source_types} />
                      <span style={{ fontSize: "0.58rem", fontWeight: 700, color: scoreColor, marginLeft: "auto" }}>
                        {sig.confidence_score}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Uncertainty Factors */}
        {dd.uncertainty_factors.length > 0 && (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>
              ◌ Uncertainty Factors
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {dd.uncertainty_factors.map((f, i) => (
                <li key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.65rem", paddingTop: 1, flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: "0.7rem", color: "#475569", lineHeight: 1.5 }}>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </section>
  );
}

// ── Missing Evidence ──────────────────────────────────────────────────────────

function MissingEvidenceSection({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1.1rem" }}>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        What Would Increase Confidence?
      </h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: "flex", gap: "0.45rem", alignItems: "flex-start" }}>
            <span style={{ color: "#6366f1", fontSize: "0.65rem", paddingTop: 2, flexShrink: 0 }}>+</span>
            <span style={{ fontSize: "0.72rem", color: "#374151", lineHeight: 1.5 }}>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Source breakdown ─────────────────────────────────────────────────────────

const SRC_DISPLAY = {
  youtube: { label: "Creator Intelligence",   icon: "▶", accent: "#ef4444", dimBg: "#fee2e2", dimBorder: "#fca5a5" },
  reddit:  { label: "Community Intelligence", icon: "▲", accent: "#10b981", dimBg: "#f0fdf4", dimBorder: "#86efac" },
  web:     { label: "Web Intelligence",       icon: "⬡", accent: "#3b82f6", dimBg: "#eff6ff", dimBorder: "#bfdbfe" },
} as const;

const SRC_QUESTION: Record<"youtube" | "reddit" | "web", string> = {
  youtube: "What do experienced creators and operators say?",
  reddit:  "What actually happened in practice?",
  web:     "What is generally recommended?",
};

const SRC_BULLETS_LABEL: Record<"youtube" | "reddit" | "web", string> = {
  youtube: "Operator Beliefs",
  reddit:  "Practitioner Observations",
  web:     "Consensus Recommendations",
};

const SRC_VIEW_LABEL: Record<"youtube" | "reddit" | "web", string> = {
  youtube: "Common Operator View",
  reddit:  "Community Consensus",
  web:     "Common Playbook",
};

const SRC_SYNTH_LABEL: Record<"youtube" | "reddit" | "web", string> = {
  youtube: "What experienced operators believe:",
  reddit:  "What community practitioners observed:",
  web:     "What is generally recommended:",
};

// ── Creator outcome display labels ────────────────────────────────────────────

const CREATOR_OUTCOME_LABEL: Record<string, string> = {
  MISSING_CONTENT:   "Missing Creator Content",
  RETRIEVAL_FAILURE: "Retrieval Failure",
  QUALITY_FAILURE:   "Quality Gate Failure",
  ALIGNMENT_FAILURE: "Adjacent Creator Coverage",
  SYNTHESIS_FAILURE: "Synthesis Failure",
  WEAK_SIGNAL:       "Weak Creator Signal",
  STRONG_SIGNAL:     "Strong Creator Signal",
};

// ── Creator Evidence Section — evidence-backed claims with source attribution ──

const CONSENSUS_META: Record<string, { bg: string; color: string; border: string }> = {
  "Broad Consensus":    { bg: "#dcfce7", color: "#14532d", border: "#86efac" },
  "Strong Consensus":   { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7" },
  "Emerging Consensus": { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
  "Anecdotal":          { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" },
};

function creatorConsensusLabel(count: number): string {
  if (count === 1) return "One creator suggested";
  if (count === 2) return "Limited creator support";
  if (count <= 5) return `Emerging creator consensus`;
  return `Strong creator consensus`;
}

function CreatorEvidenceSection({ memo }: { memo: IntelligenceMemo }) {
  const ci = memo.creator_intelligence;
  const acc = SRC_DISPLAY.youtube.accent;

  if (!ci) return null;

  const { claims, coverage } = ci;
  const coverageStatus = coverage.coverage_status;
  const coverageColor =
    coverageStatus === "Good"         ? "#10b981"
    : coverageStatus === "Weak"       ? "#d97706"
    : coverageStatus === "Contaminated" ? "#dc2626"
    : coverageStatus === "No Coverage"  ? "#94a3b8"
    : coverage.level === "High" ? "#10b981" : coverage.level === "Medium" ? "#d97706" : "#ef4444";
  const coverageLabel = coverageStatus ?? coverage.level;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>

      {/* Coverage badge row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontSize: "0.67rem", fontStyle: "italic", color: "#64748b" }}>
          {SRC_QUESTION.youtube}
        </p>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          {coverage.unique_creators != null && coverage.unique_creators > 0 && coverageStatus !== "Contaminated" && (
            <span style={{ fontSize: "0.57rem", color: "#94a3b8" }}>
              {creatorConsensusLabel(coverage.unique_creators)} ({coverage.unique_creators}) · {coverage.accepted} segments
            </span>
          )}
          <span style={{ fontSize: "0.58rem", fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: `${coverageColor}18`, color: coverageColor, border: `1px solid ${coverageColor}44`, whiteSpace: "nowrap" }}>
            {coverageLabel} ({coverage.coverage_score}%)
          </span>
        </div>
      </div>

      {/* Signal quality note — shown when coverage and alignment diverge */}
      {(() => {
        const avgAlign = ci.debug?.alignment?.average_alignment ?? null;
        if (avgAlign == null) return null;
        if (coverage.level !== "Low" && avgAlign < 0.35) {
          return (
            <p style={{ margin: 0, fontSize: "0.62rem", color: "#d97706", lineHeight: 1.5 }}>
              Strong coverage · Weak alignment — creator content exists but addresses different aspects of this topic.
            </p>
          );
        }
        if (coverage.level === "Low" && avgAlign >= 0.60) {
          return (
            <p style={{ margin: 0, fontSize: "0.62rem", color: "#64748b", lineHeight: 1.5 }}>
              Weak coverage · Strong alignment — few claims found, but available evidence is highly relevant to the query.
            </p>
          );
        }
        return null;
      })()}

      {/* Low-coverage warning */}
      {coverageStatus === "Weak" || (!coverageStatus && coverage.level === "Low") ? (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "0.5rem 0.75rem" }}>
          <p style={{ margin: 0, fontSize: "0.67rem", color: "#9a3412", lineHeight: 1.5 }}>
            Limited creator content found for this topic. {coverage.retrieved > 0 ? `${coverage.accepted} of ${coverage.retrieved} retrieved segments matched — results may draw from loosely related content.` : "No creator segments retrieved."}
          </p>
        </div>
      ) : null}

      {/* Creator Signal Audit Strip — always visible */}
      {ci.debug?.alignment && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: "0.45rem 0.75rem" }}>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            {[
              { label: "Corpus", value: ci.coverage.corpus_matches ?? "—" },
              { label: "Retrieved", value: ci.coverage.retrieved },
              { label: "Accepted", value: ci.coverage.accepted },
              { label: "Aligned", value: ci.alignment_percentage != null ? `${ci.debug.alignment.high_alignment_claims} (${ci.alignment_percentage}%)` : ci.debug.alignment.high_alignment_claims },
              { label: "Themes", value: ci.themes_generated },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", gap: "0.3rem", alignItems: "baseline" }}>
                <span style={{ fontSize: "0.55rem", color: "#94a3b8" }}>{s.label}</span>
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#374151" }}>{s.value}</span>
              </div>
            ))}
            {(() => {
              const FAILURE_OUTCOMES = new Set([
                "MISSING_CONTENT", "RETRIEVAL_FAILURE", "QUALITY_FAILURE",
                "ALIGNMENT_FAILURE", "SYNTHESIS_FAILURE",
              ]);
              const oc = ci.outcome;
              if (!oc || !FAILURE_OUTCOMES.has(oc)) return null;
              return (
                <span style={{ marginLeft: "auto", fontSize: "0.54rem", fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                  background: "#fef2f280", color: "#dc2626", border: "1px solid #fecaca30" }}>
                  ✗ {CREATOR_OUTCOME_LABEL[oc] ?? oc}
                </span>
              );
            })()}
          </div>
        </div>
      )}

      {/* Evidence claims */}
      {claims.length > 0 ? claims.map((claim, ci_i) => {
        const consensusMeta = CONSENSUS_META[claim.consensus ?? "Anecdotal"] ?? CONSENSUS_META["Anecdotal"];
        const scoreColor = (claim.confidence_score ?? 0) >= 60 ? "#10b981" : (claim.confidence_score ?? 0) >= 35 ? "#d97706" : "#ef4444";
        return (
          <div key={ci_i} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 9, overflow: "hidden" }}>

            {/* Claim header */}
            <div style={{ padding: "0.65rem 0.85rem 0.55rem", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.15rem" }}>
                  <p style={{ margin: 0, fontSize: "0.57rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Claim</p>
                  {claim.potentially_off_question && (
                    <span style={{ fontSize: "0.52rem", fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                      background: "#fef3c720", color: "#d97706", border: "1px solid #fde68a60" }}>
                      Potentially Off Question
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: claim.potentially_off_question ? "#9a7a20" : "#0f172a", lineHeight: 1.5 }}>{claim.theme}</p>
                {claim.avg_alignment != null && (
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.56rem", color: claim.avg_alignment >= 0.60 ? "#10b981" : claim.avg_alignment >= 0.35 ? "#d97706" : "#ef4444" }}>
                    Alignment {Math.round(claim.avg_alignment * 100)}%
                  </p>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem", flexShrink: 0 }}>
                {/* Consensus label */}
                <span style={{ fontSize: "0.56rem", fontWeight: 800, padding: "1px 8px", borderRadius: 20, background: consensusMeta.bg, color: consensusMeta.color, border: `1px solid ${consensusMeta.border}`, whiteSpace: "nowrap" }}>
                  {claim.consensus ?? "Anecdotal"}
                </span>
                {/* Confidence score */}
                {claim.confidence_score != null && (
                  <span style={{ fontSize: "0.6rem", fontWeight: 800, color: scoreColor }}>
                    {claim.confidence_score} / 100
                  </span>
                )}
                {/* Creator + evidence count */}
                <span style={{ fontSize: "0.55rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
                  {claim.creator_count ?? claim.evidence.length} creator{(claim.creator_count ?? claim.evidence.length) !== 1 ? "s" : ""}
                  {claim.evidence_count != null && claim.evidence_count !== (claim.creator_count ?? claim.evidence.length)
                    ? ` · ${claim.evidence_count} mentions`
                    : ""}
                </span>
              </div>
            </div>

            {/* Evidence list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {claim.evidence.map((ev, ev_i) => {
                const alignPct = ev.question_alignment_score != null ? Math.round(ev.question_alignment_score * 100) : null;
                const alignColor = alignPct == null ? "#94a3b8" : alignPct >= 60 ? "#10b981" : alignPct >= 30 ? "#d97706" : "#ef4444";
                return (
                  <div key={ev_i} style={{ padding: "0.65rem 0.85rem", borderBottom: ev_i < claim.evidence.length - 1 ? "1px solid #f8fafc" : "none" }}>

                    {/* Creator + source line */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#0f172a" }}>{ev.creator}</span>
                      {ev.video_title && (
                        <>
                          <span style={{ fontSize: "0.6rem", color: "#cbd5e1" }}>·</span>
                          {ev.video_id ? (
                            <a href={`https://www.youtube.com/watch?v=${ev.video_id}${ev.timestamp ? `&t=${ev.timestamp.replace(":", "m")}s` : ""}`} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: "0.63rem", color: acc, textDecoration: "none", fontStyle: "italic" }}>
                              {ev.video_title.slice(0, 60)}{ev.video_title.length > 60 ? "…" : ""}
                            </a>
                          ) : (
                            <span style={{ fontSize: "0.63rem", color: "#64748b", fontStyle: "italic" }}>{ev.video_title.slice(0, 60)}{ev.video_title.length > 60 ? "…" : ""}</span>
                          )}
                          {ev.timestamp && (
                            <>
                              <span style={{ fontSize: "0.6rem", color: "#cbd5e1" }}>·</span>
                              <span style={{ fontSize: "0.6rem", color: "#94a3b8", fontFamily: "monospace" }}>{ev.timestamp}</span>
                            </>
                          )}
                        </>
                      )}
                      {alignPct != null && (
                        <span style={{ fontSize: "0.53rem", fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                          background: `${alignColor}18`, color: alignColor, border: `1px solid ${alignColor}44`,
                          marginLeft: "auto", flexShrink: 0 }}>
                          {alignPct}% aligned
                        </span>
                      )}
                    </div>

                    {/* Quote */}
                    <blockquote style={{ margin: 0, padding: "0.3rem 0 0.3rem 0.6rem", borderLeft: `2px solid ${acc}44`, fontSize: "0.7rem", color: "#475569", lineHeight: 1.6, fontStyle: "italic" }}>
                      "{ev.quote}"
                    </blockquote>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }) : (() => {
        const OUTCOME_COPY: Record<string, { title: string; body: string }> = {
          MISSING_CONTENT: {
            title: "Missing Creator Content",
            body:  "We could not find creator content directly addressing this topic. This query is not yet covered in the creator library.",
          },
          RETRIEVAL_FAILURE: {
            title: "Retrieval Failure",
            body:  `Creator content exists in the corpus (${coverage.corpus_matches} match${coverage.corpus_matches !== 1 ? "es" : ""}), but retrieval did not surface relevant segments for this query.`,
          },
          QUALITY_FAILURE: {
            title: "Quality Gate Failure",
            body:  "Retrieved creator content did not meet quality thresholds. Evidence may exist but was too weak to use.",
          },
          ALIGNMENT_FAILURE: {
            title: "Adjacent Creator Coverage",
            body:  "Creator content exists nearby this topic, but retrieved segments primarily discuss related subjects rather than directly answering the query. Additional creator coverage on this topic would materially improve results.",
          },
          SYNTHESIS_FAILURE: {
            title: "Synthesis Failure",
            body:  "Relevant creator evidence was identified but could not be consolidated into strong themes. This may indicate conflicting or sparse evidence.",
          },
        };
        const copy = ci.outcome ? OUTCOME_COPY[ci.outcome] : null;
        return (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.65rem 0.9rem" }}>
            <p style={{ margin: "0 0 0.3rem", fontSize: "0.7rem", fontWeight: 700, color: "#475569" }}>
              {copy?.title ?? "Creator Intelligence Unavailable"}
            </p>
            <p style={{ margin: 0, fontSize: "0.66rem", color: "#64748b", lineHeight: 1.65 }}>
              {copy?.body ?? "No creator evidence found for this query."}
            </p>
          </div>
        );
      })()}
    </div>
  );
}

// ── Creator Retrieval Diagnostics v2 ─────────────────────────────────────────

const REJECTION_LABEL: Record<string, string> = {
  OFF_TOPIC:       "Off Topic",
  LOW_SIMILARITY:  "Low Similarity",
  LOW_QUALITY:     "Low Quality",
  LOW_ALIGNMENT:   "Low Alignment",
  DUPLICATE:       "Duplicate",
  COVERAGE_GATE:   "Coverage Gate",
  DOMAIN_MISMATCH: "Domain Mismatch",
  RETRIEVAL_CUTOFF:"Retrieval Cutoff",
  UNKNOWN:         "Unknown",
};

function DiagStat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: "0.52rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>{label}</span>
      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: accent ?? "#e2e8f0" }}>{value}</span>
    </div>
  );
}

function FunnelViz({ funnel }: { funnel: NonNullable<IntelligenceMemo["creator_intelligence"]>["debug"]["retrieval_funnel"] }) {
  const steps = [
    { label: "Corpus", value: funnel.corpus_matches },
    { label: "Retrieved", value: funnel.retrieved },
    { label: "Strength", value: funnel.passed_strength },
    { label: "Relevance", value: funnel.passed_relevance },
    { label: "Quality", value: funnel.passed_quality },
    { label: "Topic", value: funnel.passed_topic_gate },
    { label: "Accepted", value: funnel.accepted },
  ];
  const maxVal = Math.max(...steps.map(s => s.value), 1);
  return (
    <div>
      <p style={{ margin: "0 0 0.4rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>Retrieval Funnel</p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "2px" }}>
        {steps.map((s, i) => {
          const pct = Math.round((s.value / maxVal) * 100);
          const isLast = i === steps.length - 1;
          return (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: 1 }}>
              <span style={{ fontSize: "0.62rem", fontWeight: 700, color: isLast ? "#10b981" : "#94a3b8" }}>{s.value}</span>
              <div style={{ width: "100%", height: 32, background: "#1e293b", borderRadius: 3, display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", height: `${Math.max(pct, 4)}%`, background: isLast ? "#10b981" : "#334155", borderRadius: 3, transition: "height 0.3s" }} />
              </div>
              <span style={{ fontSize: "0.48rem", color: "#475569", textAlign: "center", lineHeight: 1.2 }}>{s.label}</span>
              {i < steps.length - 1 && (
                <span style={{ fontSize: "0.5rem", color: "#334155" }}>→</span>
              )}
            </div>
          );
        })}
      </div>
      {/* Compact linear display */}
      <p style={{ margin: "0.35rem 0 0", fontSize: "0.6rem", color: "#64748b", fontFamily: "monospace" }}>
        {steps.map(s => s.value).join(" → ")}
      </p>
    </div>
  );
}

function CreatorDiagnostics({ memo }: { memo: IntelligenceMemo }) {
  const [open, setOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const ci = memo.creator_intelligence;
  if (!ci) return null;
  const { coverage, debug } = ci;

  const primaryColor =
    coverage.coverage_status === "Good"        ? "#10b981"
    : coverage.coverage_status === "Weak"      ? "#d97706"
    : coverage.coverage_status === "Contaminated" ? "#ef4444"
    : "#94a3b8";

  return (
    <div style={{ background: "#0f172a", borderRadius: 10, overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: "100%", padding: "0.65rem 1rem", background: "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569" }}>
          ▶ Creator Retrieval Diagnostics v2
        </span>
        <span style={{ fontSize: "0.6rem", color: "#475569" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 1rem 1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Coverage summary */}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <DiagStat label="Corpus Matches" value={coverage.corpus_matches ?? "—"} />
            <DiagStat label="Retrieved"      value={coverage.retrieved} />
            <DiagStat label="Accepted"       value={coverage.accepted} />
            <DiagStat label="Status"         value={coverage.coverage_status ?? coverage.level} accent={primaryColor} />
            <DiagStat label="Root Cause"     value={coverage.root_cause ?? "—"} accent={coverage.root_cause !== "None" ? "#f97316" : "#64748b"} />
            <DiagStat label="Primary Failure" value={coverage.primary_failure_stage ?? "—"} accent={coverage.primary_failure_stage !== "None" ? "#fb923c" : "#64748b"} />
            <DiagStat label="Evidence Lost"  value={coverage.evidence_lost ?? 0} />
            <DiagStat label="Top Rejection"  value={coverage.most_common_rejection ?? "—"} />
          </div>

          {/* Creator Relevance Audit */}
          {debug?.alignment && (
            <div style={{ background: "#1e293b", borderRadius: 8, padding: "0.65rem 0.9rem" }}>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                Creator Relevance Audit
              </p>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <DiagStat label="Accepted Claims" value={debug.alignment.accepted_claims} />
                <DiagStat label="Avg Alignment"   value={`${Math.round(debug.alignment.average_alignment * 100)}%`}
                  accent={debug.alignment.average_alignment >= 0.60 ? "#10b981" : debug.alignment.average_alignment >= 0.35 ? "#d97706" : "#ef4444"} />
                <DiagStat label="High Alignment"  value={debug.alignment.high_alignment_claims} accent="#10b981" />
                <DiagStat label="Off-Question"    value={debug.off_question_claims?.length ?? 0}
                  accent={(debug.off_question_claims?.length ?? 0) > 0 ? "#f97316" : "#64748b"} />
              </div>
              {debug.alignment.average_alignment < 0.40 && (
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.62rem", color: "#f97316", lineHeight: 1.5 }}>
                  Most accepted creator claims do not directly answer the query (avg {Math.round(debug.alignment.average_alignment * 100)}% aligned). Consider adjusting the query or reviewing corpus coverage.
                </p>
              )}
            </div>
          )}

          {/* Top query-relevant claims */}
          {debug?.top_answering_claims && debug.top_answering_claims.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                Top Query-Relevant Claims
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {debug.top_answering_claims.map((c, i) => {
                  const pct = Math.round(c.alignment * 100);
                  const col = pct >= 60 ? "#10b981" : pct >= 30 ? "#d97706" : "#ef4444";
                  return (
                    <div key={i} style={{ background: "#1e293b", borderRadius: 6, padding: "0.4rem 0.65rem", display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "0.65rem", fontWeight: 800, color: col, flexShrink: 0, minWidth: "2.8rem" }}>
                        {pct}%
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#cbd5e1", display: "block" }}>{c.creator}</span>
                        <span style={{ fontSize: "0.59rem", color: "#64748b", fontStyle: "italic", lineHeight: 1.4, display: "block" }}>
                          "{c.quote.length > 140 ? c.quote.slice(0, 140) + "…" : c.quote}"
                        </span>
                        <span style={{ fontSize: "0.5rem", color: "#334155" }}>theme: {c.theme}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Off-question claims */}
          {debug?.off_question_claims && debug.off_question_claims.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                Off-Question Claims ({debug.off_question_claims.length}) — accepted but low alignment
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {debug.off_question_claims.slice(0, 6).map((c, i) => (
                  <div key={i} style={{ background: "#0f172a", borderRadius: 5, padding: "0.35rem 0.6rem", display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#ef4444", flexShrink: 0, minWidth: "2.2rem" }}>
                      {Math.round(c.alignment * 100)}%
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: "0.6rem", fontWeight: 600, color: "#64748b", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.creator} — {c.quote.length > 90 ? c.quote.slice(0, 90) + "…" : c.quote}
                      </span>
                      <span style={{ fontSize: "0.5rem", color: "#334155" }}>theme: {c.theme}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Retrieval funnel */}
          {debug?.retrieval_funnel && <FunnelViz funnel={debug.retrieval_funnel} />}

          {/* Rejection breakdown */}
          {debug?.rejection_breakdown && Object.keys(debug.rejection_breakdown).length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                Top Rejection Reasons
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {Object.entries(debug.rejection_breakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([reason, count]) => (
                    <div key={reason} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f97316", flexShrink: 0 }} />
                      <span style={{ fontSize: "0.62rem", color: "#94a3b8", flex: 1 }}>{REJECTION_LABEL[reason] ?? reason}</span>
                      <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#e2e8f0", fontFamily: "monospace" }}>{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Missed evidence */}
          {debug?.missed_evidence && debug.missed_evidence.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                Missed Evidence (top by keyword score)
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {debug.missed_evidence.map((m, i) => (
                  <div key={i} style={{ background: "#1e293b", borderRadius: 6, padding: "0.4rem 0.6rem", display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
                    <span style={{ fontSize: "0.55rem", color: "#475569", fontFamily: "monospace", flexShrink: 0 }}>#{m.retrieval_rank + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "#cbd5e1", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.creator}</span>
                      <span style={{ fontSize: "0.57rem", color: "#475569", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.video || "—"}</span>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#94a3b8", display: "block" }}>score {m.keyword_score}</span>
                      <span style={{ fontSize: "0.55rem", color: "#f97316" }}>{REJECTION_LABEL[m.reason_not_selected] ?? m.reason_not_selected}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence lost per stage */}
          {debug?.evidence_lost_at_stage && (
            <div>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                Evidence Lost Per Stage
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                {Object.entries(debug.evidence_lost_at_stage)
                  .filter(([, n]) => n > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([stage, n]) => (
                    <div key={stage} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: "0.52rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>{stage}</span>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#f97316" }}>{n}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Retrieval trace (collapsible) */}
          {debug?.retrieval_trace && debug.retrieval_trace.length > 0 && (
            <div>
              <button type="button" onClick={() => setTraceOpen(o => !o)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem" }}>
                <span style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                  Retrieval Trace ({debug.retrieval_trace.length} segments)
                </span>
                <span style={{ fontSize: "0.55rem", color: "#334155" }}>{traceOpen ? "▲" : "▼"}</span>
              </button>
              {traceOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", maxHeight: 300, overflowY: "auto" }}>
                  {debug.retrieval_trace.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.25rem 0.4rem", borderRadius: 4, background: t.accepted ? "#052e1640" : "#1e293b" }}>
                      <span style={{ fontSize: "0.52rem", color: "#334155", fontFamily: "monospace", flexShrink: 0, minWidth: "1.6rem" }}>#{t.retrieval_rank + 1}</span>
                      <span style={{ fontSize: "0.58rem", fontWeight: 600, color: t.accepted ? "#34d399" : "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.creator}</span>
                      <span style={{ fontSize: "0.55rem", color: "#475569", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.video}</span>
                      <span style={{ fontSize: "0.55rem", color: "#64748b", fontFamily: "monospace", flexShrink: 0 }}>{t.keyword_score}</span>
                      {t.accepted
                        ? <span style={{ fontSize: "0.52rem", fontWeight: 700, color: "#10b981", flexShrink: 0 }}>✓</span>
                        : <span style={{ fontSize: "0.52rem", color: "#f97316", flexShrink: 0 }}>{REJECTION_LABEL[t.rejection_reason ?? ""] ?? t.rejection_reason}</span>
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function SourceBreakdown({ memo }: { memo: IntelligenceMemo }) {
  const perspective = memo.source_perspective;
  const crossSynth  = memo.cross_source_synthesis;

  // Permanent sections — Creator → Community → Web — always rendered
  const SOURCES = ["youtube", "reddit", "web"] as const;

  const FALLBACK: Record<"youtube" | "reddit" | "web", { body: string; footer: string }> = {
    youtube: { body: "Coverage unavailable for this query.", footer: "No strong creator signal detected." },
    reddit:  { body: "Coverage unavailable for this query.", footer: "No strong community signal detected." },
    web:     { body: "Coverage unavailable for this query.", footer: "No strong web signal detected." },
  };

  const hasPerspective = (src: "youtube" | "reddit" | "web") =>
    (perspective?.[src]?.bullets?.length ?? 0) > 0;

  const activeCrossSrcs = crossSynth
    ? SOURCES.filter(s => hasPerspective(s) && crossSynth[s] !== null)
    : [];

  // Creator Intelligence uses evidence cards when available; Community and Web use bullets
  const hasCreatorEvidence = (memo.creator_intelligence?.claims?.length ?? 0) > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {SOURCES.map(src => {
        const p    = perspective?.[src];
        const disp = SRC_DISPLAY[src];
        const has  = hasPerspective(src);
        const fb   = FALLBACK[src];

        // Creator Intelligence — render evidence cards when available
        if (src === "youtube") {
          return (
            <div key={src} style={{ background: "white", border: "1px solid #e2e8f0", borderLeft: `3px solid ${disp.accent}`, borderRadius: 10, padding: "0.85rem 1rem" }}>
              <div style={{ marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.68rem", fontWeight: 800, color: disp.accent }}>{disp.icon} {disp.label}</span>
              </div>
              {hasCreatorEvidence ? (
                <CreatorEvidenceSection memo={memo} />
              ) : has ? (
                /* Fallback to synthesized bullets when no evidence cards */
                <>
                  <p style={{ margin: "0 0 0.6rem", fontSize: "0.67rem", fontStyle: "italic", color: "#64748b", lineHeight: 1.4 }}>
                    {SRC_QUESTION[src]}
                  </p>
                  <div style={{ marginBottom: "0.35rem" }}>
                    <p style={{ margin: "0 0 0.3rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: p!.weak_signal ? "#d97706" : "#94a3b8" }}>
                      {p!.weak_signal ? "Observed operator themes" : SRC_BULLETS_LABEL[src]}
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                      {p!.bullets.map((bullet, i) => (
                        <li key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                          <span style={{ color: p!.weak_signal ? "#d97706" : disp.accent, fontSize: "0.65rem", paddingTop: 1, flexShrink: 0 }}>•</span>
                          <span style={{ fontSize: "0.72rem", color: "#374151", lineHeight: 1.5 }}>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {p!.weak_signal && (
                    <p style={{ margin: "0.4rem 0 0", fontSize: "0.62rem", fontWeight: 700, color: "#d97706" }}>Signal Strength: Weak</p>
                  )}
                </>
              ) : (
                <div>
                  <p style={{ margin: "0 0 0.2rem", fontSize: "0.72rem", color: "#94a3b8", lineHeight: 1.55 }}>{fb.body}</p>
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.65rem", color: "#cbd5e1" }}>{fb.footer}</p>
                  <p style={{ margin: 0, fontSize: "0.62rem", fontWeight: 700, color: "#cbd5e1" }}>Signal Strength: None</p>
                  {memo.creator_intelligence?.outcome && (
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.58rem", color: "#94a3b8" }}>
                      Outcome: {CREATOR_OUTCOME_LABEL[memo.creator_intelligence.outcome] ?? memo.creator_intelligence.outcome}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        }

        // Community + Web — existing bullet rendering
        return (
          <div key={src} style={{ background: "white", border: "1px solid #e2e8f0", borderLeft: `3px solid ${disp.accent}`, borderRadius: 10, padding: "0.85rem 1rem" }}>

            {/* Source label */}
            <div style={{ marginBottom: "0.3rem" }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 800, color: disp.accent }}>{disp.icon} {disp.label}</span>
            </div>

            {/* Perspective question */}
            <p style={{ margin: "0 0 0.6rem", fontSize: "0.67rem", fontStyle: "italic", color: "#64748b", lineHeight: 1.4 }}>
              {SRC_QUESTION[src]}
            </p>

            {has ? (
              <>
                <div style={{ marginBottom: "0.6rem" }}>
                  <p style={{ margin: "0 0 0.3rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: p!.weak_signal ? "#d97706" : "#94a3b8" }}>
                    {p!.weak_signal
                      ? `Observed ${src === "reddit" ? "practitioner" : "web"} themes`
                      : SRC_BULLETS_LABEL[src]}
                  </p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {p!.bullets.map((bullet, i) => (
                      <li key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                        <span style={{ color: p!.weak_signal ? "#d97706" : disp.accent, fontSize: "0.65rem", paddingTop: 1, flexShrink: 0 }}>•</span>
                        <span style={{ fontSize: "0.72rem", color: "#374151", lineHeight: 1.5 }}>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {!p!.weak_signal && p!.common_view && (
                  <div style={{ paddingTop: "0.5rem", borderTop: "1px solid #f1f5f9" }}>
                    <p style={{ margin: "0 0 0.2rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>
                      {SRC_VIEW_LABEL[src]}
                    </p>
                    <p style={{ margin: 0, fontSize: "0.72rem", color: "#374151", lineHeight: 1.55 }}>{p!.common_view}</p>
                  </div>
                )}

                {p!.weak_signal && (
                  <p style={{ margin: "0.4rem 0 0", fontSize: "0.62rem", fontWeight: 700, color: "#d97706" }}>
                    Signal Strength: Weak
                  </p>
                )}
              </>
            ) : (
              <div>
                <p style={{ margin: "0 0 0.2rem", fontSize: "0.72rem", color: "#94a3b8", lineHeight: 1.55 }}>{fb.body}</p>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.65rem", color: "#cbd5e1" }}>{fb.footer}</p>
                <p style={{ margin: 0, fontSize: "0.62rem", fontWeight: 700, color: "#cbd5e1" }}>Signal Strength: None</p>
              </div>
            )}
          </div>
        );
      })}

      {/* Cross-Source Synthesis — only when 2+ active perspectives */}
      {activeCrossSrcs.length >= 2 && crossSynth && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1rem" }}>
          <p style={{ margin: "0 0 0.6rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
            Cross-Source Synthesis
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {SOURCES.map(src => {
              const syn = crossSynth[src];
              if (!syn || !hasPerspective(src)) return null;
              const disp = SRC_DISPLAY[src];
              return (
                <div key={src} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, color: disp.accent, flexShrink: 0, paddingTop: 3, whiteSpace: "nowrap" }}>
                    {SRC_SYNTH_LABEL[src]}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#374151", lineHeight: 1.5 }}>{syn}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cross-source consensus ────────────────────────────────────────────────────

const CS_SRC_META = {
  creator:   { icon: "▶", color: "#ef4444", bg: "#fee2e2", border: "#fca5a5" },
  community: { icon: "▲", color: "#10b981", bg: "#f0fdf4", border: "#86efac" },
  web:       { icon: "⬡", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
} as const;

const CS_AGREE_META = {
  High:   { bg: "#dcfce7", color: "#14532d", border: "#86efac" },
  Medium: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
  Low:    { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" },
} as const;

function CrossSourceConsensusSection({ items }: { items: IntelligenceMemo["cross_source_consensus"] }) {
  if (!items?.length) return null;
  const ALL_SRC = ["creator", "community", "web"] as const;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Cross-Source Consensus ({items.length})
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {items.map((item, i) => {
          const scoreColor = item.confidence_score >= 75 ? "#10b981" : item.confidence_score >= 55 ? "#d97706" : "#ef4444";
          const agreeMeta  = CS_AGREE_META[item.agreement];
          return (
            <div key={i} style={{ background: "white", border: "1px solid #e2e8f0", borderTop: `3px solid #8b5cf6`, borderRadius: 10, padding: "0.85rem 1rem" }}>

              {/* Insight */}
              <p style={{ margin: "0 0 0.6rem", fontSize: "0.8rem", fontWeight: 500, color: "#0f172a", lineHeight: 1.55 }}>
                {item.insight}
              </p>

              {/* Source badges */}
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                {ALL_SRC.map(src => {
                  const meta   = CS_SRC_META[src];
                  const detail = item.source_detail[src];
                  const active = !!detail;
                  return (
                    <span key={src} style={{
                      fontSize: "0.6rem", fontWeight: 700, padding: "2px 9px", borderRadius: 20,
                      background: active ? meta.bg : "#f8fafc",
                      color: active ? meta.color : "#cbd5e1",
                      border: `1px solid ${active ? meta.border : "#e2e8f0"}`,
                    }}>
                      {meta.icon} {src.charAt(0).toUpperCase() + src.slice(1)}{active ? ` ✓ (${detail.evidence_count})` : " —"}
                    </span>
                  );
                })}
              </div>

              {/* Confidence + agreement */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.62rem", fontWeight: 800, color: scoreColor }}>
                  Confidence: {item.confidence_score} / 100
                </span>
                <span style={{ fontSize: "0.57rem", fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: agreeMeta.bg, color: agreeMeta.color, border: `1px solid ${agreeMeta.border}` }}>
                  {item.agreement} Agreement
                </span>
                <span style={{ fontSize: "0.57rem", color: "#94a3b8", marginLeft: "auto" }}>
                  {item.source_count} source{item.source_count !== 1 ? "s" : ""} converging
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Highest confidence evidence (with source attribution) ─────────────────────

function AttributedEvidence({ evidence }: { evidence: IntelligenceMemo["attributed_evidence"] }) {
  if (!evidence?.length) return null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Highest Confidence Evidence
      </h2>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.9rem 1.1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {evidence.map((e, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2rem 1fr", gap: "0.5rem", alignItems: "start" }}>
              <span style={{ fontSize: "0.62rem", fontWeight: 900, color: "#94a3b8", paddingTop: 2 }}>{i + 1}.</span>
              <div>
                <p style={{ margin: "0 0 0.3rem", fontSize: "0.78rem", color: "#0f172a", lineHeight: 1.6, fontWeight: 500 }}>{e.claim}</p>
                {e.sources.length > 0 && (
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.2rem" }}>
                    {e.sources.map(s => {
                      const disp = SRC_DISPLAY[s.source];
                      const countLabel = s.source === "reddit"
                        ? `${s.signal_count} discussion${s.signal_count !== 1 ? "s" : ""}`
                        : s.source === "youtube"
                        ? `${s.signal_count} creator signal${s.signal_count !== 1 ? "s" : ""}`
                        : `${s.signal_count} web source${s.signal_count !== 1 ? "s" : ""}`;
                      return (
                        <span key={s.source} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.58rem", fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: disp.dimBg, color: disp.accent, border: `1px solid ${disp.dimBorder}` }}>
                          {disp.icon} {disp.label} · {countLabel}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Perspective Compression Audit ────────────────────────────────────────────

function PerspectiveCompressionAudit({ memo }: { memo: IntelligenceMemo }) {
  const raw = memo.perspective_raw;
  const persp = memo.source_perspective;
  if (!raw) return null;

  const SRCS = [
    { key: "youtube" as const, label: "Creator" },
    { key: "reddit"  as const, label: "Community" },
    { key: "web"     as const, label: "Web" },
  ];

  function tokenize(text: string): Set<string> {
    const STOP = new Set(["a","an","the","and","or","but","in","on","at","to","for","of","with","is","are","was","were","be","been","being","have","has","had","do","does","did","this","that","it","its","by","from","as","they","their","we","our","you","your","I","my","not","more","less","than","so","can","will","may","should","would","could","get","got","how","what","when","where","who","which","if","then","than"]);
    return new Set(text.toLowerCase().split(/\W+/).filter(t => t.length > 3 && !STOP.has(t)));
  }

  return (
    <div style={{ background: "#0f172a", borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <p style={{ margin: 0, fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569" }}>
        Perspective Compression Audit
      </p>
      {SRCS.map(({ key, label }) => {
        const rawThemes = raw[key] ?? [];
        const bullets = persp?.[key]?.bullets ?? [];
        if (rawThemes.length === 0 && bullets.length === 0) return null;

        // Count how many raw theme words survive into the generated bullets
        const rawTokens = new Set([...rawThemes.flatMap(t => [...tokenize(t)])]);
        const bulletTokens = new Set([...bullets.flatMap(b => [...tokenize(b)])]);
        const preserved = [...rawTokens].filter(t => bulletTokens.has(t)).length;
        const ratio = rawTokens.size > 0 ? Math.round((preserved / rawTokens.size) * 100) : 100;
        const flagged = ratio < 50 && rawThemes.length >= 3;

        return (
          <div key={key}>
            <p style={{ margin: "0 0 0.4rem", fontSize: "0.6rem", fontWeight: 700, color: flagged ? "#f97316" : "#64748b" }}>
              {label} {flagged ? "⚠ LOW PRESERVATION" : ""} — {rawThemes.length} raw themes → {bullets.length} bullets | vocab preserved: {ratio}%
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <div>
                <p style={{ margin: "0 0 0.2rem", fontSize: "0.55rem", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Raw Themes (input to LLM)</p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                  {rawThemes.map((t, i) => (
                    <li key={i} style={{ fontSize: "0.6rem", color: "#94a3b8", lineHeight: 1.4 }}>· {t.length > 100 ? t.slice(0, 100) + "…" : t}</li>
                  ))}
                  {rawThemes.length === 0 && <li style={{ fontSize: "0.6rem", color: "#475569" }}>— none —</li>}
                </ul>
              </div>
              <div>
                <p style={{ margin: "0 0 0.2rem", fontSize: "0.55rem", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Generated Perspective</p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                  {bullets.map((b, i) => (
                    <li key={i} style={{ fontSize: "0.6rem", color: flagged ? "#fb923c" : "#10b981", lineHeight: 1.4 }}>· {b}</li>
                  ))}
                  {bullets.length === 0 && <li style={{ fontSize: "0.6rem", color: "#475569" }}>— not generated —</li>}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Evidence Timeline ─────────────────────────────────────────────────────────

function EvidenceTimeline({ memo }: { memo: IntelligenceMemo }) {
  const ci = memo.creator_intelligence;
  const redditBullets = memo.source_perspective?.reddit?.bullets ?? [];
  const webBullets    = memo.source_perspective?.web?.bullets ?? [];

  const stages = [
    {
      icon: "▶", label: "Creator Intelligence", color: "#ef4444", bg: "#fee2e2", border: "#fca5a5",
      active: (ci?.claims?.length ?? 0) > 0,
      description: ci && (ci.claims?.length ?? 0) > 0
        ? `${ci.coverage.unique_creators ?? ci.claims.length} creator${(ci.coverage.unique_creators ?? ci.claims.length) !== 1 ? "s" : ""} contributed ${ci.coverage.accepted} evidence segment${ci.coverage.accepted !== 1 ? "s" : ""}, forming ${ci.claims.length} belief cluster${ci.claims.length !== 1 ? "s" : ""}.`
        : "No direct creator content found for this topic.",
    },
    {
      icon: "▲", label: "Community Intelligence", color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0",
      active: redditBullets.length > 0,
      description: redditBullets.length > 0
        ? `${redditBullets.length} practitioner observation${redditBullets.length !== 1 ? "s" : ""} surfaced from community discussions.`
        : "No community practitioner data found.",
    },
    {
      icon: "⬡", label: "Web Intelligence", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe",
      active: webBullets.length > 0,
      description: webBullets.length > 0
        ? `${webBullets.length} consensus recommendation${webBullets.length !== 1 ? "s" : ""} synthesized from web sources.`
        : "No web consensus found.",
    },
    {
      icon: "◈", label: "Final Recommendation", color: "#6366f1", bg: "#f5f3ff", border: "#c4b5fd",
      active: true,
      description: (() => {
        const s = memo.confidence_score;
        const rel = memo.consensus.relationship_type;
        const strength = s >= 80 ? "Strong" : s >= 55 ? "Moderate" : "Limited";
        return `${strength} confidence (${s}/100). Relationship: ${rel}. ${memo.consensus.relationship_reason}`;
      })(),
    },
  ];

  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Evidence Timeline
      </h2>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {stages.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              {/* Dot + connector line */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: s.active ? s.bg : "#f8fafc", border: `2px solid ${s.active ? s.border : "#e2e8f0"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.62rem", color: s.active ? s.color : "#94a3b8" }}>{s.icon}</span>
                </div>
                {i < stages.length - 1 && (
                  <div style={{ width: 2, flex: 1, minHeight: 20, background: s.active ? `${s.color}30` : "#f1f5f9", margin: "3px 0" }} />
                )}
              </div>
              {/* Content */}
              <div style={{ flex: 1, paddingBottom: i < stages.length - 1 ? "0.9rem" : 0, paddingTop: "0.2rem" }}>
                <p style={{ margin: "0 0 0.15rem", fontSize: "0.65rem", fontWeight: 700, color: s.active ? s.color : "#94a3b8" }}>
                  {s.label}
                  {!s.active && <span style={{ marginLeft: "0.4rem", fontWeight: 400, color: "#cbd5e1" }}>— No signal</span>}
                </p>
                <p style={{ margin: 0, fontSize: "0.68rem", color: "#475569", lineHeight: 1.55 }}>{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Evidence waterfall ────────────────────────────────────────────────────────

function EvidenceWaterfall({ memo }: { memo: IntelligenceMemo }) {
  const wf = memo.evidence_waterfall;
  if (!wf) return null;

  const srcRow = (label: string, counts: { youtube: number; reddit: number; web: number }) => {
    const items = [
      { src: "youtube" as const, n: counts.youtube },
      { src: "reddit"  as const, n: counts.reddit  },
      { src: "web"     as const, n: counts.web     },
    ].filter(x => x.n > 0);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", width: 80, flexShrink: 0 }}>{label}</span>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          {items.map(({ src, n }) => {
            const d = SRC_DISPLAY[src];
            return (
              <span key={src} style={{ fontSize: "0.6rem", fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: d.dimBg, color: d.accent, border: `1px solid ${d.dimBorder}` }}>
                {d.icon} {n}
              </span>
            );
          })}
          {items.length === 0 && <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>—</span>}
        </div>
      </div>
    );
  };

  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Evidence Waterfall
      </h2>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {srcRow("Retrieved", wf.retrieved)}
        <div style={{ paddingLeft: 80, fontSize: "0.75rem", color: "#cbd5e1" }}>↓</div>
        {srcRow("Accepted", wf.accepted)}
        <div style={{ paddingLeft: 80, fontSize: "0.75rem", color: "#cbd5e1" }}>↓</div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", width: 80 }}>Normalized</span>
          <span style={{ fontSize: "0.65rem", fontWeight: 800, color: "#0f172a" }}>{wf.normalized} claims</span>
        </div>
        <div style={{ paddingLeft: 80, fontSize: "0.75rem", color: "#cbd5e1" }}>↓</div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", width: 80 }}>Synthesized</span>
          <span style={{ fontSize: "0.65rem", fontWeight: 800, color: "#0f172a" }}>{wf.synthesized} insight cluster{wf.synthesized !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ paddingLeft: 80, fontSize: "0.75rem", color: "#cbd5e1" }}>↓</div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6366f1", width: 80 }}>Decision</span>
          <span style={{ fontSize: "0.65rem", color: "#6366f1", fontWeight: 700 }}>←</span>
        </div>
      </div>
    </section>
  );
}

// ── Evidence themes (insight clusters) ───────────────────────────────────────

const CLUSTER_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

const CONFIDENCE_META = {
  High:   { bg: "#dcfce7", color: "#15803d" },
  Medium: { bg: "#fef3c7", color: "#b45309" },
  Low:    { bg: "#f1f5f9", color: "#64748b" },
};

function InsightClusters({ clusters }: { clusters: IntelligenceMemo["insight_clusters"] }) {
  if (!clusters.length) return null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Reasoning
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
        {clusters.map((c, ci) => {
          const accent  = CLUSTER_COLORS[ci % CLUSTER_COLORS.length];
          const confMeta = CONFIDENCE_META[c.confidence];
          return (
            <div key={ci} style={{ background: "white", border: "1px solid #e2e8f0", borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: "0.85rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.35rem" }}>
                <p style={{ margin: 0, fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: accent, lineHeight: 1.3 }}>
                  {c.theme}
                </p>
                <span style={{ flexShrink: 0, fontSize: "0.53rem", fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: confMeta.bg, color: confMeta.color }}>
                  {c.confidence}
                </span>
              </div>
              <p style={{ margin: "0 0 0.45rem", fontSize: "0.6rem", color: "#94a3b8" }}>
                {c.signal_count} signal{c.signal_count !== 1 ? "s" : ""}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {c.key_themes.map((t, i) => (
                  <li key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                    <span style={{ color: accent, fontSize: "0.7rem", paddingTop: 1, flexShrink: 0 }}>•</span>
                    <span style={{ fontSize: "0.73rem", color: "#374151", lineHeight: 1.5 }}>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Priority actions (with evidence strength per action) ──────────────────────

const STRENGTH_META = {
  High:   { bg: "#dcfce7", color: "#15803d", bar: "#22c55e" },
  Medium: { bg: "#fef3c7", color: "#b45309", bar: "#f59e0b" },
  Low:    { bg: "#f1f5f9", color: "#64748b", bar: "#94a3b8" },
};

function PriorityActions({ actions }: { actions: IntelligenceMemo["decision_recommendation"]["priority_actions"] }) {
  if (!actions.length) return null;
  return (
    <section style={{ background: "#0f172a", borderRadius: 10, padding: "1rem 1.25rem" }}>
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569" }}>
        Priority Actions
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {actions.map((a, i) => {
          const sm = STRENGTH_META[a.evidence_strength] ?? STRENGTH_META.Medium;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: "0.7rem", alignItems: "start" }}>
              {/* Number */}
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "0.65rem", fontWeight: 900, color: "#a78bfa" }}>{i + 1}</span>
              </div>
              {/* Action text */}
              <p style={{ margin: 0, fontSize: "0.79rem", color: "#f1f5f9", lineHeight: 1.65 }}>{a.action}</p>
              {/* Evidence strength */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem", minWidth: 90, paddingTop: 2 }}>
                <span style={{ fontSize: "0.55rem", fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: sm.bg, color: sm.color }}>
                  {a.evidence_strength}
                </span>
                <span style={{ fontSize: "0.55rem", color: "#475569" }}>{a.supporting_signals} signal{a.supporting_signals !== 1 ? "s" : ""}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Consensus section ─────────────────────────────────────────────────────────

function ConsensusSection({
  consensus,
  tradeoffs,
  contradictions,
  consensusQuality,
}: {
  consensus: IntelligenceMemo["consensus"];
  tradeoffs: IntelligenceMemo["tradeoffs"];
  contradictions: IntelligenceMemo["contradictions"];
  consensusQuality?: IntelligenceMemo["consensus_quality"];
}) {
  const score = consensus.agreement_score;
  const agreeColor = score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const canonicalLabel = consensusQuality
    ? (CONSENSUS_QUALITY_STYLE[consensusQuality]?.label ?? agreeLabel(score))
    : agreeLabel(score);

  const hasContent = consensus.shared_insights.length > 0 || (tradeoffs?.length ?? 0) > 0 || contradictions.length > 0;
  if (!hasContent) return null;

  return (
    <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1.1rem" }}>

      {/* Header row: label + agreement bar + counts */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.65rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
          Agreement
        </h2>

        {/* Agreement bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <div style={{ width: 80, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${score}%`, height: "100%", background: agreeColor, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: "0.65rem", fontWeight: 800, color: agreeColor }}>{score}%</span>
          <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>— {canonicalLabel}</span>
        </div>

        {/* Tradeoff + contradiction counts */}
        <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto", flexWrap: "wrap" }}>
          {(tradeoffs?.length ?? 0) > 0 && (
            <span style={{ fontSize: "0.57rem", fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
              {tradeoffs!.length} tradeoff{tradeoffs!.length !== 1 ? "s" : ""}
            </span>
          )}
          {contradictions.length > 0 ? (
            <span style={{ fontSize: "0.57rem", fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}>
              {contradictions.length} contradiction{contradictions.length !== 1 ? "s" : ""}
            </span>
          ) : (
            <span style={{ fontSize: "0.57rem", fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>
              0 contradictions
            </span>
          )}
        </div>
      </div>

      {/* Shared insights */}
      {consensus.shared_insights.length > 0 && (
        <div style={{ marginBottom: consensus.disagreements.length > 0 ? "0.65rem" : 0 }}>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#10b981" }}>Sources agree</p>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {consensus.shared_insights.map((s, i) => (
              <li key={i} style={{ fontSize: "0.74rem", color: "#374151", marginBottom: "0.2rem", lineHeight: 1.5 }}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Direct contradictions (only hard ones — tradeoffs rendered in TradeoffsSection) */}
      {consensus.disagreements.length > 0 && (
        <div>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#f59e0b" }}>Direct disputes</p>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {consensus.disagreements.map((d, i) => (
              <li key={i} style={{ fontSize: "0.74rem", color: "#374151", marginBottom: "0.2rem", lineHeight: 1.5 }}>{d}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── Contradictions ────────────────────────────────────────────────────────────

const CONFLICT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  direct:     { bg: "#fee2e2", color: "#991b1b", label: "Direct conflict" },
  partial:    { bg: "#fff7ed", color: "#c2410c", label: "Partial conflict" },
  contextual: { bg: "#eff6ff", color: "#1d4ed8", label: "Context-dependent" },
  tradeoff:   { bg: "#f1f5f9", color: "#475569", label: "Tradeoff" },
};

function Contradictions({ items }: { items: IntelligenceMemo["contradictions"] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Contradictions ({items.length})
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {items.map((c, i) => {
          const style = CONFLICT_STYLE[c.conflict_type ?? "direct"];
          return (
            <div key={i} style={{ background: "white", border: "1px solid #fde68a", borderRadius: 10, padding: "0.85rem 1rem" }}>
              <span style={{ fontSize: "0.55rem", fontWeight: 800, padding: "1px 7px", borderRadius: 20, background: style.bg, color: style.color }}>
                {style.label}
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", margin: "0.5rem 0 0.65rem" }}>
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "0.55rem 0.7rem" }}>
                  <p style={{ margin: "0 0 0.1rem", fontSize: "0.57rem", fontWeight: 800, textTransform: "uppercase", color: "#166534" }}>Claim A</p>
                  <p style={{ margin: 0, fontSize: "0.74rem", color: "#166534", lineHeight: 1.45 }}>{c.claim_a}</p>
                </div>
                <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.55rem 0.7rem" }}>
                  <p style={{ margin: "0 0 0.1rem", fontSize: "0.57rem", fontWeight: 800, textTransform: "uppercase", color: "#991b1b" }}>Claim B</p>
                  <p style={{ margin: 0, fontSize: "0.74rem", color: "#991b1b", lineHeight: 1.45 }}>{c.claim_b}</p>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: "0.72rem", color: "#78350f", lineHeight: 1.5 }}>⚡ {c.why_it_matters}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Tradeoffs ─────────────────────────────────────────────────────────────────

function TradeoffsSection({ items }: { items: IntelligenceMemo["tradeoffs"] }) {
  if (!items?.length) return null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Tradeoffs ({items.length})
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {items.map((t, i) => (
          <div key={i} style={{ background: "white", border: "1px solid #e2e8f0", borderLeft: "3px solid #6366f1", borderRadius: 10, padding: "0.75rem 1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "0.55rem" }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7, padding: "0.5rem 0.65rem" }}>
                <p style={{ margin: "0 0 0.1rem", fontSize: "0.56rem", fontWeight: 800, textTransform: "uppercase", color: "#15803d" }}>Benefit</p>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "#166534", lineHeight: 1.45 }}>{t.claim_a}</p>
              </div>
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 7, padding: "0.5rem 0.65rem" }}>
                <p style={{ margin: "0 0 0.1rem", fontSize: "0.56rem", fontWeight: 800, textTransform: "uppercase", color: "#c2410c" }}>Risk / Cost</p>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "#9a3412", lineHeight: 1.45 }}>{t.claim_b}</p>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "#6366f1", lineHeight: 1.5 }}>⇄ {t.why_it_matters}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Evidence used (compact, replaces raw Source Signals) ──────────────────────

function EvidenceUsed({ memo }: { memo: IntelligenceMemo }) {
  const eu = memo.evidence_used;
  const density = memo.insight_density;
  const ep = memo.evidence_processing;
  if (!eu) return null;
  const acceptanceRate = ep && ep.retrieved > 0
    ? Math.round((ep.quality_accepted / ep.retrieved) * 100)
    : null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Evidence Used
      </h2>
      {ep?.quality_warning && (
        <div style={{ marginBottom: "0.65rem", padding: "0.55rem 0.85rem", background: "#fefce8", border: "1px solid #fde047", borderRadius: 8, fontSize: "0.7rem", color: "#854d0e", lineHeight: 1.5 }}>
          ⚠ {ep.quality_warning}
        </div>
      )}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1.1rem" }}>
        <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", minWidth: 110 }}>
            <span style={{ fontSize: "1.5rem", fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>{eu.total_signals}</span>
            <p style={{ margin: 0, fontSize: "0.6rem", color: "#64748b" }}>accepted signals</p>
            {density && (
              <p style={{ margin: 0, fontSize: "0.6rem", color: "#94a3b8" }}>
                {density.unique_insights} unique insight{density.unique_insights !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          {ep && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.22rem", minWidth: 155 }}>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Processing</p>
              {[
                { label: "Retrieved", value: ep.retrieved, color: "#0f172a" },
                { label: "Relevance passed", value: ep.relevance_passed, color: "#0f172a" },
                { label: "Quality accepted", value: ep.quality_accepted, color: "#0f172a" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", color: "#64748b" }}>
                  <span>{r.label}</span><span style={{ fontWeight: 700, color: r.color }}>{r.value}</span>
                </div>
              ))}
              {acceptanceRate !== null && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", color: "#64748b" }}>
                  <span>Acceptance rate</span>
                  <span style={{ fontWeight: 700, color: acceptanceRate >= 50 ? "#15803d" : acceptanceRate >= 25 ? "#b45309" : "#dc2626" }}>
                    {acceptanceRate}%
                  </span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", color: "#64748b" }}>
                <span>Query type</span>
                <span style={{ fontWeight: 700, color: "#6366f1", textTransform: "capitalize" }}>{ep.query_intent}</span>
              </div>
            </div>
          )}
          {eu.primary_themes.length > 0 && (
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>
                Primary themes
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                {eu.primary_themes.map(t => (
                  <li key={t} style={{ fontSize: "0.7rem", color: "#374151" }}>• {t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Evidence quality panel ────────────────────────────────────────────────────

const QUALITY_SOURCES = [
  { key: "youtube" as const, label: "Creator Intelligence",   icon: "▶", accent: "#ef4444" },
  { key: "reddit"  as const, label: "Community Intelligence", icon: "▲", accent: "#10b981" },
  { key: "web"     as const, label: "Web Intelligence",       icon: "⬡", accent: "#3b82f6" },
] as const;

const LEVEL_META = {
  High:   { bar: "#22c55e", pill: { bg: "#dcfce7", color: "#15803d" } },
  Medium: { bar: "#f59e0b", pill: { bg: "#fef3c7", color: "#b45309" } },
  Low:    { bar: "#ef4444", pill: { bg: "#fee2e2", color: "#dc2626" } },
};

function EvidenceQualityPanel({ scores }: {
  scores: IntelligenceMemo["source_quality_scores"];
}) {
  const activeSources = QUALITY_SOURCES.filter(({ key }) => !scores[key].excluded);
  if (!activeSources.length) return null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Evidence Quality
      </h2>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {QUALITY_SOURCES.filter(({ key }) => !scores[key].excluded).map(({ key, label, icon, accent }) => {
          const q = scores[key];
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontSize: "0.75rem", color: accent, flexShrink: 0, width: 14 }}>{icon}</span>
              <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "#374151", width: 160, flexShrink: 0 }}>
                {label}
              </span>
              <div style={{ flex: 1, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${q.score}%`, height: "100%", background: LEVEL_META[q.level].bar, borderRadius: 2, transition: "width 0.5s ease" }} />
              </div>
              <span style={{ fontSize: "0.58rem", fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: LEVEL_META[q.level].pill.bg, color: LEVEL_META[q.level].pill.color, minWidth: 42, textAlign: "center" }}>
                {q.level}
              </span>
              <span style={{ fontSize: "0.6rem", color: "#94a3b8", width: 22, textAlign: "right" }}>{q.score}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Evidence gaps ─────────────────────────────────────────────────────────────

function EvidenceGaps({ coverage }: { coverage: IntelligenceMemo["coverage"] }) {
  if (!coverage?.missing?.length) return null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Evidence Gaps
      </h2>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: coverage.gap_impact?.length ? "1fr 1fr" : "1fr", gap: "0.75rem" }}>
          <div>
            <p style={{ margin: "0 0 0.3rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#ef4444" }}>
              Unavailable
            </p>
            {coverage.missing.map(s => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.15rem" }}>
                <span style={{ fontSize: "0.65rem", color: "#fca5a5" }}>✗</span>
                <span style={{ fontSize: "0.65rem", color: "#64748b" }}>{s}</span>
              </div>
            ))}
          </div>
          {coverage.gap_impact?.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>
                Confidence would increase with
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                {coverage.gap_impact.map(g => (
                  <li key={g} style={{ fontSize: "0.65rem", color: "#64748b" }}>• {g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Decision Tree — stage-based branching playbook ────────────────────────────

const TREE_NODES = [
  { key: "pre_product"  as const, label: "Pre-Product-Market Fit", sub: "0–10 customers",  color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
  { key: "early_stage"  as const, label: "Early Stage",            sub: "10–100 customers", color: "#b45309", bg: "#fffbeb", border: "#fcd34d" },
  { key: "growth_stage" as const, label: "Growth Stage",           sub: "100+ customers",   color: "#065f46", bg: "#f0fdf4", border: "#6ee7b7" },
] as const;

function DecisionTree({ rec }: { rec: IntelligenceMemo["decision_recommendation"] }) {
  const nodes = TREE_NODES.filter(n => rec.stage_based_actions[n.key].length > 0);
  if (!nodes.length) return null;
  return (
    <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.9rem 1.1rem" }}>
      <h2 style={{ margin: "0 0 0.85rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Stage-Based Decision Tree
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {nodes.map((node, i) => (
          <div key={node.key} style={{ display: "flex", gap: "0.85rem" }}>
            {/* Connector column */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 22, flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: node.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 4 }}>
                <span style={{ fontSize: "0.52rem", color: "white", fontWeight: 900 }}>{i + 1}</span>
              </div>
              {i < nodes.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 20, background: "#e2e8f0", margin: "3px 0" }} />
              )}
            </div>
            {/* Content */}
            <div style={{ flex: 1, paddingBottom: i < nodes.length - 1 ? "1rem" : 0, paddingTop: "0.1rem" }}>
              <div style={{ marginBottom: "0.35rem" }}>
                <span style={{ fontSize: "0.68rem", fontWeight: 800, color: node.color }}>{node.label}</span>
                <span style={{ fontSize: "0.56rem", color: node.color, opacity: 0.65, marginLeft: "0.4rem" }}>{node.sub}</span>
              </div>
              {i < nodes.length - 1 && (
                <div style={{ marginBottom: "0.3rem", padding: "2px 8px", background: node.bg, border: `1px solid ${node.border}`, borderRadius: 6, display: "inline-block" }}>
                  <span style={{ fontSize: "0.56rem", fontWeight: 700, color: node.color }}>→ {nodes[i + 1]?.label}</span>
                </div>
              )}
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.28rem" }}>
                {rec.stage_based_actions[node.key].map((a, j) => (
                  <li key={j} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                    <span style={{ color: node.color, fontSize: "0.65rem", paddingTop: 2, flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: "0.72rem", color: "#374151", lineHeight: 1.5 }}>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Stage-based actions ───────────────────────────────────────────────────────

function StageActions({ rec }: { rec: IntelligenceMemo["decision_recommendation"] }) {
  const stages = [
    { key: "pre_product"  as const, label: "Pre-Product",  sub: "0–10 customers",   color: "#6b21a8", bg: "#f3e8ff", border: "#d8b4fe" },
    { key: "early_stage"  as const, label: "Early Stage",  sub: "10–100 customers",  color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
    { key: "growth_stage" as const, label: "Growth Stage", sub: "100+ customers",    color: "#166534", bg: "#f0fdf4", border: "#86efac" },
  ];
  const hasAny = stages.some(s => rec.stage_based_actions[s.key].length > 0);
  if (!hasAny) return null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Stage-Based Playbook
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
        {stages.map(({ key, label, sub, color, bg, border }) => {
          const actions = rec.stage_based_actions[key];
          if (!actions.length) return null;
          return (
            <div key={key} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "0.85rem 1rem" }}>
              <p style={{ margin: "0 0 0.1rem", fontSize: "0.65rem", fontWeight: 800, color }}>{label}</p>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.57rem", color, opacity: 0.7 }}>{sub}</p>
              <ol style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {actions.map((a, i) => (
                  <li key={i} style={{ fontSize: "0.72rem", color, lineHeight: 1.5 }}>{a}</li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Agent log ─────────────────────────────────────────────────────────────────

type LogEntry = { source?: string; agent?: string; message: string; count?: number };
const SRC_ICON: Record<string, string>  = { youtube: "▶", reddit: "▲", hn: "▲", web: "⬡" };
const SRC_COLOR: Record<string, string> = { youtube: "#ef4444", reddit: "#10b981", hn: "#10b981", web: "#3b82f6" };
const SRC_LABEL: Record<string, string> = { youtube: "creator", reddit: "community", hn: "community", web: "web" };

function AgentLog({ entries, running }: { entries: LogEntry[]; running: boolean }) {
  if (!entries.length && !running) return null;
  return (
    <div style={{ background: "#0f172a", borderRadius: 10, padding: "1rem 1.25rem", minHeight: 64 }}>
      {entries.map((e, i) => {
        const icon  = e.source ? SRC_ICON[e.source] ?? "◆" : "◆";
        const color = e.source ? SRC_COLOR[e.source] ?? "#94a3b8" : "#a78bfa";
        return (
          <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginBottom: i < entries.length - 1 ? "0.3rem" : 0 }}>
            <span style={{ color, fontWeight: 800, fontSize: "0.68rem", flexShrink: 0, paddingTop: 2 }}>{icon}</span>
            <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
              <span style={{ color: "#64748b" }}>{e.source ? (SRC_LABEL[e.source] ?? e.source) : (e.agent ?? "sys")}</span>{" "}
              <span style={{ color: "#e2e8f0" }}>{e.message}</span>
              {e.count != null && <span style={{ color: "#6366f1", fontWeight: 700 }}> ({e.count})</span>}
            </span>
          </div>
        );
      })}
      {running && (
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: entries.length ? "0.45rem" : 0 }}>
          <span className="spinner" style={{ borderTopColor: "#6366f1" }} />
          <span style={{ fontSize: "0.66rem", color: "#64748b" }}>Working…</span>
        </div>
      )}
    </div>
  );
}

// ── Prediction Intelligence card ──────────────────────────────────────────────

const RESOLUTION_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  correct:   { icon: "✓", color: "#16a34a", bg: "#dcfce7", label: "Correct" },
  incorrect: { icon: "✗", color: "#dc2626", bg: "#fee2e2", label: "Incorrect" },
  mixed:     { icon: "◐", color: "#d97706", bg: "#fef3c7", label: "Mixed" },
  pending:   { icon: "○", color: "#64748b", bg: "#f1f5f9", label: "Tracking" },
};

function relevanceScore(pred: PredictionRow, words: string[]): number {
  const corpus = [pred.normalized_statement ?? pred.prediction_text, pred.domain ?? "", pred.topic].join(" ").toLowerCase();
  return words.filter(w => corpus.includes(w)).length;
}

function PredictionIntelligenceCard({ query }: { query: string }) {
  const [preds, setPreds]   = useState<PredictionRow[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [relevant, setRelevant] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRelevant(null);

    fetch("/api/predictions?limit=120")
      .then(r => r.json() as Promise<{ predictions: PredictionRow[]; count: number }>)
      .then(data => {
        if (cancelled) return;
        const all = data.predictions ?? [];
        setTotal(all.length);

        const words = query.toLowerCase().split(/\W+/).filter(w => w.length >= 3);
        const wordCount = words.length;
        const resolved = all.filter(p => ["correct", "incorrect", "mixed"].includes(p.status));
        const pending  = all.filter(p => !["correct", "incorrect", "mixed"].includes(p.status));
        const score    = (p: PredictionRow) => relevanceScore(p, words);

        const topResolved = [...resolved].sort((a, b) => score(b) - score(a)).slice(0, 5);
        const shown = topResolved.length >= 3
          ? topResolved
          : [...topResolved, ...[...pending].sort((a, b) => score(b) - score(a)).slice(0, 3 - topResolved.length)];

        const relevantShown = wordCount > 0
          ? shown.filter(p => score(p) / wordCount >= 0.70)
          : shown;

        setRelevant(relevantShown.length > 0);
        setPreds(relevantShown);
      })
      .catch(() => { if (!cancelled) { setPreds([]); setRelevant(false); } })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [query]);

  if (!loading && relevant === false) return null;

  const resolvedCount = preds.filter(p => ["correct", "incorrect", "mixed"].includes(p.status)).length;

  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Prediction Intelligence
      </h2>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", borderBottom: "1px solid #f1f5f9" }}>
          <span style={{ fontSize: "0.85rem", color: "#6366f1" }}>◈</span>
          <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#0f172a" }}>Prediction Intelligence</span>
          <span style={{ fontSize: "0.6rem", color: "#94a3b8", marginLeft: "auto" }}>
            {loading ? "Loading…" : `${total} tracked · ${resolvedCount} verified`}
          </span>
        </div>
        {loading ? (
          <div style={{ padding: "1.25rem 1rem", fontSize: "0.7rem", color: "#94a3b8" }}>Loading predictions…</div>
        ) : preds.length === 0 ? (
          <div style={{ padding: "1rem" }}>
            <p style={{ margin: 0, fontSize: "0.68rem", color: "#64748b" }}>No predictions tracked for this topic yet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {preds.map((p, i) => {
              const meta = RESOLUTION_META[p.status] ?? RESOLUTION_META.pending;
              const isResolved = ["correct", "incorrect", "mixed"].includes(p.status);
              const text = p.normalized_statement ?? p.prediction_text;
              return (
                <div key={p.prediction_id} style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: "0.75rem", alignItems: "start", padding: "0.75rem 1rem", borderBottom: i < preds.length - 1 ? "1px solid #f8fafc" : "none", background: i % 2 === 0 ? "white" : "#fafcff" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", paddingTop: 1 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", padding: "2px 6px", borderRadius: 4, fontSize: "0.58rem", fontWeight: 800, background: meta.bg, color: meta.color, whiteSpace: "nowrap" }}>
                      {meta.icon} {meta.label}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.73rem", color: isResolved ? "#0f172a" : "#374151", lineHeight: 1.5, fontWeight: isResolved ? 500 : 400 }}>
                    "{text.length > 120 ? text.slice(0, 120) + "…" : text}"
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem", minWidth: 100 }}>
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#0f172a", textAlign: "right" }}>
                      {p.creator.split(" ").slice(0, 2).join(" ")}
                    </span>
                    {p.domain && (
                      <span style={{ fontSize: "0.57rem", padding: "1px 5px", borderRadius: 3, background: "#eff6ff", color: "#1d4ed8", fontWeight: 700 }}>{p.domain}</span>
                    )}
                    {p.time_horizon?.timeframe_text && (
                      <span style={{ fontSize: "0.57rem", color: "#94a3b8" }}>{p.time_horizon.timeframe_text}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && total > 0 && (
          <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid #f1f5f9" }}>
            <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>
              {resolvedCount > 0
                ? `${resolvedCount} prediction${resolvedCount !== 1 ? "s" : ""} verified · ${total - resolvedCount} pending`
                : `${total} prediction${total !== 1 ? "s" : ""} being tracked — none resolved yet`}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Decision Flow Section ─────────────────────────────────────────────────────

function DecisionFlowSection({ cv }: { cv: NonNullable<IntelligenceMemo["comparative_verdict"]> }) {
  const flow = cv.decision_flow;
  if (!flow || flow.length === 0) return null;

  return (
    <section style={{ background: "#0a0f1a", borderRadius: 14, overflow: "hidden", border: "1px solid #1e293b" }}>
      <div style={{ padding: "0.8rem 1.25rem", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#475569" }}>Decision Flow</span>
        <span style={{ fontSize: "0.52rem", color: "#334155", marginLeft: "auto" }}>answer each question to reach your own conclusion</span>
      </div>

      <div style={{ padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {flow.map((node, i) => {
          const isTerminal = i === flow.length - 1;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {/* Connector */}
              {i > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.1rem" }}>
                  <div style={{ width: 1, height: 14, background: "#1e293b", marginLeft: 12 }} />
                </div>
              )}

              {isTerminal ? (
                /* Terminal conclusion node */
                <div style={{ border: "1px solid #334155", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "0.5rem 0.9rem", background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
                    <p style={{ margin: 0, fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6366f1" }}>
                      {node.question}
                    </p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                    <div style={{ padding: "0.7rem 0.9rem", background: "#0d1f0d", borderRight: "1px solid #1e293b" }}>
                      <p style={{ margin: "0 0 0.2rem", fontSize: "0.5rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4ade80" }}>Primary Path</p>
                      <p style={{ margin: 0, fontSize: "0.68rem", color: "#86efac", lineHeight: 1.5, fontWeight: 600 }}>{node.yes_action}</p>
                    </div>
                    <div style={{ padding: "0.7rem 0.9rem", background: "#0f172a" }}>
                      <p style={{ margin: "0 0 0.2rem", fontSize: "0.5rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Alternative Path</p>
                      <p style={{ margin: 0, fontSize: "0.68rem", color: "#64748b", lineHeight: 1.5 }}>{node.no_action}</p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Decision question node */
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1e293b", border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      <span style={{ fontSize: "0.55rem", fontWeight: 800, color: "#64748b" }}>{i + 1}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, color: "#f8fafc", lineHeight: 1.4, paddingTop: 2 }}>{node.question}</p>
                  </div>
                  <div style={{ marginLeft: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div style={{ padding: "0.4rem 0.65rem", background: "#052e16", border: "1px solid #166534", borderRadius: 8 }}>
                      <p style={{ margin: "0 0 0.15rem", fontSize: "0.5rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4ade80" }}>Yes →</p>
                      <p style={{ margin: 0, fontSize: "0.65rem", color: "#86efac", lineHeight: 1.45 }}>{node.yes_action}</p>
                    </div>
                    <div style={{ padding: "0.4rem 0.65rem", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8 }}>
                      <p style={{ margin: "0 0 0.15rem", fontSize: "0.5rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#f87171" }}>No →</p>
                      <p style={{ margin: 0, fontSize: "0.65rem", color: "#fca5a5", lineHeight: 1.45 }}>{node.no_action}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Counter-Evidence Section ─────────────────────────────────────────────────

function CounterEvidenceSection({ memo }: { memo: IntelligenceMemo }) {
  const items = memo.counter_evidence;
  if (!items || items.length === 0) return null;

  return (
    <section style={{ background: "white", border: "1px solid #fecdd3", borderRadius: 10, padding: "0.9rem 1.1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.7rem" }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#9f1239" }}>
          Counter-Evidence
        </span>
        <span style={{ fontSize: "0.55rem", color: "#94a3b8", marginLeft: "auto" }}>why the alternative might be the better choice for some founders</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
            <span style={{ fontSize: "0.7rem", color: "#ef4444", flexShrink: 0, paddingTop: 2, fontWeight: 700 }}>↕</span>
            <p style={{ margin: 0, fontSize: "0.72rem", color: "#374151", lineHeight: 1.55 }}>{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Full report ───────────────────────────────────────────────────────────────

function IntelligenceReport({ memo, query, debug }: { memo: IntelligenceMemo; query: string; debug: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* 0a. Intelligence Brief — executive summary card, <20 second comprehension */}
      <IntelligenceBriefCard memo={memo} />

      {/* 0b. Source Agreement Banner — shows per-source ✓/✗ + why they agree/disagree */}
      <SourceAgreementBanner memo={memo} />

      {/* 1. Decision card — comparative verdict for A vs B queries, binary YES/NO otherwise */}
      {memo.query_type === "COMPARATIVE" && memo.comparative_verdict ? (
        <>
          {/* 1a. Strategy profiles — per-option independent evidence (Phase 4) */}
          <StrategyProfileGrid cv={memo.comparative_verdict} />

          {/* 1b. Decision Matrix — winner-per-dimension */}
          <ComparativeVerdictCard memo={memo} />

          {/* 1c. Strategy Roadmap — replaces priority actions for comparative queries */}
          <StrategyRoadmapSection cv={memo.comparative_verdict} />

          {/* 1d. Decision Flow — branching yes/no questions to reach own conclusion */}
          <DecisionFlowSection cv={memo.comparative_verdict} />
        </>
      ) : (
        <DecisionCard memo={memo} />
      )}

      {/* 1.5. Counter-Evidence — specific signals arguing against the recommendation */}
      <CounterEvidenceSection memo={memo} />

      {/* 2. Decision Drivers — Positive / Negative / Uncertainty */}
      <DecisionDriversSection memo={memo} />

      {/* 3. Intelligence Perspectives — Creator / Community / Web */}
      <SourceBreakdown memo={memo} />

      {/* 4. Cross-Source Consensus */}
      <CrossSourceConsensusSection items={memo.cross_source_consensus ?? []} />

      {/* 5. Highest Confidence Evidence (with source attribution) */}
      <AttributedEvidence evidence={memo.attributed_evidence ?? memo.best_evidence_ranking?.map(r => ({ claim: r, sources: [] })) ?? []} />

      {/* 6. Reasoning (Evidence Themes) */}
      <InsightClusters clusters={memo.insight_clusters} />

      {/* 7. Priority Actions — shown for non-comparative; comparative uses StrategyRoadmap above */}
      {memo.query_type !== "COMPARATIVE" && (
        <PriorityActions actions={memo.decision_recommendation.priority_actions} />
      )}

      {/* 8. Confidence Breakdown */}
      <ConfidenceSection memo={memo} />

      {/* 9. Evidence Timeline — reasoning chain audit */}
      <EvidenceTimeline memo={memo} />

      {/* 10. What Would Increase Confidence? */}
      <MissingEvidenceSection items={memo.decision_drivers?.missing_evidence ?? []} />

      {/* 11. Consensus */}
      <ConsensusSection consensus={memo.consensus} tradeoffs={memo.tradeoffs ?? []} contradictions={memo.contradictions} consensusQuality={memo.consensus_quality} />

      {/* 12. Tradeoffs */}
      <TradeoffsSection items={memo.tradeoffs ?? []} />

      {/* 13. Contradictions (hard only) */}
      <Contradictions items={memo.contradictions} />

      {/* 14. Stage-Based Decision Tree */}
      <DecisionTree rec={memo.decision_recommendation} />

      {/* 15. Prediction Intelligence (conditional on relevance) */}
      <PredictionIntelligenceCard query={query} />

      {/* Debug panel — pipeline diagnostics, hidden by default */}
      {debug && (
        <div style={{ borderTop: "2px dashed #e2e8f0", paddingTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <p style={{ margin: 0, fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8" }}>
            ◈ Debug — Pipeline Diagnostics
          </p>
          <CreatorDiagnostics memo={memo} />
          {memo.perspective_raw && <PerspectiveCompressionAudit memo={memo} />}
          {memo.source_quality_scores && <EvidenceQualityPanel scores={memo.source_quality_scores} />}
          {memo.evidence_waterfall && <EvidenceWaterfall memo={memo} />}
          <EvidenceUsed memo={memo} />
        </div>
      )}

    </div>
  );
}

// ── Example queries ───────────────────────────────────────────────────────────

const EXAMPLES = [
  "Best customer acquisition strategies for AI startups",
  "Should SaaS founders build in public?",
  "How do AI startups get their first 100 customers?",
  "Cold outreach vs content marketing for B2B SaaS",
  "Is SEO worth it for early-stage startups?",
];

// ── Main view ─────────────────────────────────────────────────────────────────

export function IntelligenceView() {
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [memo, setMemo] = useState<IntelligenceMemo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (q: string) => {
    if (!q.trim() || running) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setRunning(true);
    setLog([]);
    setMemo(null);
    setError(null);

    try {
      const res = await fetch("/api/intelligence/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) { setError("Request failed. Try again."); return; }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const data = chunk.replace(/^data: /, "");
          if (!data.trim()) continue;
          try {
            const p = JSON.parse(data) as { type: string; source?: string; agent?: string; message?: string; count?: number; memo?: IntelligenceMemo };
            if (p.type === "stage") setLog(prev => [...prev, { source: p.source, agent: p.agent, message: p.message ?? "", count: p.count }]);
            else if (p.type === "complete" && p.memo) setMemo(p.memo);
            else if (p.type === "error") setError(p.message ?? "Unknown error");
          } catch { /* malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRunning(false);
    }
  }, [running]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); void run(query); };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Header */}
      <div>
        <h1 style={{ margin: "0 0 0.2rem", fontSize: "1.3rem", fontWeight: 900, color: "#0f172a" }}>
          WatchFilter Intelligence
        </h1>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
          Evidence → Claims → Reasoning → Decision → Actions
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g. Best customer acquisition strategies for AI startups"
            disabled={running}
            style={{ flex: 1, padding: "0.65rem 1rem", fontSize: "0.86rem", borderRadius: 10, border: "1.5px solid #e2e8f0", outline: "none", color: "#0f172a", background: running ? "#f8fafc" : "white" }}
          />
          <button type="submit" disabled={running || !query.trim()}
            style={{ padding: "0.65rem 1.3rem", fontSize: "0.83rem", fontWeight: 700, borderRadius: 10, border: "none", background: (running || !query.trim()) ? "#e2e8f0" : "#6366f1", color: (running || !query.trim()) ? "#94a3b8" : "white", cursor: (running || !query.trim()) ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
            {running ? "Analyzing…" : "Ask Intelligence →"}
          </button>
        </div>
      </form>

      {/* Examples */}
      {!memo && !running && log.length === 0 && (
        <div>
          <p style={{ margin: "0 0 0.4rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>Try these</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {EXAMPLES.map(q => (
              <button key={q} type="button" onClick={() => { setQuery(q); void run(q); }}
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.7rem", borderRadius: 20, border: "1px solid #e2e8f0", background: "white", color: "#374151", cursor: "pointer" }}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress log */}
      {(running || (log.length > 0 && !memo)) && <AgentLog entries={log} running={running} />}

      {/* Error */}
      {error && (
        <div style={{ padding: "0.75rem 1rem", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: "0.76rem", color: "#991b1b" }}>{error}</p>
        </div>
      )}

      {/* Results */}
      {memo && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "#64748b" }}>
              Query: <strong style={{ color: "#0f172a" }}>"{memo.query}"</strong>
            </p>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button type="button" onClick={() => setDebugMode(d => !d)}
                style={{ padding: "0.3rem 0.75rem", fontSize: "0.68rem", borderRadius: 8, border: `1px solid ${debugMode ? "#6366f1" : "#e2e8f0"}`, background: debugMode ? "#eef2ff" : "white", color: debugMode ? "#6366f1" : "#94a3b8", cursor: "pointer", fontWeight: debugMode ? 700 : 400 }}>
                {debugMode ? "◈ Debug On" : "◈ Debug"}
              </button>
              <button type="button" onClick={() => { setMemo(null); setLog([]); setError(null); setDebugMode(false); }}
                style={{ padding: "0.3rem 0.75rem", fontSize: "0.68rem", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", cursor: "pointer" }}>
                ← New Query
              </button>
            </div>
          </div>
          <IntelligenceReport memo={memo} query={query} debug={debugMode} />
        </>
      )}
    </div>
  );
}
