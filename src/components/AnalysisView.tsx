"use client";

import { useRef, useState } from "react";
import type { SavedAnalysis } from "@/lib/client-types";

function youtubeWatchUrl(videoId: string, time?: string): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  if (!time) return base;
  const parts = time.split(":").map(Number);
  let seconds = 0;
  if (parts.length === 2) seconds = parts[0]! * 60 + parts[1]!;
  else if (parts.length === 3)
    seconds = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return `${base}&t=${seconds}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function clickbaitMeta(score: number): { label: string; scoreClass: string } {
  if (score <= 3) return { label: "Accurate", scoreClass: "score-low" };
  if (score <= 6) return { label: "Sensationalized", scoreClass: "score-mid" };
  return { label: "High Clickbait", scoreClass: "score-high" };
}

/* ── Audio player ── */
function AudioPlayer({ src, title }: { src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
  }

  function onLoadedMetadata() {
    if (audioRef.current) setDuration(audioRef.current.duration);
  }

  function onEnded() {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const pct = Number(e.target.value);
    audio.currentTime = (pct / 100) * audio.duration;
    setProgress(pct);
  }

  function fmt(s: number) {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  const downloadName = `watchfilter-${title.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.mp3`;

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
      />
      <span className="audio-player__label">🎙 Audio Briefing</span>
      <div className="audio-player__controls">
        <button
          onClick={togglePlay}
          className="audio-player__btn"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
              <rect x="0" y="0" width="3.5" height="12" rx="1" />
              <rect x="6.5" y="0" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
              <path d="M0 0l10 6-10 6z" />
            </svg>
          )}
        </button>
        <span className="audio-player__time">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={progress}
          onChange={seek}
          className="audio-player__progress"
          aria-label="Seek"
        />
        <a href={src} download={downloadName} className="audio-player__download">
          ⬇ MP3
        </a>
      </div>
    </div>
  );
}

/* ── Email button ── */
const EMAIL_KEY = "watchfilter_email";
type EmailState = "idle" | "open" | "sending" | "sent" | "error";

function EmailButton({ analysisId }: { analysisId: string }) {
  const [state, setState] = useState<EmailState>("idle");
  const [email, setEmail] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(EMAIL_KEY) ?? "") : ""
  );
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function open() {
    setState("open");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

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
    return (
      <button onClick={open} className="btn-email">
        📧 Email Briefing
      </button>
    );

  if (state === "sent")
    return (
      <span className="email-feedback email-feedback--ok">
        ✅ Sent to {email}
      </span>
    );

  if (state === "error")
    return (
      <span className="email-feedback email-feedback--err">❌ {errorMsg}</span>
    );

  return (
    <div className="email-form">
      <input
        ref={inputRef}
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        disabled={state === "sending"}
        className="email-input"
      />
      <button
        onClick={send}
        disabled={state === "sending" || !email.trim()}
        className="btn btn-primary"
      >
        {state === "sending" ? <span className="spinner" /> : "Send"}
      </button>
      <button
        onClick={() => setState("idle")}
        disabled={state === "sending"}
        className="btn btn-ghost"
      >
        ✕
      </button>
    </div>
  );
}

/* ── Accordion data card ── */
type DataPoint =
  | { metric_title: string; causal_chain: string; direct_quote: string; credibility_check: string; exact_timestamp: string }
  | { metric_title: string; speaker_thesis: string; direct_quote: string; exact_timestamp: string }
  | { metric_value: string; metric_context: string; root_cause: string }
  | { metric: string; root_cause: string }
  | string;

type ResolvedPoint = {
  title: string;
  causalChain: string | null;
  quote: string | null;
  credibilityCheck: string | null;
  timestamp: string | null;
};

function resolveDataPoint(point: DataPoint): ResolvedPoint {
  if (typeof point === "string") {
    return { title: point, causalChain: null, quote: null, credibilityCheck: null, timestamp: null };
  }
  if ("causal_chain" in point) {
    return {
      title: point.metric_title,
      causalChain: point.causal_chain,
      quote: point.direct_quote,
      credibilityCheck: point.credibility_check,
      timestamp: point.exact_timestamp,
    };
  }
  if ("speaker_thesis" in point) {
    // previous schema
    return {
      title: point.metric_title,
      causalChain: point.speaker_thesis,
      quote: point.direct_quote,
      credibilityCheck: null,
      timestamp: point.exact_timestamp,
    };
  }
  if ("metric_context" in point) {
    return {
      title: `${point.metric_context} — ${point.metric_value}`,
      causalChain: point.root_cause,
      quote: null,
      credibilityCheck: null,
      timestamp: null,
    };
  }
  // legacy { metric, root_cause }
  return { title: point.metric, causalChain: point.root_cause, quote: null, credibilityCheck: null, timestamp: null };
}

function CausalChain({ text }: { text: string }) {
  const steps = text.split(/\s*→\s*|\s*->\s*/).map((s) => s.trim()).filter(Boolean);
  if (steps.length <= 1) {
    return <p className="data-card__thesis">{text}</p>;
  }
  return (
    <p className="data-card__causal-chain">
      {steps.flatMap((step, i) => [
        <span key={`s${i}`} className="data-card__causal-step">{step}</span>,
        i < steps.length - 1
          ? <span key={`a${i}`} className="data-card__causal-arrow">→</span>
          : null,
      ])}
    </p>
  );
}

function DataCard({
  point,
  videoId,
  defaultOpen,
}: {
  point: DataPoint;
  videoId: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { title, causalChain, quote, credibilityCheck, timestamp } = resolveDataPoint(point);
  const hasBody = !!(causalChain || quote || credibilityCheck);

  return (
    <div className="data-card">
      <button
        onClick={() => hasBody && setOpen((o) => !o)}
        aria-expanded={open}
        className="data-card__header"
      >
        <p className="data-card__metric">{title}</p>
        {timestamp && (
          <a
            href={youtubeWatchUrl(videoId, timestamp)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ts-pill"
          >
            ▶ {timestamp}
          </a>
        )}
        {hasBody && (
          <svg
            className={`chevron ${open ? "chevron--open" : ""}`}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <path
              d="M3 5l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {hasBody && (
        <div className={`accordion-body ${open ? "accordion-body--open" : ""}`}>
          <div className="accordion-inner">

            {causalChain && (
              <div className="data-card__tier">
                <p className="data-card__tier-label">Causal Chain</p>
                <CausalChain text={causalChain} />
              </div>
            )}

            {quote && (
              <div className="data-card__tier">
                <p className="data-card__tier-label">
                  <svg width="13" height="10" viewBox="0 0 13 10" fill="currentColor" aria-hidden>
                    <path d="M0 10V6.2C0 3.7 1.4 1.7 4.3.4L5.1 2C3.3 2.8 2.4 4 2.3 5.6H4.8V10H0zm7.2 0V6.2c0-2.5 1.4-4.5 4.3-5.8L12.3 2c-1.8.8-2.7 2-2.8 3.6H12V10H7.2z"/>
                  </svg>
                  Direct Quote
                </p>
                <div className="data-card__quote-block">
                  <p className="data-card__quote-text">"{quote}"</p>
                </div>
              </div>
            )}

            {credibilityCheck && (
              <div className="data-card__tier">
                <p className="data-card__tier-label data-card__tier-label--amber">
                  ⚖ Credibility Check
                </p>
                <p className="data-card__credibility">{credibilityCheck}</p>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */
export function AnalysisView({ analysis }: { analysis: SavedAnalysis }) {
  const displayTitle = analysis.title ?? `Video ${analysis.videoId}`;
  const { label: cbLabel, scoreClass } = clickbaitMeta(analysis.clickbait_score);

  return (
    <article className="analysis-card">

      {/* ── Header ── */}
      <header className="analysis-header">
        <h2 className="analysis-title">
          <a
            href={analysis.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {displayTitle}
          </a>
        </h2>
        {analysis.audioPath && (
          <AudioPlayer src={analysis.audioPath} title={displayTitle} />
        )}
        <div className="analysis-title-actions">
          <EmailButton analysisId={analysis.id} />
        </div>
      </header>

      {/* ── Executive Snapshot ── */}
      <section className="section">
        <p className="section-label">Executive Snapshot</p>
        <div className="snapshot-table">
          <div className="snapshot-cell">
            <span className="snapshot-key">Clickbait Score</span>
            <span className={`snapshot-score ${scoreClass}`}>
              <span className="clickbait-score">
                {analysis.clickbait_score}/10
              </span>
              <span className="snapshot-score-label">{cbLabel}</span>
            </span>
          </div>
          <div className="snapshot-cell snapshot-cell--subject">
            <span className="snapshot-key">Primary Subject</span>
            <span className="snapshot-value">{analysis.primary_subject}</span>
          </div>
          <div className="snapshot-cell">
            <span className="snapshot-key">Data Density</span>
            <span className="snapshot-value">
              {analysis.hard_data_points.length} metrics
            </span>
          </div>
        </div>
      </section>

      {/* ── Two-column dashboard ── */}
      <div className="dashboard-grid">

        {/* Main column — Hard Data */}
        <div>
          {analysis.hard_data_points.length > 0 && (
            <section className="section">
              <p className="section-label">📊 Hard Data &amp; Analysis</p>
              <div className="data-cards">
                {analysis.hard_data_points.map((point, i) => (
                  <DataCard key={i} point={point} videoId={analysis.videoId} defaultOpen={i === 0} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar — Playbook + Timestamps */}
        <div className="dashboard-sidebar">

          {/* Tactical Playbook */}
          <section className="section">
            <p className="section-label">🚀 Tactical Playbook</p>
            <ol className="playbook">
              {analysis.actionable_takeaways.map((takeaway, index) => {
                const strategy =
                  typeof takeaway === "string" ? takeaway : takeaway.strategy;
                const steps =
                  typeof takeaway === "string"
                    ? []
                    : (takeaway.execution_steps ?? []);
                const ts = analysis.timestamps.find(
                  (t) => t.takeaway_index === index
                );
                return (
                  <li key={index} className="playbook-item">
                    <p className="playbook-priority">Priority {index + 1}</p>
                    <p className="playbook-strategy">{strategy}</p>
                    {steps.length > 0 && (
                      <ul className="playbook-steps">
                        {steps.map((step, si) => (
                          <li key={si} className="playbook-step">
                            <span className="step-arrow">→</span>
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
                        className="ts-pill"
                      >
                        ▶ {ts.time}
                        {ts.label ? ` · ${ts.label}` : ""}
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Timestamp Index */}
          {analysis.timestamps.length > 0 && (
            <section className="section">
              <p className="section-label">⏱️ Timestamp Index</p>
              <div className="ts-index">
                {analysis.timestamps.map((ts, i) => {
                  const takeaway =
                    analysis.actionable_takeaways[ts.takeaway_index];
                  const label =
                    ts.label ||
                    (typeof takeaway === "string"
                      ? takeaway
                      : takeaway?.strategy) ||
                    "";
                  return (
                    <a
                      key={i}
                      href={youtubeWatchUrl(analysis.videoId, ts.time)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ts-pill ts-pill--index"
                    >
                      <span className="ts-pill__time">▶ {ts.time}</span>
                      {label && (
                        <span className="ts-pill__label">{label}</span>
                      )}
                    </a>
                  );
                })}
              </div>
            </section>
          )}

        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="analysis-meta">
        <span>Saved {formatDate(analysis.createdAt)}</span>
        <span>Source: {analysis.transcriptSource}</span>
        <span>{analysis.transcriptCharCount.toLocaleString()} transcript chars</span>
        <span style={{ marginLeft: "auto" }}>
          <EmailButton analysisId={analysis.id} />
        </span>
      </footer>

    </article>
  );
}
