"use client";

import { useState, useCallback } from "react";
import type { PredictionRow, PredictionAccuracyStat, DomainAccuracyStat } from "@/lib/db";

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
      <span style={{ fontSize: "0.72rem", fontWeight: 800, color, minWidth: 32 }} title="WatchFilter's own editorial read — not a YouTube metric">
        {score >= 70 ? "High" : score >= 50 ? "Medium" : "Low"}
      </span>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PredictionRow["status"] }) {
  const styles: Record<string, { bg: string; color: string; border: string; label: string }> = {
    accurate:   { bg: "#dcfce7", color: "#166534", border: "#86efac", label: "🟢 Correct" },
    inaccurate: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", label: "🔴 Incorrect" },
    unknown:    { bg: "#fef3c7", color: "#854d0e", border: "#fde68a", label: "🟡 Mixed" },
    pending:    { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0", label: "⚪ Unresolved" },
    unlinked:   { bg: "#f3e8ff", color: "#6b21a8", border: "#d8b4fe", label: "⚡ Unlinked" },
  };
  const s = styles[status] ?? styles.pending;
  return (
    <span style={{ fontSize: "0.6rem", fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Prediction type badge ─────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  technology: "#6366f1", market: "#3b82f6", startup: "#10b981",
  regulation: "#f59e0b", finance: "#ef4444", product: "#8b5cf6",
  adoption: "#06b6d4", macro: "#64748b", consumer_behavior: "#f97316",
};

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const color = TYPE_COLORS[type] ?? "#64748b";
  return (
    <span style={{ fontSize: "0.57rem", fontWeight: 800, padding: "1px 7px", borderRadius: 20, background: `${color}18`, color, border: `1px solid ${color}33` }}>
      {type.replace("_", " ")}
    </span>
  );
}

// ── Forecast badge ────────────────────────────────────────────────────────────

const DIRECTION_META: Record<string, { icon: string; color: string }> = {
  increase:    { icon: "↑", color: "#10b981" },
  adoption:    { icon: "↑", color: "#10b981" },
  dominance:   { icon: "↑", color: "#6366f1" },
  decrease:    { icon: "↓", color: "#ef4444" },
  failure:     { icon: "↓", color: "#ef4444" },
  replacement: { icon: "⇌", color: "#f59e0b" },
  uncertain:   { icon: "~", color: "#94a3b8" },
};

function ForecastBadge({ forecast }: { forecast: PredictionRow["forecast"] }) {
  if (!forecast) return null;
  const meta = DIRECTION_META[forecast.direction] ?? DIRECTION_META.uncertain;
  const prob = forecast.estimated_probability;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", fontSize: "0.6rem", fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}>
      {meta.icon} {prob}%
    </span>
  );
}

// ── Calibration badge ─────────────────────────────────────────────────────────

const CALIB_META = {
  low:    { label: "Hedged",   color: "#94a3b8" },
  medium: { label: "Moderate", color: "#f59e0b" },
  high:   { label: "Certain",  color: "#ef4444" },
};

function CalibrationBadge({ style }: { style: PredictionRow["calibration_confidence_style"] }) {
  if (!style) return null;
  const m = CALIB_META[style];
  return (
    <span style={{ fontSize: "0.55rem", fontWeight: 700, color: m.color }}>{m.label}</span>
  );
}

// ── Market consensus badge ────────────────────────────────────────────────────

const CONSENSUS_META = {
  supportive:  { label: "Mainstream", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  contrarian:  { label: "Contrarian", bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
  neutral:     { label: "Neutral",    bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" },
};

function ConsensusBadge({ position }: { position: PredictionRow["market_consensus_position"] }) {
  if (!position) return null;
  const m = CONSENSUS_META[position];
  return (
    <span style={{ fontSize: "0.57rem", fontWeight: 800, padding: "1px 6px", borderRadius: 20, background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>
      {m.label}
    </span>
  );
}

// ── Score pill row (falsifiability / specificity / importance) ────────────────

function ScorePills({ p }: { p: PredictionRow }) {
  if (p.falsifiability_score == null && p.specificity_score == null && p.importance_score == null) return null;
  const pills = [
    { label: "Falsifiability", value: p.falsifiability_score, color: "#6366f1" },
    { label: "Specificity",    value: p.specificity_score,    color: "#3b82f6" },
    { label: "Importance",     value: p.importance_score,     color: "#f59e0b" },
  ];
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      {pills.map(({ label, value, color }) => {
        if (value == null) return null;
        const pct = Math.round(value * 100);
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ fontSize: "0.56rem", color: "#94a3b8" }}>{label}</span>
            <div style={{ width: 36, height: 3, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: "0.58rem", fontWeight: 700, color }}>{pct}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Prediction card ───────────────────────────────────────────────────────────

function PredictionItem({ p, domainAccuracy }: { p: PredictionRow; domainAccuracy: DomainAccuracyStat[] }) {
  const [expanded, setExpanded] = useState(false);
  const score = p.prediction_accuracy_score;
  const domain = p.domain ?? p.topic;

  const domainStat = domainAccuracy.find(d => d.domain === domain);
  const supporting = domainStat?.supporting ?? null;
  const opposing = domainStat?.opposing ?? null;
  const weightedProbability = Math.round((p.confidence ?? 0.5) * 100);

  const timeLabel = (() => {
    if (!p.time_horizon) return null;
    if (p.time_horizon.target_date) return `by ${p.time_horizon.target_date}`;
    if (p.time_horizon.timeframe_text) return p.time_horizon.timeframe_text;
    return null;
  })();

  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "0.85rem 1rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top row: creator + badges */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#0f172a" }}>{p.creator}</span>
            <TypeBadge type={p.prediction_type} />
            {domain && (
              <span style={{ fontSize: "0.58rem", padding: "1px 6px", borderRadius: 20, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#64748b" }}>
                {domain}
              </span>
            )}
            <ForecastBadge forecast={p.forecast} />
            <ConsensusBadge position={p.market_consensus_position} />
            {timeLabel && (
              <span style={{ fontSize: "0.57rem", fontWeight: 700, color: "#6366f1" }}>{timeLabel}</span>
            )}
            <StatusBadge status={p.status} />
            {!p.trackable && (
              <span style={{ fontSize: "0.55rem", color: "#94a3b8" }}>not trackable</span>
            )}
            {score !== null && (
              <span
                style={{ fontSize: "0.65rem", fontWeight: 800, color: score >= 70 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444", marginLeft: "auto" }}
                title="WatchFilter's own editorial read — not a YouTube metric"
              >
                {score >= 70 ? "High" : score >= 50 ? "Medium" : "Low"} accuracy
              </span>
            )}
          </div>

          {/* Prediction text */}
          <p style={{ margin: "0 0 0.4rem", fontSize: "0.8rem", color: "#1e293b", lineHeight: 1.5, fontWeight: 500 }}>
            "{p.normalized_statement ?? p.prediction_text}"
          </p>

          {/* Consensus row */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            {supporting !== null && (
              <span style={{ fontSize: "0.62rem", color: "#10b981", fontWeight: 700 }}>
                ▲ {supporting} supporting
              </span>
            )}
            {opposing !== null && (
              <span style={{ fontSize: "0.62rem", color: "#ef4444", fontWeight: 700 }}>
                ▼ {opposing} opposing
              </span>
            )}
            <span style={{ fontSize: "0.62rem", fontWeight: 800, color: weightedProbability >= 65 ? "#10b981" : weightedProbability >= 40 ? "#f59e0b" : "#ef4444" }}>
              {weightedProbability}% probability
            </span>
            <CalibrationBadge style={p.calibration_confidence_style} />
          </div>
        </div>
        <span style={{ color: "#94a3b8", fontSize: "0.75rem", flexShrink: 0, paddingTop: 2 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>

          {/* Evidence quote */}
          {p.evidence_quote && (
            <div style={{ background: "#f8fafc", borderLeft: "3px solid #e2e8f0", borderRadius: 4, padding: "0.4rem 0.65rem" }}>
              <p style={{ margin: "0 0 0.1rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Evidence quote</p>
              <p style={{ margin: 0, fontSize: "0.72rem", color: "#475569", fontStyle: "italic" }}>"{p.evidence_quote}"</p>
            </div>
          )}

          {/* Score pills */}
          <ScorePills p={p} />

          {/* Resolution */}
          {p.resolution && (
            <div>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>Resolution Method</p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {p.resolution.metric && (
                  <span style={{ fontSize: "0.68rem", color: "#374151" }}>Metric: <strong>{p.resolution.metric}</strong></span>
                )}
                {p.resolution.threshold && (
                  <span style={{ fontSize: "0.68rem", color: "#374151" }}>Threshold: <strong>{p.resolution.threshold}</strong></span>
                )}
              </div>
              <p style={{ margin: "0.15rem 0 0", fontSize: "0.7rem", color: "#64748b" }}>{p.resolution.resolution_method}</p>
              {p.resolution.resolver_sources && p.resolution.resolver_sources.length > 0 && (
                <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
                  {p.resolution.resolver_sources.map((s, i) => (
                    <span key={i} style={{ fontSize: "0.57rem", fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Relationships */}
          {p.relationships && p.relationships.length > 0 && (() => {
            const REL_META = [
              { type: "supports",    label: "Supports",   color: "#10b981" },
              { type: "contradicts", label: "Contradicts", color: "#ef4444" },
              { type: "depends_on",  label: "Depends on",  color: "#f59e0b" },
            ] as const;
            return (
              <div>
                <p style={{ margin: "0 0 0.25rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>Relationships</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {REL_META.map(m => {
                    const items = p.relationships!.filter(r => r.type === m.type);
                    if (!items.length) return null;
                    return (
                      <div key={m.type}>
                        <span style={{ fontSize: "0.57rem", fontWeight: 800, color: m.color }}>{m.label}: </span>
                        {items.map((r, i) => (
                          <span key={i} style={{ fontSize: "0.68rem", color: "#374151" }}>
                            {i > 0 ? " · " : ""}"{r.target_prediction}"
                            <span style={{ fontSize: "0.55rem", color: "#94a3b8" }}> ({Math.round(r.confidence * 100)}%)</span>
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Time horizon */}
          {p.time_horizon && (
            <div style={{ display: "flex", gap: "1rem" }}>
              <div>
                <p style={{ margin: "0 0 0.1rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Time Horizon</p>
                <p style={{ margin: 0, fontSize: "0.7rem", color: p.time_horizon.explicit ? "#6366f1" : "#94a3b8" }}>
                  {timeLabel ?? "No date specified"} {!p.time_horizon.explicit && <span style={{ color: "#94a3b8", fontSize: "0.6rem" }}>(implied)</span>}
                </p>
              </div>
              <div>
                <p style={{ margin: "0 0 0.1rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Stated Confidence</p>
                <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 700, color: "#374151" }}>{Math.round((p.confidence ?? 0.5) * 100)}%</p>
              </div>
            </div>
          )}

          {/* Evaluation */}
          {p.evaluation_evidence && (
            <div>
              <p style={{ margin: "0 0 0.15rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>Evaluation</p>
              <p style={{ margin: 0, fontSize: "0.74rem", color: "#475569", fontStyle: "italic" }}>{p.evaluation_evidence}</p>
              {p.evaluated_at && (
                <p style={{ margin: "0.15rem 0 0", fontSize: "0.6rem", color: "#94a3b8" }}>
                  Last updated: {new Date(p.evaluated_at).toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Domain accuracy panel ─────────────────────────────────────────────────────

function DomainAccuracyPanel({ domains }: { domains: DomainAccuracyStat[] }) {
  if (!domains.length) return null;
  const withData = domains.filter(d => d.evaluated > 0);
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Creator Accuracy by Domain
      </h2>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        {domains.map((d, i) => {
          const hasScore = d.evaluated > 0;
          const color = hasScore
            ? (d.accuracy_score >= 70 ? "#10b981" : d.accuracy_score >= 50 ? "#f59e0b" : "#ef4444")
            : "#94a3b8";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.55rem 1rem", borderBottom: i < domains.length - 1 ? "1px solid #f1f5f9" : "none" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#0f172a", flex: 1 }}>{d.domain}</span>
              <span style={{ fontSize: "0.62rem", color: "#94a3b8" }}>{d.total} predictions</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <div style={{ width: 80, height: 5, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: hasScore ? `${d.accuracy_score}%` : "0%", height: "100%", background: color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 900, color, minWidth: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {hasScore ? `${d.accuracy_score}%` : "—"}
                </span>
              </div>
            </div>
          );
        })}
        {!withData.length && (
          <p style={{ margin: 0, padding: "0.75rem 1rem", fontSize: "0.72rem", color: "#94a3b8", fontStyle: "italic" }}>
            No evaluated predictions yet. Run evaluation to see domain accuracy.
          </p>
        )}
      </div>
    </section>
  );
}

// ── Creator leaderboard ───────────────────────────────────────────────────────

function CreatorLeaderboard({ stats }: { stats: PredictionAccuracyStat[] }) {
  const withData = stats.filter(s => s.evaluated > 0).sort((a, b) => b.accuracy_score - a.accuracy_score);
  if (!withData.length) return null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Creator Accuracy Leaderboard
      </h2>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 120px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "0.4rem 1rem", gap: "0.5rem" }}>
          {["Creator", "Total", "Scored", "Accuracy"].map(h => (
            <span key={h} style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>{h}</span>
          ))}
        </div>
        {withData.map((s, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 120px", padding: "0.55rem 1rem", gap: "0.5rem", alignItems: "center", borderBottom: i < withData.length - 1 ? "1px solid #f1f5f9" : "none" }}>
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
  const [domainAccuracy, setDomainAccuracy] = useState<DomainAccuracyStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "accurate" | "inaccurate" | "unknown">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/predictions/list");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json() as {
        predictions: PredictionRow[];
        stats: PredictionAccuracyStat[];
        domainAccuracy: DomainAccuracyStat[];
      };
      setPredictions(data.predictions);
      setStats(data.stats);
      setDomainAccuracy(data.domainAccuracy ?? []);
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

  const pending = predictions.filter(p => p.status === "pending" && p.trackable).length;
  const filtered = predictions.filter(p => filter === "all" || p.status === filter);

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Header */}
      <div>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>
          Prediction Tracking
        </h1>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
          Extract, normalize, and track creator predictions. Evaluated for accuracy when evidence is available.
        </p>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => void load()} disabled={loading}
          style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", fontWeight: 700, borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#374151", cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
        <button type="button" onClick={() => void handleExtract()} disabled={extracting}
          style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", fontWeight: 700, borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: extracting ? "not-allowed" : "pointer" }}>
          {extracting ? "Extracting…" : "⚡ Extract Predictions"}
        </button>
        {pending > 0 && (
          <button type="button" onClick={() => void handleEvaluate()} disabled={evaluating}
            style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", fontWeight: 700, borderRadius: 8, border: "none", background: "#10b981", color: "white", cursor: evaluating ? "not-allowed" : "pointer" }}>
            {evaluating ? "Evaluating…" : `▶ Evaluate ${pending} Trackable`}
          </button>
        )}
        {message && <p style={{ margin: 0, fontSize: "0.75rem", color: "#475569" }}>{message}</p>}
      </div>

      {/* Stats summary */}
      {predictions.length > 0 && (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {[
            { label: "Total",     value: predictions.length,                                   color: "#0f172a" },
            { label: "Trackable", value: predictions.filter(p => p.trackable).length,           color: "#6366f1" },
            { label: "Correct",   value: predictions.filter(p => p.status === "accurate").length,   color: "#10b981" },
            { label: "Incorrect", value: predictions.filter(p => p.status === "inaccurate").length, color: "#ef4444" },
            { label: "Mixed",     value: predictions.filter(p => p.status === "unknown").length,    color: "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.65rem 0.9rem", minWidth: 80 }}>
              <p style={{ margin: "0 0 0.1rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>{s.label}</p>
              <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 900, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Domain accuracy */}
      {domainAccuracy.length > 0 && <DomainAccuracyPanel domains={domainAccuracy} />}

      {/* Creator leaderboard */}
      <CreatorLeaderboard stats={stats} />

      {/* Filter + list */}
      {predictions.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
              Predictions ({filtered.length})
            </h2>
            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
              {(["all", "pending", "accurate", "inaccurate", "unknown"] as const).map(f => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  style={{ padding: "3px 10px", fontSize: "0.65rem", fontWeight: 700, borderRadius: 20, border: `1px solid ${filter === f ? "#6366f1" : "#e2e8f0"}`, background: filter === f ? "#6366f1" : "white", color: filter === f ? "white" : "#64748b", cursor: "pointer", textTransform: "capitalize" }}>
                  {f === "accurate" ? "🟢 Correct" : f === "inaccurate" ? "🔴 Incorrect" : f === "unknown" ? "🟡 Mixed" : f}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {filtered.map(p => <PredictionItem key={p.prediction_id} p={p} domainAccuracy={domainAccuracy} />)}
          </div>
        </section>
      )}

      {!loading && predictions.length === 0 && (
        <div style={{ padding: "3rem 2rem", textAlign: "center", background: "#f8fafc", border: "1px dashed #e2e8f0", borderRadius: 12 }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "1.5rem" }}>🎯</p>
          <p style={{ margin: "0 0 0.4rem", fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}>No predictions yet</p>
          <p style={{ margin: "0 0 1rem", fontSize: "0.78rem", color: "#64748b", maxWidth: 420, marginInline: "auto" }}>
            Click "Extract Predictions" to scan your creator library. Each prediction is normalized, scored for falsifiability and specificity, and tracked for future resolution.
          </p>
          <button type="button" onClick={() => void handleExtract()} disabled={extracting}
            style={{ padding: "0.6rem 1.25rem", fontSize: "0.82rem", fontWeight: 700, borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: extracting ? "not-allowed" : "pointer" }}>
            {extracting ? "Extracting…" : "⚡ Extract Predictions"}
          </button>
        </div>
      )}
    </div>
  );
}
