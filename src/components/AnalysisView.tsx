"use client";

import { useEffect, useRef, useState } from "react";
import type { SavedAnalysis } from "@/lib/client-types";
import { track } from "@/lib/analytics";

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

type SignalStrength = "Very High" | "High" | "Medium" | "Low";
type VerificationStatus = "Verified" | "Partially Verified" | "Unverified" | "Opinion" | "Speculation";

type ResolvedPoint = {
  title: string;
  speakerThesis: string | null;
  strategicIntent: string | null;
  causalChain: string | null;
  quote: string | null;
  contextExample: string | null;
  credibilityCheck: string | null;
  timestamp: string | null;
  whyItMatters: string | null;
  actionableTakeaway: string | null;
  signalStrength: SignalStrength | null;
  signalReason: string | null;
  verificationStatus: VerificationStatus | null;
  verificationReason: string | null;
  viewerBlindSpot: string | null;
  secondOrderImplications: string | null;
  contrarianView: string | null;
  opportunityPotential: number | null;
  opportunityReason: string | null;
};

const EMPTY_RESOLVED: ResolvedPoint = {
  title: "", speakerThesis: null, strategicIntent: null, causalChain: null,
  quote: null, contextExample: null, credibilityCheck: null, timestamp: null,
  whyItMatters: null, actionableTakeaway: null, signalStrength: null,
  signalReason: null, verificationStatus: null, verificationReason: null,
  viewerBlindSpot: null, secondOrderImplications: null, contrarianView: null,
  opportunityPotential: null, opportunityReason: null,
};

