"use client";

import { useState, useCallback } from "react";
import type { PredictionRow, PredictionAccuracyStat, AttributionContaminationReport } from "@/lib/db";

// ── Accuracy meter ────────────────────────────────────────────────────────────

function AccuracyMeter({ score, evaluated }: { score: number; evaluated: number }) {
  if (evaluated === 0) return (
    <span style={{ fontSize: "0.68rem", color: "#94a3b8", fontStyle: "italic" }}>No data</span>
  );
  const color = score >= 70 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ width: 80, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: "0.72rem", fontWeight: 800, color, minWidth: 32, fontVariantNumeric: "tabular-nums" }}>
        {score}
      </span>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PredictionRow["status"] }) {
  const styles: Record<string, { bg: string; color: string; border: string; label: string }> = {
    accurate:   { bg: "#dcfce7", color: "#166534", border: "#86efac", label: "✓ Accurate" },
    inaccurate: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", label: "✗ Inaccurate" },
    unknown:    { bg: "#fef3c7", color: "#854d0e", border: "#fde68a", label: "? Uncertain" },
    pending:    { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0", label: "… Pending" },
    unlinked:   { bg: "#f3e8ff", color: "#6b21a8", border: "#d8b4fe", label: "⚡ Unlinked" },
  };
  const s = styles[status] ?? styles.pending;
  return (
    <span style={{ fontSize: "0.6rem", fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Speaker role badge ────────────────────────────────────────────────────────

function SpeakerRoleBadge({ role }: { role: PredictionRow["speaker_role"] }) {
  const meta: Record<string, { bg: string; color: string; border: string }> = {
    HOST:        { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    GUEST:       { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
    THIRD_PARTY: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  };
  const m = meta[role] ?? meta.HOST;
  return (
    <span style={{ fontSize: "0.58rem", fontWeight: 800, padding: "1px 6px", borderRadius: 20, background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>
      {role.replace("_", " ")}
    </span>
  );
}

// ── Attribution strength badge ────────────────────────────────────────────────

function AttributionBadge({ strength }: { strength: PredictionRow["attribution_strength"] }) {
  const meta: Record<string, { color: string; label: string }> = {
    EXPLICIT:    { color: "#10b981", label: "Explicit" },
    IMPLIED:     { color: "#f59e0b", label: "Implied" },
    PARAPHRASED: { color: "#ef4444", label: "Paraphrased" },
  };
  const m = meta[strength] ?? meta.IMPLIED;
  return (
    <span style={{ fontSize: "0.57rem", fontWeight: 700, color: m.color }}>
      {m.label}
    </span>
  );
}

// ── Tier badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: PredictionRow["outcome_tier"] }) {
  if (!tier) return null;
  const meta: Record<number, { bg: string; color: string; label: string }> = {
    1: { bg: "#dcfce7", color: "#166534", label: "T1 · 1.0×" },
    2: { bg: "#fef3c7", color: "#854d0e", label: "T2 · 0.6×" },
    3: { bg: "#fee2e2", color: "#991b1b", label: "T3 · 0.3×" },
    4: { bg: "#f3e8ff", color: "#6b21a8", label: "T4 · Excl." },
  };
  const m = meta[tier];
  if (!m) return null;
  return (
    <span style={{ fontSize: "0.57rem", fontWeight: 800, padding: "1px 6px", borderRadius: 20, background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

// ── Prediction row ────────────────────────────────────────────────────────────

function PredictionItem({ p }: { p: PredictionRow }) {
  const [expanded, setExpanded] = useState(false);
  const score = p.prediction_accuracy_score;

  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "0.75rem 1rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#0f172a" }}>{p.creator}</span>
            {p.speaker_name && p.speaker_name !== p.creator && (
              <span style={{ fontSize: "0.65rem", color: "#475569" }}>via {p.speaker_name}</span>
            )}
            <SpeakerRoleBadge role={p.speaker_role} />
            <span style={{ fontSize: "0.6rem", padding: "1px 6px", borderRadius: 20, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#64748b" }}>{p.topic}</span>
            <StatusBadge status={p.status} />
            {!p.is_evaluable && (
              <span style={{ fontSize: "0.57rem", fontWeight: 700, color: "#94a3b8" }}>chain incomplete</span>
            )}
            {score !== null && (
              <span style={{ fontSize: "0.65rem", fontWeight: 800, color: score >= 70 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444", marginLeft: "auto" }}>
                {score}/100
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "#374151", lineHeight: 1.45 }}>
            "{p.prediction_text}"
          </p>
        </div>
        <span style={{ color: "#94a3b8", fontSize: "0.75rem", flexShrink: 0, paddingTop: 2 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {/* Attribution chain */}
          <div>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6366f1" }}>Attribution Chain</p>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#374151" }}>
                {p.speaker_name ?? p.creator}
              </span>
              <span style={{ color: "#94a3b8", fontSize: "0.7rem" }}>→</span>
              <AttributionBadge strength={p.attribution_strength} />
              {p.entity_name && (
                <>
                  <span style={{ color: "#94a3b8", fontSize: "0.7rem" }}>→</span>
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#0f172a" }}>
                    {p.entity_name}
                    {p.entity_type ? <span style={{ color: "#94a3b8", fontWeight: 400 }}> ({p.entity_type})</span> : null}
                  </span>
                </>
              )}
              {p.outcome_tier && (
                <>
                  <span style={{ color: "#94a3b8", fontSize: "0.7rem" }}>→</span>
                  <TierBadge tier={p.outcome_tier} />
                </>
              )}
            </div>
          </div>

          {p.measurable_outcome && (
            <div>
              <p style={{ margin: "0 0 0.15rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>Measurable Outcome</p>
              <p style={{ margin: 0, fontSize: "0.74rem", color: "#475569" }}>{p.measurable_outcome}</p>
            </div>
          )}

          {p.evaluation_evidence && (
            <div>
              <p style={{ margin: "0 0 0.15rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>Evaluation</p>
              <p style={{ margin: 0, fontSize: "0.74rem", color: "#475569", fontStyle: "italic" }}>{p.evaluation_evidence}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: "0 0 0.1rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Stated Confidence</p>
              <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, color: "#374151" }}>{Math.round(p.confidence * 100)}%</p>
            </div>
            <div>
              <p style={{ margin: "0 0 0.1rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Speaker Confidence</p>
              <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, color: "#374151" }}>{p.speaker_confidence}</p>
            </div>
            {p.evaluated_at && (
              <div>
                <p style={{ margin: "0 0 0.1rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Evaluated</p>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "#374151" }}>{new Date(p.evaluated_at).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contamination report ──────────────────────────────────────────────────────

function ContaminationReport({ report }: { report: AttributionContaminationReport }) {
  if (report.total === 0) return null;

  const guestPct = report.guest_contamination_pct;
  const ambiguityPct = report.attribution_ambiguity_pct;
  const riskColor = guestPct > 40 || ambiguityPct > 50 ? "#ef4444"
    : guestPct > 20 || ambiguityPct > 30 ? "#f59e0b"
    : "#10b981";

  const { tier1, tier2, tier3, tier4 } = report.tier_distribution;
  const scorable = tier1 + tier2 + tier3;

  return (
    <section>
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Structural Attribution Report
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
        {/* Attribution breakdown */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.75rem 1rem" }}>
          <p style={{ margin: "0 0 0.6rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>
            Speaker Breakdown
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {[
              { label: "Host Claims", value: report.host_claims, color: "#1d4ed8" },
              { label: "Guest Claims", value: report.guest_claims, color: "#c2410c" },
              { label: "Third-Party", value: report.third_party_claims, color: "#166534" },
              { label: "Unlinked", value: report.unlinked_claims, color: "#6b21a8" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.68rem", color: "#374151", flex: 1 }}>{item.label}</span>
                <div style={{ width: 60, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${report.total > 0 ? (item.value / report.total) * 100 : 0}%`, height: "100%", background: item.color, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: item.color, minWidth: 20, textAlign: "right" }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk indicators */}
        <div style={{ background: "white", border: `1px solid ${riskColor}33`, borderRadius: 10, padding: "0.75rem 1rem" }}>
          <p style={{ margin: "0 0 0.6rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>
            Contamination Risk
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
                <span style={{ fontSize: "0.68rem", color: "#374151" }}>Guest-derived</span>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: riskColor }}>{guestPct}%</span>
              </div>
              <div style={{ height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${guestPct}%`, height: "100%", background: riskColor, borderRadius: 2 }} />
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
                <span style={{ fontSize: "0.68rem", color: "#374151" }}>Attribution ambiguity</span>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: ambiguityPct > 40 ? "#ef4444" : "#f59e0b" }}>{ambiguityPct}%</span>
              </div>
              <div style={{ height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${ambiguityPct}%`, height: "100%", background: ambiguityPct > 40 ? "#ef4444" : "#f59e0b", borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ marginTop: "0.25rem", padding: "0.35rem 0.5rem", background: "#f8fafc", borderRadius: 6 }}>
              <span style={{ fontSize: "0.65rem", color: "#475569" }}>
                Evaluable chain: <strong style={{ color: "#0f172a" }}>{report.evaluable}</strong> / {report.total} claims
              </span>
            </div>
          </div>
        </div>

        {/* Tier distribution */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.75rem 1rem" }}>
          <p style={{ margin: "0 0 0.6rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>
            Outcome Tier Distribution
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {[
              { label: "Tier 1 · 1.0× weight", value: tier1, color: "#10b981" },
              { label: "Tier 2 · 0.6× weight", value: tier2, color: "#f59e0b" },
              { label: "Tier 3 · 0.3× weight", value: tier3, color: "#ef4444" },
              { label: "Tier 4 · Excluded", value: tier4, color: "#6b21a8" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.65rem", color: "#374151", flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: item.color, minWidth: 20, textAlign: "right" }}>{item.value}</span>
              </div>
            ))}
          </div>
          {scorable > 0 && (
            <div style={{ marginTop: "0.6rem", borderTop: "1px solid #f1f5f9", paddingTop: "0.5rem" }}>
              <p style={{ margin: "0 0 0.1rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>
                Weighted Accuracy
              </p>
              {report.weighted_accuracy !== null ? (
                <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: 900, color: report.weighted_accuracy >= 70 ? "#10b981" : report.weighted_accuracy >= 50 ? "#f59e0b" : "#ef4444" }}>
                  {report.weighted_accuracy}
                  <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "#94a3b8" }}> / 100</span>
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "0.72rem", color: "#94a3b8", fontStyle: "italic" }}>No evaluated chains</p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Creator leaderboard ───────────────────────────────────────────────────────

function CreatorLeaderboard({ stats }: { stats: PredictionAccuracyStat[] }) {
  if (stats.length === 0) return null;
  const withData = stats.filter(s => s.evaluated > 0).sort((a, b) => b.accuracy_score - a.accuracy_score);
  if (withData.length === 0) return null;

  return (
    <section>
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Prediction Accuracy Leaderboard
      </h2>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 120px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "0.4rem 1rem", gap: "0.5rem" }}>
          {["Creator", "Total", "Scored", "Accuracy"].map(h => (
            <span key={h} style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>{h}</span>
          ))}
        </div>
        {withData.map((s, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 120px", padding: "0.55rem 1rem", gap: "0.5rem", alignItems: "center", borderBottom: i < withData.length - 1 ? "1px solid #f1f5f9" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 800, color: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : "#cd7c54", minWidth: 18 }}>#{i + 1}</span>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#0f172a" }}>{s.creator}</span>
            </div>
            <span style={{ fontSize: "0.72rem", color: "#64748b" }}>{s.total}</span>
            <span style={{ fontSize: "0.72rem", color: "#64748b" }}>{s.evaluated}</span>
            <AccuracyMeter score={s.accuracy_score} evaluated={s.evaluated} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function PredictionsView() {
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [stats, setStats] = useState<PredictionAccuracyStat[]>([]);
  const [contamination, setContamination] = useState<AttributionContaminationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "accurate" | "inaccurate" | "unlinked">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/predictions/list");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json() as {
        predictions: PredictionRow[];
        stats: PredictionAccuracyStat[];
        contamination: AttributionContaminationReport;
      };
      setPredictions(data.predictions);
      setStats(data.stats);
      setContamination(data.contamination ?? null);
    } catch {
      setMessage("Failed to load predictions.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExtract = useCallback(async () => {
    setExtracting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/predictions/extract", { method: "POST" });
      const data = await res.json() as { extracted: number; scanned: number };
      setMessage(`Extracted ${data.extracted} predictions from ${data.scanned} evidence rows.`);
      await load();
    } catch {
      setMessage("Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }, [load]);

  const handleEvaluate = useCallback(async () => {
    setEvaluating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/predictions/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluate_all: true }),
      });
      const data = await res.json() as { evaluated: number };
      setMessage(`Evaluated ${data.evaluated} pending predictions.`);
      await load();
    } catch {
      setMessage("Evaluation failed.");
    } finally {
      setEvaluating(false);
    }
  }, [load]);

  const filtered = predictions.filter(p => filter === "all" || p.status === filter);
  const pending = predictions.filter(p => p.status === "pending" && p.is_evaluable).length;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>
          Prediction Tracking
        </h1>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
          Extract creator predictions with full speaker attribution chains. Evaluate accuracy using tier-weighted scoring.
        </p>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", fontWeight: 700, borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#374151", cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
        <button
          type="button"
          onClick={() => void handleExtract()}
          disabled={extracting}
          style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", fontWeight: 700, borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: extracting ? "not-allowed" : "pointer" }}
        >
          {extracting ? "Extracting…" : "⚡ Extract Predictions"}
        </button>
        {pending > 0 && (
          <button
            type="button"
            onClick={() => void handleEvaluate()}
            disabled={evaluating}
            style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", fontWeight: 700, borderRadius: 8, border: "none", background: "#10b981", color: "white", cursor: evaluating ? "not-allowed" : "pointer" }}
          >
            {evaluating ? "Evaluating…" : `▶ Evaluate ${pending} Pending`}
          </button>
        )}
        {message && (
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#475569" }}>{message}</p>
        )}
      </div>

      {/* Stats summary */}
      {predictions.length > 0 && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {[
            { label: "Total", value: predictions.length, color: "#0f172a" },
            { label: "Evaluable", value: predictions.filter(p => p.is_evaluable).length, color: "#6366f1" },
            { label: "Accurate", value: predictions.filter(p => p.status === "accurate").length, color: "#10b981" },
            { label: "Inaccurate", value: predictions.filter(p => p.status === "inaccurate").length, color: "#ef4444" },
            { label: "Unlinked", value: predictions.filter(p => p.status === "unlinked").length, color: "#6b21a8" },
          ].map(s => (
            <div key={s.label} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.75rem 1rem", minWidth: 90 }}>
              <p style={{ margin: "0 0 0.15rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>{s.label}</p>
              <p style={{ margin: 0, fontSize: "1.2rem", fontWeight: 900, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Contamination Report */}
      {contamination && contamination.total > 0 && (
        <ContaminationReport report={contamination} />
      )}

      {/* Leaderboard */}
      <CreatorLeaderboard stats={stats} />

      {/* Filter + list */}
      {predictions.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
              Predictions ({filtered.length})
            </h2>
            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
              {(["all", "pending", "accurate", "inaccurate", "unlinked"] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  style={{ padding: "3px 10px", fontSize: "0.65rem", fontWeight: 700, borderRadius: 20, border: `1px solid ${filter === f ? "#6366f1" : "#e2e8f0"}`, background: filter === f ? "#6366f1" : "white", color: filter === f ? "white" : "#64748b", cursor: "pointer", textTransform: "capitalize" }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {filtered.map(p => <PredictionItem key={p.prediction_id} p={p} />)}
          </div>
        </section>
      )}

      {!loading && predictions.length === 0 && (
        <div style={{ padding: "3rem 2rem", textAlign: "center", background: "#f8fafc", border: "1px dashed #e2e8f0", borderRadius: 12 }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "1.5rem" }}>🎯</p>
          <p style={{ margin: "0 0 0.4rem", fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}>No predictions yet</p>
          <p style={{ margin: "0 0 1rem", fontSize: "0.78rem", color: "#64748b", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
            Click "Extract Predictions" to scan your creator library. Each prediction is attributed to its actual speaker (Host, Guest, or Third-Party) for accurate chain tracking.
          </p>
          <button
            type="button"
            onClick={() => void handleExtract()}
            disabled={extracting}
            style={{ padding: "0.6rem 1.25rem", fontSize: "0.82rem", fontWeight: 700, borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: extracting ? "not-allowed" : "pointer" }}
          >
            {extracting ? "Extracting…" : "⚡ Extract Predictions"}
          </button>
        </div>
      )}
    </div>
  );
}
