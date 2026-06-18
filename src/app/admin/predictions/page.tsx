"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import type { PredictionRow } from "@/lib/db";

const ADMIN_EMAIL = "abdulrahemt@gmail.com";

type ResolutionStatus = "correct" | "incorrect" | "mixed";
type FilterStatus = "unresolved" | "correct" | "incorrect" | "mixed" | "all";
type FilterPriority = "high" | "medium" | "low" | "all";

const STATUS_COLORS: Record<string, string> = {
  pending:    "#64748b",
  correct:    "#22c55e",
  incorrect:  "#ef4444",
  mixed:      "#f59e0b",
  accurate:   "#3b82f6",
  inaccurate: "#ef4444",
  unknown:    "#64748b",
  unlinked:   "#64748b",
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   "#ef4444",
  medium: "#f59e0b",
  low:    "#64748b",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      background: STATUS_COLORS[status] ? `${STATUS_COLORS[status]}22` : "#ffffff11",
      color: STATUS_COLORS[status] ?? "#94a3b8",
      border: `1px solid ${STATUS_COLORS[status] ?? "#ffffff22"}44`,
    }}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 7px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: PRIORITY_COLORS[priority] ?? "#94a3b8",
    }}>
      {priority}
    </span>
  );
}

type ModalState = {
  prediction: PredictionRow;
  selectedStatus: ResolutionStatus | null;
  notes: string;
  confidence: number;
  submitting: boolean;
  error: string | null;
};

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function AdminPredictionsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("unresolved");
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("all");
  const [filterCreator, setFilterCreator] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/");
    if (authStatus === "authenticated" && session?.user?.email !== ADMIN_EMAIL) router.push("/");
  }, [authStatus, session, router]);

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterPriority !== "all") params.set("priority", filterPriority);
      if (filterCreator.trim()) params.set("creator", filterCreator.trim());

      const res = await fetch(`/api/predictions?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { predictions: PredictionRow[] };
      setPredictions(data.predictions);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterCreator]);

  useEffect(() => {
    if (authStatus === "authenticated" && session?.user?.email === ADMIN_EMAIL) {
      void fetchPredictions();
    }
  }, [authStatus, session, fetchPredictions]);

  async function submitResolution() {
    if (!modal?.selectedStatus) return;
    setModal(m => m ? { ...m, submitting: true, error: null } : null);

    const res = await fetch("/api/predictions/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prediction_id:      modal.prediction.prediction_id,
        status:             modal.selectedStatus,
        resolver_notes:     modal.notes || null,
        resolver_confidence: modal.confidence,
      }),
    });

    if (res.ok) {
      setModal(null);
      void fetchPredictions();
    } else {
      const data = await res.json() as { error?: string };
      setModal(m => m ? { ...m, submitting: false, error: data.error ?? "Unknown error" } : null);
    }
  }

  if (authStatus === "loading") {
    return <div style={PAGE_STYLE}><div style={SPINNER_STYLE}>Loading…</div></div>;
  }
  if (authStatus !== "authenticated" || session?.user?.email !== ADMIN_EMAIL) return null;

  const resolvedCount = predictions.filter(p => ["correct", "incorrect", "mixed"].includes(p.status)).length;
  const unresolvedCount = predictions.filter(p => p.status === "pending" || !p.status).length;

  return (
    <div style={PAGE_STYLE}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
            Prediction Resolver
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            {loading ? "Loading…" : `${predictions.length} predictions · ${unresolvedCount} unresolved · ${resolvedCount} resolved`}
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as FilterStatus)}
            style={SELECT_STYLE}
          >
            <option value="unresolved">Unresolved</option>
            <option value="correct">Correct</option>
            <option value="incorrect">Incorrect</option>
            <option value="mixed">Mixed</option>
            <option value="all">All statuses</option>
          </select>

          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value as FilterPriority)}
            style={SELECT_STYLE}
          >
            <option value="all">All priorities</option>
            <option value="high">High priority</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <input
            type="text"
            placeholder="Filter by creator…"
            value={filterCreator}
            onChange={e => setFilterCreator(e.target.value)}
            style={{ ...SELECT_STYLE, minWidth: 180 }}
          />

          <button onClick={() => void fetchPredictions()} style={BTN_GHOST}>
            Refresh
          </button>
        </div>

        {/* Error */}
        {fetchError && (
          <div style={{ background: "#450a0a", border: "1px solid #b91c1c", borderRadius: 8, padding: "0.75rem 1rem", color: "#fca5a5", fontSize: 13, marginBottom: "1rem" }}>
            {fetchError}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={SPINNER_STYLE}>Loading predictions…</div>
        ) : predictions.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 14, padding: "2rem", textAlign: "center" }}>
            No predictions match the current filters.
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Creator", "Domain", "Prediction", "Horizon", "Status", "Pri", "Action"].map(h => (
                    <th key={h} style={TH_STYLE}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {predictions.map((p, i) => (
                  <tr
                    key={p.prediction_id}
                    style={{
                      borderBottom: i < predictions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      transition: "background 0.1s",
                      cursor: "default",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={TD_STYLE}>{truncate(p.creator, 20)}</td>
                    <td style={TD_STYLE}>{truncate(p.domain ?? p.topic, 18)}</td>
                    <td style={{ ...TD_STYLE, maxWidth: 320, color: "#cbd5e1" }}>
                      {truncate(p.normalized_statement ?? p.prediction_text, 90)}
                    </td>
                    <td style={{ ...TD_STYLE, color: "#94a3b8", fontSize: 11 }}>
                      {p.time_horizon?.timeframe_text ?? "—"}
                    </td>
                    <td style={TD_STYLE}><StatusBadge status={p.status} /></td>
                    <td style={TD_STYLE}><PriorityBadge priority={p.resolver_priority} /></td>
                    <td style={TD_STYLE}>
                      {!["correct", "incorrect", "mixed"].includes(p.status) && (
                        <button
                          onClick={() => setModal({ prediction: p, selectedStatus: null, notes: "", confidence: 0.85, submitting: false, error: null })}
                          style={BTN_RESOLVE}
                        >
                          Resolve
                        </button>
                      )}
                      {["correct", "incorrect", "mixed"].includes(p.status) && (
                        <button
                          onClick={() => setModal({ prediction: p, selectedStatus: p.status as ResolutionStatus, notes: p.resolver_notes ?? "", confidence: p.evaluation?.resolver_confidence ?? 0.85, submitting: false, error: null })}
                          style={{ ...BTN_RESOLVE, background: "rgba(255,255,255,0.04)", color: "#94a3b8" }}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resolution Modal */}
      {modal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem" }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}
        >
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "1.75rem", width: "100%", maxWidth: 560 }}>
            {/* Modal header */}
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", margin: 0 }}>Resolve Prediction</h2>
                <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                {modal.prediction.creator} · {modal.prediction.domain ?? modal.prediction.topic} · {modal.prediction.time_horizon?.timeframe_text ?? "unknown horizon"}
              </div>
            </div>

            {/* Prediction text */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "0.875rem 1rem", marginBottom: "1.25rem" }}>
              <p style={{ fontSize: 14, color: "#cbd5e1", margin: 0, lineHeight: 1.5 }}>
                {modal.prediction.normalized_statement ?? modal.prediction.prediction_text}
              </p>
              {modal.prediction.evidence_quote && (
                <p style={{ fontSize: 12, color: "#64748b", margin: "0.5rem 0 0", fontStyle: "italic" }}>
                  "{truncate(modal.prediction.evidence_quote, 200)}"
                </p>
              )}
            </div>

            {/* Resolution buttons */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={LABEL_STYLE}>Outcome</label>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {(["correct", "incorrect", "mixed"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setModal(m => m ? { ...m, selectedStatus: s } : null)}
                    style={{
                      flex: 1,
                      padding: "0.6rem",
                      borderRadius: 8,
                      border: `2px solid ${modal.selectedStatus === s ? STATUS_COLORS[s] : "rgba(255,255,255,0.1)"}`,
                      background: modal.selectedStatus === s ? `${STATUS_COLORS[s]}22` : "rgba(255,255,255,0.03)",
                      color: modal.selectedStatus === s ? STATUS_COLORS[s] : "#94a3b8",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      transition: "all 0.15s",
                      textTransform: "capitalize",
                    }}
                  >
                    {s === "correct" ? "✓ Correct" : s === "incorrect" ? "✗ Incorrect" : "◐ Mixed"}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={LABEL_STYLE}>Notes (optional)</label>
              <textarea
                value={modal.notes}
                onChange={e => setModal(m => m ? { ...m, notes: e.target.value } : null)}
                placeholder="Evidence links, context, reasoning…"
                rows={3}
                style={{ ...TEXTAREA_STYLE, marginTop: 6 }}
              />
            </div>

            {/* Confidence */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={LABEL_STYLE}>Resolver Confidence — {Math.round(modal.confidence * 100)}%</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={modal.confidence}
                onChange={e => setModal(m => m ? { ...m, confidence: parseFloat(e.target.value) } : null)}
                style={{ width: "100%", marginTop: 6, accentColor: "#6366f1" }}
              />
            </div>

            {/* Error */}
            {modal.error && (
              <div style={{ background: "#450a0a", border: "1px solid #b91c1c", borderRadius: 6, padding: "0.6rem 0.875rem", color: "#fca5a5", fontSize: 12, marginBottom: "1rem" }}>
                {modal.error}
              </div>
            )}

            {/* Submit */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setModal(null)} style={BTN_GHOST}>Cancel</button>
              <button
                onClick={() => void submitResolution()}
                disabled={!modal.selectedStatus || modal.submitting}
                style={{
                  padding: "0.5rem 1.25rem",
                  borderRadius: 8,
                  border: "none",
                  background: modal.selectedStatus && !modal.submitting ? "#6366f1" : "#1e293b",
                  color: modal.selectedStatus && !modal.submitting ? "#fff" : "#475569",
                  cursor: modal.selectedStatus && !modal.submitting ? "pointer" : "not-allowed",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 0.15s",
                }}
              >
                {modal.submitting ? "Saving…" : "Save Resolution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const PAGE_STYLE: React.CSSProperties = {
  minHeight: "100vh",
  background: "#080c14",
  color: "#f1f5f9",
  fontFamily: "system-ui, -apple-system, sans-serif",
  padding: "2rem 1.5rem",
};

const SPINNER_STYLE: React.CSSProperties = {
  color: "#475569",
  fontSize: 14,
  padding: "3rem",
  textAlign: "center",
};

const SELECT_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#cbd5e1",
  padding: "0.4rem 0.75rem",
  fontSize: 13,
  outline: "none",
  cursor: "pointer",
};

const TH_STYLE: React.CSSProperties = {
  padding: "0.6rem 1rem",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#475569",
};

const TD_STYLE: React.CSSProperties = {
  padding: "0.65rem 1rem",
  color: "#94a3b8",
  verticalAlign: "middle",
};

const BTN_GHOST: React.CSSProperties = {
  padding: "0.4rem 0.875rem",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "#94a3b8",
  cursor: "pointer",
  fontSize: 13,
};

const BTN_RESOLVE: React.CSSProperties = {
  padding: "0.3rem 0.75rem",
  borderRadius: 6,
  border: "1px solid rgba(99,102,241,0.4)",
  background: "rgba(99,102,241,0.15)",
  color: "#818cf8",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#64748b",
  display: "block",
};

const TEXTAREA_STYLE: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#cbd5e1",
  padding: "0.625rem 0.875rem",
  fontSize: 13,
  resize: "vertical",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};