function resolveDataPoint(point: DataPoint): ResolvedPoint {
  if (typeof point === "string") return { ...EMPTY_RESOLVED, title: point };

  // All metric_title shapes — handled generically to support both old and new field sets
  if ("metric_title" in point) {
    const p = point as Record<string, unknown>;
    return {
      title:                   String(p.metric_title ?? ""),
      speakerThesis:           (p.speaker_thesis as string | undefined) ?? null,
      strategicIntent:         (p.strategic_intent as string | undefined) ?? null,
      causalChain:             (p.causal_chain as string | undefined) ?? null,
      quote:                   (p.direct_quote as string | undefined) ?? null,
      contextExample:          (p.metric_context_example as string | undefined) ?? null,
      credibilityCheck:        (p.credibility_check as string | undefined) ?? null,
      timestamp:               (p.exact_timestamp as string | undefined) ?? null,
      whyItMatters:            (p.why_it_matters as string | undefined) ?? null,
      actionableTakeaway:      (p.actionable_takeaway as string | undefined) ?? null,
      signalStrength:          (p.signal_strength as SignalStrength | undefined) ?? null,
      signalReason:            (p.signal_reason as string | undefined) ?? null,
      verificationStatus:      (p.verification_status as VerificationStatus | undefined) ?? null,
      verificationReason:      (p.verification_reason as string | undefined) ?? null,
      viewerBlindSpot:         (p.viewer_blind_spot as string | undefined) ?? null,
      secondOrderImplications: (p.second_order_implications as string | undefined) ?? null,
      contrarianView:          (p.contrarian_view as string | undefined) ?? null,
      opportunityPotential:    (p.opportunity_potential as number | undefined) ?? null,
      opportunityReason:       (p.opportunity_reason as string | undefined) ?? null,
    };
  }

  if ("metric_context" in point) {
    const p = point as { metric_context: string; metric_value: string; root_cause: string };
    return { ...EMPTY_RESOLVED, title: `${p.metric_context} — ${p.metric_value}`, causalChain: p.root_cause };
  }
  const p = point as { metric: string; root_cause: string };
  return { ...EMPTY_RESOLVED, title: p.metric, causalChain: p.root_cause };
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
const SIGNAL_STYLES: Record<SignalStrength, string> = {
  "Very High": "av-signal-badge av-signal-badge--very-high",
  High:        "av-signal-badge av-signal-badge--high",
  Medium:      "av-signal-badge av-signal-badge--medium",
  Low:         "av-signal-badge av-signal-badge--low",
};

const SIGNAL_LABEL: Record<SignalStrength, string> = {
  "Very High": "HIGH SIGNAL",
  "High":      "HIGH SIGNAL",
  "Medium":    "MEDIUM SIGNAL",
  "Low":       "EMERGING SIGNAL",
};

const VERIFICATION_STYLES: Record<VerificationStatus, string> = {
  "Verified":           "av-verification-badge av-verification-badge--verified",
  "Partially Verified": "av-verification-badge av-verification-badge--partial",
  "Unverified":         "av-verification-badge av-verification-badge--unverified",
  "Opinion":            "av-verification-badge av-verification-badge--opinion",
  "Speculation":        "av-verification-badge av-verification-badge--speculation",
};

function parseTakeawayBullets(text: string): string[] {
  const byNewline = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (byNewline.length > 1) return byNewline;
  const sentences = text.match(/[^.!?]*[.!?]+\s*/g)?.map(s => s.trim()).filter(s => s.length > 10) ?? [];
  return sentences.length > 1 ? sentences : [text];
}

function MetricCard({
  point,
  videoId,
  defaultOpen,
  rank,
}: {
  point: DataPoint;
  videoId: string;
  defaultOpen: boolean;
  rank?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const {
    title, speakerThesis, strategicIntent, causalChain, quote, contextExample,
    credibilityCheck, timestamp,
    whyItMatters, actionableTakeaway, signalStrength, signalReason,
    verificationStatus, verificationReason,
    viewerBlindSpot, secondOrderImplications, contrarianView,
    opportunityPotential, opportunityReason,
  } = resolveDataPoint(point);
  const hasBody = !!(speakerThesis || whyItMatters || actionableTakeaway || verificationStatus || credibilityCheck || quote || viewerBlindSpot || opportunityPotential !== null || secondOrderImplications || contrarianView || strategicIntent || causalChain || contextExample);
  const hasAdvanced = !!(whyItMatters || viewerBlindSpot || opportunityPotential !== null || strategicIntent || causalChain || contextExample);
  const takeawayBullets = actionableTakeaway ? parseTakeawayBullets(actionableTakeaway) : [];

  return (
    <div className={`av-metric-card${open ? " av-metric-card--open" : ""}`}>
      <button
        onClick={() => hasBody && setOpen(o => !o)}
        aria-expanded={open}
        className="av-metric-header"
      >
        <p className="av-metric-title">{title}</p>

        {(timestamp || hasBody || signalStrength || rank) && (
          <div className="av-metric-footer">
            {rank && rank <= 3 && (
              <span className="av-rank-badge">#{rank} Insight</span>
            )}
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
            {signalStrength && (
              <span className={SIGNAL_STYLES[signalStrength]} title={signalReason ?? undefined}>
                {SIGNAL_LABEL[signalStrength]}
              </span>
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

              {/* ── Default: Direct Quote / Core Insight / Second-Order / Contrarian / Takeaway / Confidence ── */}

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
                  <p className="av-tier-label">Core Insight</p>
                  <p className="av-speaker-thesis">{speakerThesis}</p>
                </div>
              )}

              {secondOrderImplications && (
                <div className="av-tier">
                  <p className="av-tier-label">⚡ Second-Order Implications</p>
                  <p className="av-speaker-thesis" style={{ borderLeftColor: "#8b5cf6", borderLeftWidth: 3 }}>{secondOrderImplications}</p>
                </div>
              )}

              {contrarianView && (
                <div className="av-tier">
                  <p className="av-tier-label av-tier-label--amber">⚡ Contrarian View</p>
                  <p className="av-speaker-thesis" style={{ borderLeftColor: "#8b5cf6", borderLeftWidth: 3 }}>{contrarianView}</p>
                </div>
              )}

              {takeawayBullets.length > 0 && (
                <div className="av-tier">
                  <p className="av-tier-label" style={{ color: "var(--ok)" }}>✓ Actionable Takeaway</p>
                  <ul className="av-takeaway-bullets">
                    {takeawayBullets.map((b, i) => (
                      <li key={i} className="av-takeaway-bullet">{b.replace(/^[✓•\-*]\s*/, "")}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(verificationStatus || credibilityCheck) && (
                <div className="av-tier">
                  <p className="av-tier-label av-tier-label--amber">⚖ Confidence</p>
                  {verificationStatus ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <span className={VERIFICATION_STYLES[verificationStatus]}>{verificationStatus}</span>
                      {verificationReason && <p className="av-credibility" style={{ marginTop: 0 }}>{verificationReason}</p>}
                    </div>
                  ) : (
                    <p className="av-credibility">{credibilityCheck}</p>
                  )}
                </div>
              )}

              {/* ── Deep Analysis — hidden by default ── */}

              {hasAdvanced && (
                <div className="av-advanced">
                  <button
                    onClick={() => setAdvancedOpen(o => !o)}
                    className="av-advanced-toggle"
                    aria-expanded={advancedOpen}
                  >
                    {advancedOpen ? "▲ Hide Deep Analysis" : "▼ View Deep Analysis"}
                  </button>
                  {advancedOpen && (
                    <div className="av-advanced-body">
                      {whyItMatters && (
                        <div className="av-tier">
                          <p className="av-tier-label">Why It Matters</p>
                          <p className="av-speaker-thesis" style={{ borderLeftColor: "var(--accent)", borderLeftWidth: 3 }}>{whyItMatters}</p>
                        </div>
                      )}
                      {viewerBlindSpot && (
                        <div className="av-tier">
                          <p className="av-tier-label">🔍 What Most Viewers Missed</p>
                          <div className="av-blind-spot">{viewerBlindSpot}</div>
                        </div>
                      )}
                      {opportunityPotential !== null && (
                        <div className="av-tier" onClick={() => track("opportunity_clicked", { analysisId: videoId, label: String(opportunityPotential) })}>
                          <p className="av-tier-label" style={{ color: opportunityPotential >= 80 ? "var(--ok)" : opportunityPotential >= 50 ? "var(--warn)" : "var(--muted)" }}>
                            Opportunity Potential
                          </p>
                          <div className="av-opportunity-score-row">
                            <span className="av-opportunity-score" style={{
                              color: opportunityPotential >= 80 ? "var(--ok)" : opportunityPotential >= 50 ? "var(--warn)" : "var(--muted)",
                              borderColor: opportunityPotential >= 80 ? "color-mix(in srgb,var(--ok) 30%,transparent)" : opportunityPotential >= 50 ? "color-mix(in srgb,var(--warn) 30%,transparent)" : "var(--border)",
                            }}>
                              {opportunityPotential}/100
                            </span>
                            {opportunityReason && <p className="av-opportunity-reason">{opportunityReason}</p>}
                          </div>
                        </div>
                      )}
                      {strategicIntent && (
                        <div className="av-tier">
                          <p className="av-tier-label">Why The Speaker Said This</p>
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
                    </div>
                  )}
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

/* ── Generate Audio Button — shown when audioPath is missing after enhancement ── */
type AudioGenState = "idle" | "loading" | "done" | "error";

function GenerateAudioButton({ analysisId, onRefresh }: { analysisId: string; onRefresh: () => void }) {
  const [state, setState] = useState<AudioGenState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const ranRef = useRef(false);

  async function generate() {
    if (ranRef.current) return;
    ranRef.current = true;
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/regenerate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, voice: "onyx" }),
      });
      const data = (await res.json()) as { audioPath?: string; error?: string };
      if (!res.ok || !data.audioPath) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState("done");
      onRefresh();
    } catch (err) {
      ranRef.current = false;
      const msg = err instanceof Error ? err.message : "Failed";
      setErrorMsg(msg);
      setState("error");
      setTimeout(() => setState("idle"), 8000);
    }
  }

  // Auto-trigger on mount — no user action needed
  useEffect(() => { void generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "done") return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <button
        onClick={() => void generate()}
        disabled={state === "loading"}
        className="btn-email"
      >
        {state === "loading" ? <><span className="spinner" /> Generating Audio…</> :
         state === "error" ? "❌ Retry Audio" :
         "🎙 Generate Audio"}
      </button>
      {errorMsg && <span style={{ fontSize: "0.65rem", color: "#ef4444" }}>{errorMsg}</span>}
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
      const res = await fetch(`/api/backfill/${analysisId}`, { method: "POST" });
      if (!res.ok) throw new Error("Backfill failed");
      setState("done");
      onRefresh();
    } catch {
      ranRef.current = false;
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

/* ── Quick Feedback ── */
type FeedbackState = "idle" | "sending" | "done";

function QuickFeedback({ analysisId, videoTitle }: { analysisId: string; videoTitle: string }) {
  const [state, setState] = useState<FeedbackState>("idle");
  const [choice, setChoice] = useState<"helpful" | "not_helpful" | null>(null);

  async function submit(value: "helpful" | "not_helpful") {
    if (state !== "idle") return;
    setChoice(value);
    setState("sending");
    track("feedback_submitted", { analysisId, label: value });
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: `analysis_feedback_${value}`,
          message: `${value === "helpful" ? "👍 Helpful" : "👎 Not Helpful"} — ${videoTitle} (${analysisId})`,
        }),
      });
    } catch {
      // non-blocking — don't surface errors for feedback
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <div className="av-quick-feedback av-quick-feedback--done">
        {choice === "helpful" ? "👍 Thanks for the feedback!" : "👎 Noted — we'll keep improving."}
      </div>
    );
  }

  return (
    <div className="av-quick-feedback">
      <span className="av-quick-feedback__label">Was this analysis helpful?</span>
      <button
        onClick={() => void submit("helpful")}
        disabled={state === "sending"}
        className="av-quick-feedback__btn av-quick-feedback__btn--yes"
        aria-label="Helpful"
      >
        👍 Helpful
      </button>
      <button
        onClick={() => void submit("not_helpful")}
        disabled={state === "sending"}
        className="av-quick-feedback__btn av-quick-feedback__btn--no"
        aria-label="Not helpful"
      >
        👎 Not Helpful
      </button>
    </div>
  );
}

/* ── Re-analyze Button ── */
type ReanalyzeState = "idle" | "loading" | "done" | "error";

function ReanalyzeButton({ youtubeUrl, onRefresh, onReanalyzed }: { youtubeUrl: string; onRefresh?: () => void; onReanalyzed?: (a: SavedAnalysis) => void }) {
  const [state, setState] = useState<ReanalyzeState>("idle");

  async function reanalyze() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/analyze?force=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SavedAnalysis;
      setState("done");
      if (onReanalyzed) onReanalyzed(data);
      else if (onRefresh) onRefresh();
      else window.location.reload();
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 5000);
    }
  }

  return (
    <button
      onClick={() => void reanalyze()}
      disabled={state === "loading"}
      className="btn-email"
      title="Force a fresh analysis, bypassing the cache"
    >
      {state === "loading" ? <><span className="spinner" /> Re-analyzing…</> :
       state === "done" ? "✓ Done" :
       state === "error" ? "❌ Failed — retry" :
       "↻ Re-analyze"}
    </button>
  );
}

/* ── Main Component ── */
export function AnalysisView({ analysis, onRefresh, onPlayAudio, onReanalyzed }: {
  analysis: SavedAnalysis;
  onRefresh?: () => void;
  onPlayAudio?: () => void;
  onReanalyzed?: (a: SavedAnalysis) => void;
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

        {analysis.who_should_care && (
          <div className="av-who-cares">
            <div className="av-who-cares__section">
              <span className="av-who-cares__label">Most Relevant For</span>
              <div className="av-who-cares__pills">
                {analysis.who_should_care.most_relevant_for.map((r, i) => (
                  <span key={i} className="av-who-cares__pill av-who-cares__pill--for">{r}</span>
                ))}
              </div>
            </div>
            {(analysis.who_should_care.less_relevant_for ?? []).length > 0 && (
              <div className="av-who-cares__section">
                <span className="av-who-cares__label">Less Relevant For</span>
                <div className="av-who-cares__pills">
                  {(analysis.who_should_care.less_relevant_for ?? []).map((r, i) => (
                    <span key={i} className="av-who-cares__pill av-who-cares__pill--against">{r}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {analysis.analysis_confidence && (
          <div className="av-confidence">
            <span className="av-confidence__label">Analysis Confidence</span>
            <div className="av-confidence__body">
              <span className="av-confidence__score" style={{
                color: analysis.analysis_confidence.score >= 80 ? "var(--ok)"
                     : analysis.analysis_confidence.score >= 60 ? "var(--warn)"
                     : "var(--danger)",
              }}>
                {analysis.analysis_confidence.score}/100
              </span>
              {analysis.analysis_confidence.factors && (
                <span className="av-confidence__factors">{analysis.analysis_confidence.factors}</span>
              )}
            </div>
          </div>
        )}

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
          {analysis.audioPath && onPlayAudio && (
            <button onClick={onPlayAudio} className="btn-email">🎙 Audio Briefing</button>
          )}
          {!analysis.audioPath && !needsEnhancement && onRefresh && (
            <GenerateAudioButton key={analysis.id} analysisId={analysis.id} onRefresh={onRefresh} />
          )}
          {needsEnhancement && onRefresh && (
            <EnhanceButton analysisId={analysis.id} onRefresh={onRefresh} />
          )}
          <ReanalyzeButton youtubeUrl={analysis.youtubeUrl} onRefresh={onRefresh} onReanalyzed={onReanalyzed} />
        </div>
      </div>

      {/* ── Metrics Grid ── */}
      {analysis.hard_data_points.length > 0 && (
        <section className="av-section">
          <p className="av-section-label">📊 Intelligence — Ranked by Signal Priority</p>
          <div className="av-metrics-grid">
            {(() => {
              const RANK: Record<string, number> = { "Very High": 4, "High": 3, "Medium": 2, "Low": 1 };
              return [...analysis.hard_data_points]
                .sort((a, b) => {
                  const ra = typeof a === "object" && a !== null && "signal_strength" in a ? RANK[(a as Record<string, unknown>).signal_strength as string] ?? 1 : 0;
                  const rb = typeof b === "object" && b !== null && "signal_strength" in b ? RANK[(b as Record<string, unknown>).signal_strength as string] ?? 1 : 0;
                  return rb - ra;
                })
                .map((point, i) => (
                  <MetricCard key={i} point={point} videoId={analysis.videoId} defaultOpen={true} rank={i + 1} />
                ));
            })()}
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
          {analysis.actionable_takeaways.slice(0, 3).map((takeaway, index) => {
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

      {/* ── Quick Feedback ── */}
      <QuickFeedback analysisId={analysis.id} videoTitle={displayTitle} />

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
