"use client";

import { useState, useRef, useCallback } from "react";
import type { IntelligenceMemo, SourceCitation } from "@/app/api/intelligence/query/route";

// ── Source type badge ─────────────────────────────────────────────────────────

function SourceBadge({ type }: { type: SourceCitation["source_type"] }) {
  const meta = {
    youtube: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", label: "▶ Creator" },
    reddit:  { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa", label: "↑ Reddit" },
    web:     { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "⬡ Web" },
  };
  const m = meta[type] ?? meta.web;
  return (
    <span style={{ fontSize: "0.57rem", fontWeight: 800, padding: "1px 6px", borderRadius: 20, background: m.bg, border: `1px solid ${m.border}`, color: m.color, flexShrink: 0 }}>
      {m.label}
    </span>
  );
}

// ── Claim card ────────────────────────────────────────────────────────────────

function ClaimCard({ c, accent }: { c: SourceCitation; accent?: string }) {
  return (
    <div style={{ background: "white", border: `1px solid ${accent ?? "#e2e8f0"}`, borderLeft: `3px solid ${accent ?? "#6366f1"}`, borderRadius: 8, padding: "0.6rem 0.85rem" }}>
      <p style={{ margin: "0 0 0.3rem", fontSize: "0.78rem", color: "#1e293b", lineHeight: 1.5 }}>{c.text}</p>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
        <SourceBadge type={c.source_type} />
        <span style={{ fontSize: "0.62rem", color: "#94a3b8" }}>{c.source_label}</span>
        {c.score != null && (
          <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>↑ {c.score}</span>
        )}
        {c.url && (
          <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.6rem", color: "#6366f1", marginLeft: "auto" }}>
            ↗ source
          </a>
        )}
      </div>
    </div>
  );
}

// ── Confidence ring ───────────────────────────────────────────────────────────

function ConfidenceRing({ score }: { score: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <svg width={64} height={64} viewBox="0 0 64 64">
        <circle cx={32} cy={32} r={r} fill="none" stroke="#f1f5f9" strokeWidth={6} />
        <circle cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 32 32)" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
        <text x={32} y={37} textAnchor="middle" fontSize={13} fontWeight={800} fill={color}>{score}</text>
      </svg>
      <div>
        <p style={{ margin: "0 0 0.1rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>Confidence Score</p>
        <p style={{ margin: 0, fontSize: "0.78rem", color: "#374151" }}>
          {score >= 75 ? "High confidence — broad evidence base"
            : score >= 50 ? "Moderate confidence — mixed or limited sources"
            : "Low confidence — sparse or single-source evidence"}
        </p>
      </div>
    </div>
  );
}

// ── Consensus bar ─────────────────────────────────────────────────────────────

function ConsensusBar({ score }: { score: number }) {
  const color = score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#374151" }}>Cross-source consensus</span>
        <span style={{ fontSize: "0.72rem", fontWeight: 900, color }}>{score}%</span>
      </div>
      <div style={{ height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ── Source tabs ───────────────────────────────────────────────────────────────

type SourceTab = "creators" | "reddit" | "web";

function SourcePanel({ memo }: { memo: IntelligenceMemo }) {
  const [tab, setTab] = useState<SourceTab>("creators");

  const tabs: Array<{ id: SourceTab; label: string; count: number }> = [
    { id: "creators", label: "▶ Creators", count: memo.evidence_count.youtube },
    { id: "reddit",   label: "↑ Reddit",   count: memo.evidence_count.reddit },
    { id: "web",      label: "⬡ Web",       count: memo.evidence_count.web },
  ];

  return (
    <section>
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Source Evidence
      </h2>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            style={{ padding: "0.4rem 0.9rem", fontSize: "0.72rem", fontWeight: 700, borderRadius: 8, border: `1px solid ${tab === t.id ? "#6366f1" : "#e2e8f0"}`, background: tab === t.id ? "#6366f1" : "white", color: tab === t.id ? "white" : "#64748b", cursor: "pointer" }}>
            {t.label} <span style={{ opacity: 0.7, fontSize: "0.65rem" }}>({t.count})</span>
          </button>
        ))}
      </div>

      {/* Creator panel */}
      {tab === "creators" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {memo.creator_perspective.key_claims.length === 0
            ? <p style={{ fontSize: "0.78rem", color: "#94a3b8", fontStyle: "italic" }}>No creator evidence indexed for this query. Analyze relevant videos first.</p>
            : memo.creator_perspective.key_claims.map((c, i) => <ClaimCard key={i} c={c} accent="#fca5a5" />)
          }
        </div>
      )}

      {/* Reddit panel */}
      {tab === "reddit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {memo.reddit_perspective.pain_points.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.4rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#ef4444" }}>Pain Points</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {memo.reddit_perspective.pain_points.map((c, i) => <ClaimCard key={i} c={c} accent="#fca5a5" />)}
              </div>
            </div>
          )}
          {memo.reddit_perspective.success_stories.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.4rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#10b981" }}>Success Stories</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {memo.reddit_perspective.success_stories.map((c, i) => <ClaimCard key={i} c={c} accent="#86efac" />)}
              </div>
            </div>
          )}
          {memo.reddit_perspective.key_opinions.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.4rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>Practitioner Opinions</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {memo.reddit_perspective.key_opinions.map((c, i) => <ClaimCard key={i} c={c} accent="#e2e8f0" />)}
              </div>
            </div>
          )}
          {memo.reddit_perspective.pain_points.length === 0 && memo.reddit_perspective.success_stories.length === 0 && memo.reddit_perspective.key_opinions.length === 0 && (
            <p style={{ fontSize: "0.78rem", color: "#94a3b8", fontStyle: "italic" }}>No Reddit evidence found for this query.</p>
          )}
        </div>
      )}

      {/* Web panel */}
      {tab === "web" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {memo.web_perspective.statistics.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.4rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6366f1" }}>Statistics & Data</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {memo.web_perspective.statistics.map((c, i) => <ClaimCard key={i} c={c} accent="#c7d2fe" />)}
              </div>
            </div>
          )}
          {memo.web_perspective.key_claims.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.4rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>Article Claims</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {memo.web_perspective.key_claims.map((c, i) => <ClaimCard key={i} c={c} accent="#bfdbfe" />)}
              </div>
            </div>
          )}
          {memo.web_perspective.statistics.length === 0 && memo.web_perspective.key_claims.length === 0 && (
            <p style={{ fontSize: "0.78rem", color: "#94a3b8", fontStyle: "italic" }}>No web article evidence found. Add TAVILY_API_KEY to enable web search.</p>
          )}
        </div>
      )}
    </section>
  );
}

