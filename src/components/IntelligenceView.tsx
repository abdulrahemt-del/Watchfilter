"use client";

import { useState, useRef, useCallback } from "react";
import type { IntelligenceMemo } from "@/app/api/intelligence/query/route";

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, label, size = 56 }: { score: number; label: string; size?: number }) {
  const r = size * 0.4;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 72 ? "#10b981" : score >= 48 ? "#f59e0b" : "#ef4444";
  const cx = size / 2;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1e293b" strokeWidth={5} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
        <text x={cx} y={cx + 4} textAnchor="middle" fontSize={size * 0.22} fontWeight={800} fill={color}>{score}</text>
      </svg>
      <span style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#475569" }}>{label}</span>
    </div>
  );
}

// ── Source tag ────────────────────────────────────────────────────────────────

function SourceTag({ src }: { src: "youtube" | "reddit" | "web" }) {
  const m = {
    youtube: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", label: "▶ Creator" },
    reddit:  { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa", label: "↑ Reddit" },
    web:     { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "⬡ Web" },
  }[src];
  return (
    <span style={{ fontSize: "0.57rem", fontWeight: 800, padding: "1px 6px", borderRadius: 20, background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>
      {m.label}
    </span>
  );
}

// ── Source breakdown ──────────────────────────────────────────────────────────

function SourceBreakdown({ memo }: { memo: IntelligenceMemo }) {
  const sources = [
    { key: "youtube" as const, icon: "▶", label: "Creator",  accent: "#ef4444" },
    { key: "reddit"  as const, icon: "↑", label: "Reddit",   accent: "#f97316" },
    { key: "web"     as const, icon: "⬡", label: "Web",      accent: "#3b82f6" },
  ];

  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Source Signals
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
        {sources.map(({ key, icon, label, accent }) => {
          const data = memo.source_breakdown[key];
          return (
            <div key={key} style={{ background: "white", border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}`, borderRadius: 10, padding: "0.85rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", color: accent }}>{icon}</span>
                <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#0f172a" }}>{label}</span>
                <span style={{ fontSize: "0.6rem", color: "#94a3b8", marginLeft: "auto" }}>{data.count} pts</span>
              </div>
              {data.key_signals.length > 0
                ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {data.key_signals.map((s, i) => (
                      <li key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                        <span style={{ color: accent, fontSize: "0.65rem", paddingTop: 2, flexShrink: 0 }}>›</span>
                        <span style={{ fontSize: "0.72rem", color: "#374151", lineHeight: 1.45 }}>{s}</span>
                      </li>
                    ))}
                  </ul>
                )
                : <p style={{ margin: 0, fontSize: "0.68rem", color: "#94a3b8", fontStyle: "italic" }}>No signals found</p>
              }
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Insight clusters ──────────────────────────────────────────────────────────

const CLUSTER_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

function InsightClusters({ clusters }: { clusters: IntelligenceMemo["insight_clusters"] }) {
  if (!clusters.length) return null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Insight Clusters
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
        {clusters.map((c, ci) => {
          const accent = CLUSTER_COLORS[ci % CLUSTER_COLORS.length];
          return (
            <div key={ci} style={{ background: "white", border: "1px solid #e2e8f0", borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: "0.85rem 1rem" }}>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: accent }}>
                {c.theme}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {c.insights.map((ins, i) => (
                  <li key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                    <span style={{ color: "#94a3b8", fontSize: "0.65rem", paddingTop: 2, flexShrink: 0 }}>•</span>
                    <span style={{ fontSize: "0.74rem", color: "#374151", lineHeight: 1.5 }}>{ins}</span>
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

// ── Priority actions ──────────────────────────────────────────────────────────

function PriorityActions({ actions }: { actions: string[] }) {
  if (!actions.length) return null;
  return (
    <section style={{ background: "#0f172a", borderRadius: 10, padding: "1rem 1.25rem" }}>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569" }}>
        Priority Actions — Do Within 24 Hours
      </h2>
      <ol style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {actions.map((a, i) => (
          <li key={i} style={{ fontSize: "0.78rem", color: "#f1f5f9", lineHeight: 1.55 }}>
            <strong style={{ color: "#a78bfa" }}>#{i + 1}</strong>{" "}{a}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Contradictions ────────────────────────────────────────────────────────────

function Contradictions({ items }: { items: IntelligenceMemo["contradictions"] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Contradictions ({items.length})
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {items.map((c, i) => (
          <div key={i} style={{ background: "white", border: "1px solid #fde68a", borderRadius: 10, padding: "0.85rem 1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "0.65rem" }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "0.55rem 0.7rem" }}>
                <p style={{ margin: "0 0 0.15rem", fontSize: "0.57rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#166534" }}>Claim A</p>
                <p style={{ margin: 0, fontSize: "0.74rem", color: "#166534", lineHeight: 1.45 }}>{c.claim_a}</p>
              </div>
              <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.55rem 0.7rem" }}>
                <p style={{ margin: "0 0 0.15rem", fontSize: "0.57rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#991b1b" }}>Claim B</p>
                <p style={{ margin: 0, fontSize: "0.74rem", color: "#991b1b", lineHeight: 1.45 }}>{c.claim_b}</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.8rem", flexShrink: 0 }}>⚡</span>
              <p style={{ margin: 0, fontSize: "0.72rem", color: "#78350f", lineHeight: 1.5 }}>{c.why_it_matters}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Consensus section ─────────────────────────────────────────────────────────

function ConsensusSection({ consensus }: { consensus: IntelligenceMemo["consensus"] }) {
  const agreeColor = consensus.agreement_score >= 65 ? "#10b981" : consensus.agreement_score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1.1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.65rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
          Consensus Analysis
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
          <div style={{ width: 100, height: 5, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${consensus.agreement_score}%`, height: "100%", background: agreeColor, borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: "0.72rem", fontWeight: 900, color: agreeColor }}>{consensus.agreement_score}% agree</span>
        </div>
      </div>
      {consensus.shared_insights.length > 0 && (
        <div style={{ marginBottom: "0.65rem" }}>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#10b981" }}>All sources agree</p>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {consensus.shared_insights.map((s, i) => (
              <li key={i} style={{ fontSize: "0.74rem", color: "#374151", marginBottom: "0.2rem", lineHeight: 1.5 }}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {consensus.disagreements.length > 0 && (
        <div>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#f59e0b" }}>Points of dispute</p>
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

// ── Agent log ─────────────────────────────────────────────────────────────────

type LogEntry = { source?: string; agent?: string; message: string; count?: number };
const SRC_ICON: Record<string, string> = { youtube: "▶", reddit: "↑", web: "⬡" };
const SRC_COLOR: Record<string, string> = { youtube: "#ef4444", reddit: "#f97316", web: "#3b82f6" };

function AgentLog({ entries, running }: { entries: LogEntry[]; running: boolean }) {
  if (!entries.length && !running) return null;
  return (
    <div style={{ background: "#0f172a", borderRadius: 10, padding: "1rem 1.25rem", minHeight: 64 }}>
      {entries.map((e, i) => {
        const icon = e.source ? SRC_ICON[e.source] ?? "◆" : "◆";
        const color = e.source ? SRC_COLOR[e.source] ?? "#94a3b8" : "#a78bfa";
        return (
          <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginBottom: i < entries.length - 1 ? "0.3rem" : 0 }}>
            <span style={{ color, fontWeight: 800, fontSize: "0.68rem", flexShrink: 0, paddingTop: 2 }}>{icon}</span>
            <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
              <span style={{ color: "#64748b" }}>{e.source ?? e.agent ?? "sys"}</span>{" "}
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

// ── Full report ───────────────────────────────────────────────────────────────

function IntelligenceReport({ memo }: { memo: IntelligenceMemo }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Decision Summary */}
      <div style={{ background: "#0f172a", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
        <p style={{ margin: "0 0 0.6rem", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "#475569" }}>
          Decision Intelligence
        </p>
        <p style={{ margin: "0 0 1rem", fontSize: "0.92rem", color: "#f1f5f9", lineHeight: 1.7, fontWeight: 400 }}>
          {memo.decision_summary}
        </p>
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <ScoreRing score={memo.confidence_score} label="Confidence" />
          <ScoreRing score={memo.consensus.agreement_score} label="Agreement" />
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginLeft: "auto" }}>
            {(["youtube", "reddit", "web"] as const).map(s => (
              <div key={s} style={{ textAlign: "center" }}>
                <p style={{ margin: "0 0 0.1rem", fontSize: "1.1rem", fontWeight: 900, color: SRC_COLOR[s] }}>{memo.evidence_count[s]}</p>
                <SourceTag src={s} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Consensus */}
      <ConsensusSection consensus={memo.consensus} />

      {/* Source Signals */}
      <SourceBreakdown memo={memo} />

      {/* Insight Clusters */}
      <InsightClusters clusters={memo.insight_clusters} />

      {/* Stage-Based Playbook */}
      <StageActions rec={memo.decision_recommendation} />

      {/* Priority Actions */}
      <PriorityActions actions={memo.decision_recommendation.priority_actions} />

      {/* Contradictions */}
      <Contradictions items={memo.contradictions} />

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
          Decision intelligence from creators, Reddit practitioners, and web articles — not summarization.
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
            <button type="button" onClick={() => { setMemo(null); setLog([]); setError(null); }}
              style={{ padding: "0.3rem 0.75rem", fontSize: "0.68rem", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", cursor: "pointer" }}>
              ← New Query
            </button>
          </div>
          <IntelligenceReport memo={memo} />
        </>
      )}
    </div>
  );
}
