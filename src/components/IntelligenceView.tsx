"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { IntelligenceMemo } from "@/app/api/intelligence/query/route";
import type { PredictionRow } from "@/lib/db";

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

const DIRECTIONAL_STYLE: Record<string, { bg: string; color: string; bar: string }> = {
  "Strong YES (conditional)": { bg: "#14532d", color: "#86efac", bar: "#22c55e" },
  "Lean YES":                 { bg: "#166534", color: "#bbf7d0", bar: "#4ade80" },
  "Neutral / Tradeoff":       { bg: "#292524", color: "#d6d3d1", bar: "#78716c" },
  "Lean NO":                  { bg: "#7c2d12", color: "#fdba74", bar: "#fb923c" },
  "Strong NO (conditional)":  { bg: "#7f1d1d", color: "#fca5a5", bar: "#f87171" },
};

function DecisionCard({ memo }: { memo: IntelligenceMemo }) {
  const ds = DIRECTIONAL_STYLE[memo.directional] ?? { bg: "#1e293b", color: "#94a3b8", bar: "#475569" };
  return (
    <div style={{ background: "#0f172a", borderRadius: 12, padding: "1.5rem 1.75rem", borderLeft: `4px solid ${ds.bar}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#475569" }}>
          Decision
        </span>
        {memo.directional && (
          <span style={{ fontSize: "0.62rem", fontWeight: 800, padding: "2px 10px", borderRadius: 20, background: ds.bg, color: ds.color, letterSpacing: "0.04em" }}>
            {memo.directional}
          </span>
        )}
      </div>
      <p style={{ margin: "0 0 1.1rem", fontSize: "1rem", color: "#f8fafc", lineHeight: 1.75, fontWeight: 400 }}>
        {memo.decision_summary}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#475569" }}>Sources</span>
        {(memo.sources_used ?? []).map(s => <SourceTag key={s} src={s} />)}
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

  // Weighted contributions (sum ≈ confidence_score)
  const contributions = [
    { label: "Agreement Strength", value: Math.round(bd.agreement * 0.40), max: 40, color: "#10b981" },
    { label: "Source Coverage",    value: Math.round(bd.sourceCoverage * 0.25), max: 25, color: "#3b82f6" },
    { label: "Signal Density",     value: Math.round(bd.signalDensity * 0.15), max: 15, color: "#f59e0b" },
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
            <span style={{ fontSize: "0.65rem", fontWeight: 800, color: agreeColor }}>{agreeLabel(agreeScore)}</span>
          </div>
          {density && (
            <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>
              {density.total_signals} signals · {density.unique_insights} unique insight{density.unique_insights !== 1 ? "s" : ""}
            </span>
          )}
        </div>

      </div>
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

// ── Creator Evidence Section — evidence-backed claims with source attribution ──

const CONSENSUS_META: Record<string, { bg: string; color: string; border: string }> = {
  "Broad Consensus":    { bg: "#dcfce7", color: "#14532d", border: "#86efac" },
  "Strong Consensus":   { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7" },
  "Emerging Consensus": { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
  "Anecdotal":          { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" },
};

function CreatorEvidenceSection({ memo }: { memo: IntelligenceMemo }) {
  const ci = memo.creator_intelligence;
  const acc = SRC_DISPLAY.youtube.accent;

  if (!ci) return null;

  const { claims, coverage } = ci;
  const coverageColor = coverage.level === "High" ? "#10b981" : coverage.level === "Medium" ? "#d97706" : "#ef4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>

      {/* Coverage badge row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontSize: "0.67rem", fontStyle: "italic", color: "#64748b" }}>
          {SRC_QUESTION.youtube}
        </p>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          {coverage.unique_creators != null && coverage.unique_creators > 0 && (
            <span style={{ fontSize: "0.57rem", color: "#94a3b8" }}>
              {coverage.unique_creators} creator{coverage.unique_creators !== 1 ? "s" : ""} · {coverage.accepted} segments
            </span>
          )}
          <span style={{ fontSize: "0.58rem", fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: `${coverageColor}18`, color: coverageColor, border: `1px solid ${coverageColor}44`, whiteSpace: "nowrap" }}>
            Coverage: {coverage.level} ({coverage.coverage_score}%)
          </span>
        </div>
      </div>

      {/* Low-coverage warning */}
      {coverage.level === "Low" && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "0.5rem 0.75rem" }}>
          <p style={{ margin: 0, fontSize: "0.67rem", color: "#9a3412", lineHeight: 1.5 }}>
            Limited creator content found for this topic. {coverage.retrieved > 0 ? `${coverage.accepted} of ${coverage.retrieved} retrieved segments matched — results may draw from loosely related content.` : "No creator segments retrieved."}
          </p>
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
                <p style={{ margin: "0 0 0.15rem", fontSize: "0.57rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Claim</p>
                <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "#0f172a", lineHeight: 1.5 }}>{claim.theme}</p>
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
              {claim.evidence.map((ev, ev_i) => (
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
                  </div>

                  {/* Quote */}
                  <blockquote style={{ margin: 0, padding: "0.3rem 0 0.3rem 0.6rem", borderLeft: `2px solid ${acc}44`, fontSize: "0.7rem", color: "#475569", lineHeight: 1.6, fontStyle: "italic" }}>
                    "{ev.quote}"
                  </blockquote>
                </div>
              ))}
            </div>
          </div>
        );
      }) : (
        <div>
          <p style={{ margin: "0 0 0.2rem", fontSize: "0.72rem", color: "#94a3b8" }}>No attributable creator claims found for this query.</p>
          <p style={{ margin: 0, fontSize: "0.62rem", fontWeight: 700, color: "#cbd5e1" }}>Signal Strength: None</p>
        </div>
      )}
    </div>
  );
}

// ── Creator Retrieval Diagnostics (debug) ─────────────────────────────────────

function CreatorDiagnostics({ memo }: { memo: IntelligenceMemo }) {
  const [open, setOpen] = useState(false);
  const ci = memo.creator_intelligence;
  if (!ci) return null;
  const { coverage } = ci;

  return (
    <div style={{ background: "#0f172a", borderRadius: 10, overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: "100%", padding: "0.65rem 1rem", background: "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569" }}>
          ▶ Creator Retrieval Diagnostics
        </span>
        <span style={{ fontSize: "0.6rem", color: "#475569" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 1rem 1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {[
              { label: "Retrieved", value: coverage.retrieved },
              { label: "Accepted", value: coverage.accepted },
              { label: "Rejected", value: coverage.rejected },
              { label: "Coverage", value: `${coverage.coverage_score}%` },
              { label: "Avg Similarity", value: coverage.avg_similarity != null ? `${coverage.avg_similarity}` : "—" },
              { label: "Unique Creators", value: coverage.unique_creators != null ? coverage.unique_creators : "—" },
              { label: "Density", value: coverage.evidence_density_level ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>{label}</span>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e2e8f0" }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Top rejections */}
          {coverage.top_rejections.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                Top Rejections
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {coverage.top_rejections.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                    <span style={{ fontSize: "0.6rem", color: "#f97316", flexShrink: 0 }}>·</span>
                    <span style={{ fontSize: "0.62rem", color: "#94a3b8", lineHeight: 1.4 }}>
                      {r.claim} <span style={{ color: "#475569" }}>— score: {r.relevance_score} — {r.reason}</span>
                    </span>
                  </div>
                ))}
              </div>
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
                  {p!.weak_signal && <p style={{ margin: "0.4rem 0 0", fontSize: "0.62rem", fontWeight: 700, color: "#d97706" }}>Signal Strength: Weak</p>}
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
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: "0.55rem", fontWeight: 600, color: "#94a3b8" }}>Sources:</span>
                    {e.sources.map(s => {
                      const disp = SRC_DISPLAY[s.source];
                      return (
                        <span key={s.source} style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", fontSize: "0.57rem", fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: disp.dimBg, color: disp.accent, border: `1px solid ${disp.dimBorder}` }}>
                          {disp.icon} {disp.label.split(" ")[0]} ({s.signal_count})
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
}: {
  consensus: IntelligenceMemo["consensus"];
  tradeoffs: IntelligenceMemo["tradeoffs"];
  contradictions: IntelligenceMemo["contradictions"];
}) {
  const score = consensus.agreement_score;
  const agreeColor = score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";

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
          <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>— {agreeLabel(score)}</span>
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

const CONFLICT_STYLE = {
  direct:     { bg: "#fee2e2", color: "#991b1b", label: "Direct conflict" },
  partial:    { bg: "#fff7ed", color: "#c2410c", label: "Partial conflict" },
  contextual: { bg: "#eff6ff", color: "#1d4ed8", label: "Context-dependent" },
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

// ── Full report ───────────────────────────────────────────────────────────────

function IntelligenceReport({ memo, query, debug }: { memo: IntelligenceMemo; query: string; debug: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* 1. Decision */}
      <DecisionCard memo={memo} />

      {/* 2. Intelligence Perspectives — Creator / Community / Web */}
      <SourceBreakdown memo={memo} />

      {/* 3. Highest Confidence Evidence (with source attribution) */}
      <AttributedEvidence evidence={memo.attributed_evidence ?? memo.best_evidence_ranking?.map(r => ({ claim: r, sources: [] })) ?? []} />

      {/* 4. Reasoning (Evidence Themes) */}
      <InsightClusters clusters={memo.insight_clusters} />

      {/* 5. Priority Actions */}
      <PriorityActions actions={memo.decision_recommendation.priority_actions} />

      {/* 6. Confidence */}
      <ConfidenceSection memo={memo} />

      {/* 8. Consensus */}
      <ConsensusSection consensus={memo.consensus} tradeoffs={memo.tradeoffs ?? []} contradictions={memo.contradictions} />

      {/* 9. Tradeoffs */}
      <TradeoffsSection items={memo.tradeoffs ?? []} />

      {/* 10. Contradictions (hard only) */}
      <Contradictions items={memo.contradictions} />

      {/* 11. Stage Playbook */}
      <StageActions rec={memo.decision_recommendation} />

      {/* 12. Prediction Intelligence (conditional on relevance) */}
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
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

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