// ── Agent log ─────────────────────────────────────────────────────────────────

type LogEntry = { source?: string; agent?: string; message: string; count?: number; ts: number };

const SOURCE_ICONS: Record<string, string> = { youtube: "▶", reddit: "↑", web: "⬡" };
const SOURCE_COLORS: Record<string, string> = { youtube: "#ef4444", reddit: "#f97316", web: "#3b82f6" };

function AgentLog({ entries, running }: { entries: LogEntry[]; running: boolean }) {
  return (
    <div style={{ background: "#0f172a", borderRadius: 10, padding: "1rem 1.25rem", minHeight: 80 }}>
      {entries.map((e, i) => {
        const icon = e.source ? SOURCE_ICONS[e.source] ?? "◆" : "◆";
        const color = e.source ? SOURCE_COLORS[e.source] ?? "#94a3b8" : "#a78bfa";
        return (
          <div key={i} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", marginBottom: i < entries.length - 1 ? "0.35rem" : 0 }}>
            <span style={{ color, fontWeight: 800, fontSize: "0.7rem", flexShrink: 0, paddingTop: 2 }}>{icon}</span>
            <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
              {e.source ?? e.agent ?? "System"}{" "}
              <span style={{ color: "#e2e8f0" }}>{e.message}</span>
              {e.count != null && <span style={{ color: "#6366f1", fontWeight: 700 }}> ({e.count})</span>}
            </span>
          </div>
        );
      })}
      {running && (
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: entries.length > 0 ? "0.5rem" : 0 }}>
          <span className="spinner" style={{ borderTopColor: "#6366f1" }} />
          <span style={{ fontSize: "0.68rem", color: "#64748b" }}>Working…</span>
        </div>
      )}
    </div>
  );
}

// ── Main intelligence report ──────────────────────────────────────────────────

