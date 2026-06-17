"use client";

import { useState, useCallback } from "react";
import type { PredictionRow, PredictionAccuracyStat } from "@/lib/db";

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
  };
  const s = styles[status] ?? styles.pending;
  return (
    <span style={{ fontSize: "0.6rem", fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {s.label}
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#0f172a" }}>{p.creator}</span>
            <span style={{ fontSize: "0.6rem", padding: "1px 6px", borderRadius: 20, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#64748b" }}>{p.topic}</span>
            <StatusBadge status={p.status} />
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
          {p.measurable_outcome && (
            <div>
              <p style={{ margin: "0 0 0.15rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6366f1" }}>Measurable Outcome</p>
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

// ── Creator leaderboard ───────────────────────────────────────────────────────

function CreatorLeaderboard({ stats }: { stats: PredictionAccuracyStat[] }) {
  if (stats.length === 0) return null;
  const withData = stats.filter(s => s.evaluated > 0).sort((a, b) => b.accuracy_score - a.accuracy_score);
  if (withData.length === 0) return null;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
          Prediction Accuracy Leaderboard
        </h2>
      </div>
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
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "accurate" | "inaccurate">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/predictions/list");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json() as { predictions: PredictionRow[]; stats: PredictionAccuracyStat[] };
      setPredictions(data.predictions);
      setStats(data.stats);
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
  const pending = predictions.filter(p => p.status === "pending").length;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>
          Prediction Tracking
        </h1>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
          Extract creator predictions, evaluate accuracy over time, and boost authority for consistently accurate forecasters.
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
            { label: "Total Predictions", value: predictions.length, color: "#0f172a" },
            { label: "Evaluated", value: predictions.filter(p => p.status !== "pending").length, color: "#6366f1" },
            { label: "Accurate", value: predictions.filter(p => p.status === "accurate").length, color: "#10b981" },
            { label: "Inaccurate", value: predictions.filter(p => p.status === "inaccurate").length, color: "#ef4444" },
          ].map(s => (
            <div key={s.label} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.75rem 1rem", minWidth: 100 }}>
              <p style={{ margin: "0 0 0.15rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>{s.label}</p>
              <p style={{ margin: 0, fontSize: "1.2rem", fontWeight: 900, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</p>
            </div>
          ))}
        </div>
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
            <div style={{ display: "flex", gap: "0.3rem" }}>
              {(["all", "pending", "accurate", "inaccurate"] as const).map(f => (
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
          <p style={{ margin: "0 0 1rem", fontSize: "0.78rem", color: "#64748b", maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
            Click "Extract Predictions" to scan your creator library for forward-looking statements and begin tracking accuracy.
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
