"use client";

import { useEffect, useRef, useState } from "react";
import type { SavedAnalysis } from "@/lib/client-types";

function youtubeWatchUrl(videoId: string, time?: string): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  if (!time) return base;
  const parts = time.split(":").map(Number);
  let seconds = 0;
  if (parts.length === 2) seconds = parts[0]! * 60 + parts[1]!;
  else if (parts.length === 3) seconds = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return `${base}&t=${seconds}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatViews(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B views`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K views`;
  return `${n.toLocaleString()} views`;
}

function clickbaitMeta(score: number) {
  if (score <= 3) return { label: "Accurate", colorClass: "score-ok", barColor: "var(--ok)" };
  if (score <= 6) return { label: "Sensationalized", colorClass: "score-mid", barColor: "var(--warn)" };
  return { label: "High Clickbait", colorClass: "score-high", barColor: "var(--danger)" };
}

/* ── Email Button ── */
const EMAIL_KEY = "watchfilter_email";
type EmailState = "idle" | "open" | "sending" | "sent" | "error";

function EmailButton({ analysisId }: { analysisId: string }) {
  const [state, setState] = useState<EmailState>("idle");
  const [email, setEmail] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(EMAIL_KEY) ?? "") : ""
  );
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function open() { setState("open"); setTimeout(() => inputRef.current?.focus(), 50); }

  async function send() {
    if (!email.trim()) return;
    localStorage.setItem(EMAIL_KEY, email.trim());
    setState("sending");
    try {
      const res = await fetch("/api/email-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send.");
      setState("sent");
      setTimeout(() => setState("idle"), 4000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to send.");
      setState("error");
      setTimeout(() => setState("open"), 3000);
    }
  }

  if (state === "idle")
    return <button onClick={open} className="btn-email">📧 Email Briefing</button>;
  if (state === "sent")
    return <span className="email-feedback email-feedback--ok">✅ Sent to {email}</span>;
  if (state === "error")
    return <span className="email-feedback email-feedback--err">❌ {errorMsg}</span>;

  return (
    <div className="email-form">
      <input
        ref={inputRef} type="email" placeholder="you@example.com"
        value={email} onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === "Enter" && send()}
        disabled={state === "sending"} className="email-input"
      />
      <button onClick={send} disabled={state === "sending" || !email.trim()} className="btn btn-primary">
        {state === "sending" ? <span className="spinner" /> : "Send"}
      </button>
      <button onClick={() => setState("idle")} disabled={state === "sending"} className="btn btn-ghost">✕</button>
    </div>
  );
}

/* ── Data point types ── */
type DataPoint =
  | { metric_title: string; speaker_thesis: string; strategic_intent: string; causal_chain: string; direct_quote: string; metric_context_example?: string; credibility_check: string; exact_timestamp: string }
  | { metric_title: string; speaker_thesis: string; causal_chain: string; direct_quote: string; metric_context_example?: string; credibility_check: string; exact_timestamp: string }
  | { metric_title: string; causal_chain: string; direct_quote: string; metric_context_example?: string; credibility_check: string; exact_timestamp: string }
  | { metric_title: string; speaker_thesis: string; direct_quote: string; exact_timestamp: string }
  | { metric_value: string; metric_context: string; root_cause: string }
  | { metric: string; root_cause: string }
  | string;

type ResolvedPoint = {
  title: string;
  speakerThesis: string | null;
  strategicIntent: string | null;
  causalChain: string | null;
  quote: string | null;
  contextExample: string | null;
  credibilityCheck: string | null;
  timestamp: string | null;
};

function resolveDataPoint(point: DataPoint): ResolvedPoint {
  if (typeof point === "string")
    return { title: point, speakerThesis: null, strategicIntent: null, causalChain: null, quote: null, contextExample: null, credibilityCheck: null, timestamp: null };
  if ("causal_chain" in point && "speaker_thesis" in point) {
    const intent = "strategic_intent" in point ? point.strategic_intent : null;
    const ctx = "metric_context_example" in point ? (point.metric_context_example ?? null) : null;
    return { title: point.metric_title, speakerThesis: point.speaker_thesis, strategicIntent: intent, causalChain: point.causal_chain, quote: point.direct_quote, contextExample: ctx, credibilityCheck: point.credibility_check, timestamp: point.exact_timestamp };
  }
  if ("causal_chain" in point) {
    const ctx = "metric_context_example" in point ? (point.metric_context_example ?? null) : null;
    return { title: point.metric_title, speakerThesis: null, strategicIntent: null, causalChain: point.causal_chain, quote: point.direct_quote, contextExample: ctx, credibilityCheck: point.credibility_check, timestamp: point.exact_timestamp };
  }
  if ("speaker_thesis" in point)
    return { title: point.metric_title, speakerThesis: point.speaker_thesis, strategicIntent: null, causalChain: null, quote: point.direct_quote, contextExample: null, credibilityCheck: null, timestamp: point.exact_timestamp };
  if ("metric_context" in point)
    return { title: `${point.metric_context} — ${point.metric_value}`, speakerThesis: null, strategicIntent: null, causalChain: point.root_cause, quote: null, contextExample: null, credibilityCheck: null, timestamp: null };
  return { title: point.metric, speakerThesis: null, strategicIntent: null, causalChain: point.root_cause, quote: null, contextExample: null, credibilityCheck: null, timestamp: null };
}

function CausalChain({ text }: { text: string }) {
  const steps = text.split(/\s*→\s*|\s*->\s*/).map(s => s.trim()).filter(Boolean);
  if (steps.length <= 1) return <p className="av-thesis">{text}</p>;
  return (
    <p className="av-causal-chain">
      {steps.flatMap((step, i) => [
        <span key={`s${i}`} className="av-causal-step">{step}</span>,
        i < steps.length - 1 ? <span key={`a${i}`} className="av-causal-arrow">→</span> : null,
      ])}
    </p>
  );
}

/* ── Metric Card ── */
function MetricCard({
  point,
  videoId,
  defaultOpen,
}: {
  point: DataPoint;
  videoId: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { title, speakerThesis, strategicIntent, causalChain, quote, contextExample, credibilityCheck, timestamp } = resolveDataPoint(point);
  const hasBody = !!(speakerThesis || strategicIntent || causalChain || quote || contextExample || credibilityCheck);

  return (
    <div className={`av-metric-card${open ? " av-metric-card--open" : ""}`}>
      <button
        onClick={() => hasBody && setOpen(o => !o)}
        aria-expanded={open}
        className="av-metric-header"
      >
        <p className="av-metric-title">{title}</p>

        {(timestamp || hasBody) && (
          <div className="av-metric-footer">
            {timestamp && (
              <a
                href={youtubeWatchUrl(videoId, timestamp)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="av-ts-badge"
              >
                ▶ {timestamp}
              </a>
            )}
            {hasBody && (
              <svg
                className={`av-chevron${open ? " av-chevron--open" : ""}`}
                style={{ marginLeft: "auto" }}
                width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden
              >
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        )}
      </button>

      {hasBody && (
        <div className={`av-drawer${open ? " av-drawer--open" : ""}`}>
          <div className="av-drawer-inner">
            <div className="av-drawer-bg">

              {quote && (
                <div className="av-tier">
                  <p className="av-tier-label">
                    <svg width="13" height="10" viewBox="0 0 13 10" fill="currentColor" aria-hidden>
                      <path d="M0 10V6.2C0 3.7 1.4 1.7 4.3.4L5.1 2C3.3 2.8 2.4 4 2.3 5.6H4.8V10H0zm7.2 0V6.2c0-2.5 1.4-4.5 4.3-5.8L12.3 2c-1.8.8-2.7 2-2.8 3.6H12V10H7.2z" />
                    </svg>
                    Direct Quote
                  </p>
                  <blockquote className="av-blockquote">"{quote}"</blockquote>
                </div>
              )}

              {speakerThesis && (
                <div className="av-tier">
                  <p className="av-tier-label">Speaker Narrative</p>
                  <p className="av-speaker-thesis">{speakerThesis}</p>
                </div>
              )}

              {strategicIntent && (
                <div className="av-tier">
                  <p className="av-tier-label">🎯 Strategic Intent</p>
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3.5 mt-2 text-[#4f6d7a] text-sm leading-relaxed">
                    {strategicIntent}
                  </div>
                </div>
              )}

              {causalChain && (
                <div className="av-tier">
                  <p className="av-tier-label">Causal Chain</p>
                  <CausalChain text={causalChain} />
                </div>
              )}

              {contextExample && (
                <div className="av-tier">
                  <p className="av-tier-label">💡 Context &amp; Real-World Illustration</p>
                  <div className="av-context-example">{contextExample}</div>
                </div>
              )}

              {credibilityCheck && (
                <div className="av-tier">
                  <p className="av-tier-label av-tier-label--amber">⚖ Credibility Check</p>
                  <p className="av-credibility">{credibilityCheck}</p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Worth-Watching Card ── */
type WorthWatching = NonNullable<SavedAnalysis["worth_watching"]>;

function wwScoreColor(score: number): string {
  if (score >= 8) return "var(--ok)";
  if (score >= 6) return "#84cc16";
  if (score >= 4) return "var(--warn)";
  return "var(--danger)";
}

function wwBarColor(value: number, invert = false): string {
  const effective = invert ? 11 - value : value;
  if (effective >= 8) return "var(--ok)";
  if (effective >= 6) return "#84cc16";
  if (effective >= 4) return "var(--warn)";
  return "var(--danger)";
}

const WW_DIMS: { key: keyof WorthWatching; label: string; invert?: boolean }[] = [
  { key: "educational_value", label: "Educational" },
  { key: "uniqueness", label: "Uniqueness" },
  { key: "practicality", label: "Practical" },
  { key: "fluff_ratio", label: "Fluff", invert: true },
  { key: "time_sensitivity", label: "Urgency" },
];

function timestampToSeconds(t: string): number {
  const parts = t.split(":").map(Number);
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return parts[0]! * 60 + (parts[1] ?? 0);
}

function WorthWatchingCard({
  ww,
  videoId,
  dataPointCount,
  takeawayCount,
}: {
  ww: WorthWatching;
  videoId: string;
  dataPointCount?: number;
  takeawayCount?: number;
}) {
  const color = wwScoreColor(ww.score);
  const skipTo = ww.skip_to && timestampToSeconds(ww.skip_to) >= 30 ? ww.skip_to : null;
  const worthIt = ww.score >= 6;
  const signalQuality = ww.score >= 8 ? "High" : ww.score >= 6 ? "Medium" : "Low";
  const signalColor = ww.score >= 8 ? "var(--ok)" : ww.score >= 6 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="av-ww-card">
      {/* WATCHFILTER VERDICT banner */}
      <div className="av-verdict-banner" style={{ borderColor: worthIt ? "var(--ok)" : "var(--danger)" }}>
        <div className="av-verdict-banner__left">
          <span className="av-verdict-banner__label">WATCHFILTER VERDICT</span>
          <span className="av-verdict-banner__decision" style={{ color: worthIt ? "var(--ok)" : "var(--danger)" }}>
            Worth Watching: {worthIt ? "YES" : "NO"}
          </span>
        </div>
        <div className="av-verdict-banner__right">
          <span className="av-verdict-banner__signal-label">Signal Quality</span>
          <span className="av-verdict-banner__signal" style={{ color: signalColor }}>{signalQuality}</span>
        </div>
      </div>

      {/* Evidence summary */}
      {(dataPointCount !== undefined || takeawayCount !== undefined) && (
        <div className="av-verdict-evidence">
          {dataPointCount !== undefined && dataPointCount > 0 && (
            <span className="av-verdict-evidence__item">{dataPointCount} hard data points</span>
          )}
          {takeawayCount !== undefined && takeawayCount > 0 && (
            <span className="av-verdict-evidence__item">{takeawayCount} actionable insights</span>
          )}
        </div>
      )}

      <div className="av-ww-top">
        <div className="av-ww-score">
          <span className="av-ww-num" style={{ color }}>{ww.score.toFixed(1)}</span>
          <span className="av-ww-denom">/10</span>
        </div>
        <p className="av-ww-verdict">{ww.verdict}</p>
      </div>

      {skipTo && (
        <a
          href={youtubeWatchUrl(videoId, skipTo)}
          target="_blank"
          rel="noopener noreferrer"
          className="av-ww-skip"
        >
          ⏩ Skip to good part · {skipTo}
        </a>
      )}

      <div className="av-ww-bars">
        {WW_DIMS.map(({ key, label, invert }) => {
          const raw = ww[key] as number;
          const displayPct = (raw / 10) * 100;
          const barColor = wwBarColor(raw, invert);
          return (
            <div key={key} className="av-ww-bar-row">
              <span className="av-ww-bar-label">{label}</span>
              <div className="av-ww-bar-track">
                <div
                  className="av-ww-bar-fill"
                  style={{ width: `${displayPct}%`, background: barColor }}
                />
              </div>
              <span className="av-ww-bar-val">{raw}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Enhance Button — auto-fires on mount, regenerates audio after backfill ── */
type EnhanceState = "idle" | "loading" | "done" | "error";

function EnhanceButton({ analysisId, onRefresh }: { analysisId: string; onRefresh: () => void }) {
  const [state, setState] = useState<EnhanceState>("idle");
  const ranRef = useRef(false);

  async function enhance() {
    if (ranRef.current) return;
    ranRef.current = true;
    setState("loading");
    try {
      // 1. Backfill: generates nuggets + context examples
      const res = await fetch(`/api/backfill/${analysisId}`, { method: "POST" });
      if (!res.ok) throw new Error("Backfill failed");

      // 2. Regenerate audio so nuggets are included in the briefing
      await fetch("/api/regenerate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, voice: "onyx" }),
      }).catch(() => { /* audio regen is best-effort */ });

      setState("done");
      onRefresh();
    } catch {
      ranRef.current = false; // allow retry on manual click
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  // Auto-trigger silently on mount — no user action needed
  useEffect(() => { void enhance(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "done") return null;
  return (
    <button
      onClick={() => void enhance()}
      disabled={state === "loading"}
      className="btn-enhance"
    >
      {state === "loading" ? <><span className="spinner" /> Enhancing…</> : state === "error" ? "❌ Failed — retry" : "✨ Enhance Report"}
    </button>
  );
}

/* ── Main Component ── */
export function AnalysisView({ analysis, onRefresh }: {
  analysis: SavedAnalysis;
  onRefresh?: () => void;
}) {
  const needsEnhancement = !analysis.off_script_nuggets?.length;
  const displayTitle = analysis.title ?? `Video ${analysis.videoId}`;
  const { label: cbLabel, colorClass, barColor } = clickbaitMeta(analysis.clickbait_score);

  return (
    <>
    <article className="av-root">

      {/* ── Header Card ── */}
      <div className="av-header-card">
        <h2 className="av-title">
          <a href={analysis.youtubeUrl} target="_blank" rel="noopener noreferrer">
            {displayTitle}
          </a>
        </h2>

        {(analysis.channelName || analysis.viewCount != null || analysis.uploadDate) && (
          <div className="av-video-meta">
            {analysis.channelName && (
              <span className="av-video-meta__channel">{analysis.channelName}</span>
            )}
            {analysis.viewCount != null && (
              <span className="av-video-meta__item">{formatViews(analysis.viewCount)}</span>
            )}
            {analysis.uploadDate && (
              <span className="av-video-meta__item">{formatUploadDate(analysis.uploadDate)}</span>
            )}
          </div>
        )}

        <div className="av-score-section">
          <p className="av-score-key">Clickbait Score</p>
          <div className="av-score-top">
            <span className={`av-score-num ${colorClass}`}>{analysis.clickbait_score}/10</span>
            <span className={`av-score-label ${colorClass}`}>{cbLabel}</span>
          </div>
          <div className="av-score-track">
            <div className="av-score-fill" style={{ width: `${analysis.clickbait_score * 10}%`, background: barColor }} />
          </div>
        </div>

        <div className="av-snapshot-row">
          <div className="av-snapshot-item av-snapshot-item--wide">
            <span className="av-snapshot-key">Primary Subject</span>
            <span className="av-snapshot-val">{analysis.primary_subject}</span>
          </div>
          <div className="av-snapshot-item">
            <span className="av-snapshot-key">Data Density</span>
            <span className="av-snapshot-val">{analysis.hard_data_points.length} metrics</span>
          </div>
        </div>

        {analysis.worth_watching && (
          <div>
            <WorthWatchingCard
              ww={analysis.worth_watching}
              videoId={analysis.videoId}
              dataPointCount={analysis.hard_data_points.length}
              takeawayCount={analysis.actionable_takeaways.length}
            />
          </div>
        )}

        <div className="av-controls-row">
          <EmailButton analysisId={analysis.id} />
          {needsEnhancement && onRefresh && (
            <EnhanceButton analysisId={analysis.id} onRefresh={onRefresh} />
          )}
        </div>
      </div>

      {/* ── Metrics Grid ── */}
      {analysis.hard_data_points.length > 0 && (
        <section className="av-section">
          <p className="av-section-label">📊 Hard Data &amp; Analysis</p>
          <div className="av-metrics-grid">
            {analysis.hard_data_points.map((point, i) => (
              <MetricCard key={i} point={point} videoId={analysis.videoId} defaultOpen={i === 0} />
            ))}
          </div>
        </section>
      )}

      {/* ── Off-Script Golden Nuggets ── */}
      {analysis.off_script_nuggets && analysis.off_script_nuggets.length > 0 && (
        <section className="av-section">
          <p className="av-section-label">🧠 Off-Script Golden Nuggets</p>
          <div className="av-nuggets">
            <ul className="av-nuggets__list">
              {analysis.off_script_nuggets.map((nugget, i) => (
                <li key={i} className="av-nuggets__item">{nugget}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Tactical Playbook ── */}
      <section className="av-section">
        <p className="av-section-label">🚀 Tactical Playbook</p>
        <div className="av-playbook">
          {analysis.actionable_takeaways.map((takeaway, index) => {
            const strategy = typeof takeaway === "string" ? takeaway : takeaway.strategy;
            const steps = typeof takeaway === "string" ? [] : (takeaway.execution_steps ?? []);
            const ts = analysis.timestamps.find(t => t.takeaway_index === index);
            return (
              <div key={index} className="av-playbook-item">
                <p className="av-playbook-num">Priority {index + 1}</p>
                <p className="av-playbook-strategy">{strategy}</p>
                {steps.length > 0 && (
                  <ul className="av-playbook-steps">
                    {steps.map((step, si) => (
                      <li key={si} className="av-playbook-step">
                        <span className="av-step-arrow">→</span>
                        {step}
                      </li>
                    ))}
                  </ul>
                )}
                {ts && (
                  <a
                    href={youtubeWatchUrl(analysis.videoId, ts.time)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="av-ts-pill"
                  >
                    <span className="av-ts-pill__time">▶ {ts.time}</span>
                    {ts.label && <span className="av-ts-pill__label">{ts.label}</span>}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Timestamp Index ── */}
      {analysis.timestamps.length > 0 && (
        <section className="av-section">
          <p className="av-section-label">⏱️ Timestamp Index</p>
          <div className="av-ts-index">
            {analysis.timestamps.map((ts, i) => {
              const takeaway = analysis.actionable_takeaways[ts.takeaway_index];
              const label =
                ts.label || (typeof takeaway === "string" ? takeaway : takeaway?.strategy) || "";
              return (
                <a
                  key={i}
                  href={youtubeWatchUrl(analysis.videoId, ts.time)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="av-ts-pill"
                >
                  <span className="av-ts-pill__time">▶ {ts.time}</span>
                  {label && <span className="av-ts-pill__label">{label}</span>}
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="av-footer">
        <span>Saved {formatDate(analysis.createdAt)}</span>
        <span>Source: {analysis.transcriptSource}</span>
        <span>{analysis.transcriptCharCount.toLocaleString()} transcript chars</span>
        <span style={{ marginLeft: "auto" }}>
          <EmailButton analysisId={analysis.id} />
        </span>
      </footer>

    </article>
    </>
  );
}