function IntelligenceReport({ memo }: { memo: IntelligenceMemo }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Executive Summary */}
      <div style={{ background: "#0f172a", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "#475569" }}>
          Decision Intelligence
        </p>
        <p style={{ margin: "0 0 1rem", fontSize: "0.92rem", color: "#f1f5f9", lineHeight: 1.65, fontWeight: 400 }}>
          {memo.executive_summary}
        </p>
        <ConfidenceRing score={memo.confidence_score} />
      </div>

      {/* Evidence counts */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        {[
          { label: "Creator Points", value: memo.evidence_count.youtube, color: "#ef4444" },
          { label: "Reddit Claims", value: memo.evidence_count.reddit, color: "#f97316" },
          { label: "Web Articles", value: memo.evidence_count.web, color: "#3b82f6" },
        ].map(s => (
          <div key={s.label} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.6rem 0.9rem", flex: "1 1 100px" }}>
            <p style={{ margin: "0 0 0.1rem", fontSize: "0.57rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: "1.3rem", fontWeight: 900, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Consensus */}
      <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1rem 1.25rem" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
          Consensus Analysis
        </h2>
        <ConsensusBar score={memo.consensus.overall_score} />
        {memo.consensus.main_finding && (
          <p style={{ margin: "0.75rem 0 0.5rem", fontSize: "0.82rem", fontWeight: 600, color: "#0f172a" }}>
            {memo.consensus.main_finding}
          </p>
        )}
        {memo.consensus.agreement_areas.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            <p style={{ margin: "0 0 0.35rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#10b981" }}>Where sources agree</p>
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {memo.consensus.agreement_areas.map((a, i) => (
                <li key={i} style={{ fontSize: "0.76rem", color: "#374151", marginBottom: "0.2rem" }}>{a}</li>
              ))}
            </ul>
          </div>
        )}
        {memo.consensus.disagreement_areas.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            <p style={{ margin: "0 0 0.35rem", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#f59e0b" }}>Where sources diverge</p>
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {memo.consensus.disagreement_areas.map((a, i) => (
                <li key={i} style={{ fontSize: "0.76rem", color: "#374151", marginBottom: "0.2rem" }}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Source Evidence Tabs */}
      <SourcePanel memo={memo} />

      {/* Contradictions */}
      {memo.contradictions.length > 0 && (
        <section>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
            Contradictions ({memo.contradictions.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {memo.contradictions.map((c, i) => (
              <div key={i} style={{ background: "white", border: "1px solid #fde68a", borderRadius: 10, padding: "0.85rem 1rem" }}>
                <p style={{ margin: "0 0 0.6rem", fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#b45309" }}>
                  ⚡ {c.topic}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.6rem" }}>
                  <ClaimCard c={c.claim_a} />
                  <ClaimCard c={c.claim_b} />
                </div>
                <p style={{ margin: 0, fontSize: "0.74rem", color: "#78350f", fontStyle: "italic", lineHeight: 1.5 }}>
                  {c.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Actionable Insights */}
      {memo.actionable_insights.length > 0 && (
        <section style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "1rem 1.25rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#166534" }}>
            Actionable Insights
          </h2>
          <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {memo.actionable_insights.map((insight, i) => (
              <li key={i} style={{ fontSize: "0.78rem", color: "#166534", lineHeight: 1.6, marginBottom: "0.35rem" }}>
                {insight}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

// ── Example queries ───────────────────────────────────────────────────────────

const EXAMPLE_QUERIES = [
  "Best customer acquisition strategies for AI startups",
  "Should SaaS founders build in public?",
  "How do AI startups get their first 100 customers?",
  "What do experts think about cold outreach vs content marketing?",
  "Is SEO worth it for early-stage B2B SaaS?",
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

      if (!res.ok || !res.body) {
        setError("Request failed. Try again.");
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const chunk of lines) {
          const data = chunk.replace(/^data: /, "");
          if (!data.trim()) continue;
          try {
            const payload = JSON.parse(data) as { type: string; source?: string; agent?: string; message?: string; count?: number; memo?: IntelligenceMemo };
            if (payload.type === "stage") {
              setLog(prev => [...prev, { source: payload.source, agent: payload.agent, message: payload.message ?? "", count: payload.count, ts: Date.now() }]);
            } else if (payload.type === "complete" && payload.memo) {
              setMemo(payload.memo);
            } else if (payload.type === "error") {
              setError(payload.message ?? "Unknown error");
            }
          } catch { /* malformed chunk */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Request failed");
      }
    } finally {
      setRunning(false);
    }
  }, [running]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(query);
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.35rem", fontWeight: 900, color: "#0f172a" }}>
          WatchFilter Intelligence
        </h1>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
          Ask a question. Get synthesized decision intelligence from creators, Reddit practitioners, and web articles.
        </p>
      </div>

      {/* Search input */}
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g. Best customer acquisition strategies for AI startups"
            disabled={running}
            style={{ flex: 1, padding: "0.7rem 1rem", fontSize: "0.88rem", borderRadius: 10, border: "1.5px solid #e2e8f0", outline: "none", color: "#0f172a", background: running ? "#f8fafc" : "white" }}
          />
          <button
            type="submit"
            disabled={running || !query.trim()}
            style={{ padding: "0.7rem 1.4rem", fontSize: "0.85rem", fontWeight: 700, borderRadius: 10, border: "none", background: running || !query.trim() ? "#e2e8f0" : "#6366f1", color: running || !query.trim() ? "#94a3b8" : "white", cursor: running || !query.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
          >
            {running ? "Searching…" : "Ask Intelligence →"}
          </button>
        </div>
      </form>

      {/* Example queries */}
      {!memo && !running && log.length === 0 && (
        <div>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>
            Try these
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {EXAMPLE_QUERIES.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => { setQuery(q); void run(q); }}
                style={{ padding: "0.4rem 0.8rem", fontSize: "0.72rem", borderRadius: 20, border: "1px solid #e2e8f0", background: "white", color: "#374151", cursor: "pointer" }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Agent log (shown while running or after) */}
      {(running || log.length > 0) && !memo && (
        <AgentLog entries={log} running={running} />
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "0.75rem 1rem", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "#991b1b" }}>{error}</p>
        </div>
      )}

      {/* Results */}
      {memo && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <p style={{ margin: 0, fontSize: "0.72rem", color: "#64748b" }}>
              Query: <strong style={{ color: "#0f172a" }}>"{memo.query}"</strong>
            </p>
            <button
              type="button"
              onClick={() => { setMemo(null); setLog([]); setError(null); }}
              style={{ padding: "0.35rem 0.8rem", fontSize: "0.7rem", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", cursor: "pointer" }}
            >
              ← New Query
            </button>
          </div>
          <IntelligenceReport memo={memo} />
        </>
      )}
    </div>
  );
}
