"use client";

import type { ConsensusResult } from "@/lib/consensus";
import type { AnalysisSummary } from "@/lib/client-types";

type Props = {
  result: ConsensusResult;
  sources: AnalysisSummary[];
  onBack: () => void;
};

function sentimentEmoji(label: string) {
  if (label === "bullish") return "📈";
  if (label === "bearish") return "📉";
  if (label === "mixed") return "⚖️";
  return "➖";
}

function SentimentBar({ score }: { score: number }) {
  const pct = ((score + 5) / 10) * 100;
  const color =
    score >= 2 ? "var(--ok)" : score <= -2 ? "var(--danger)" : "var(--warn)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.4rem" }}>
      <span style={{ fontSize: "0.67rem", color: "var(--muted)", minWidth: 40 }}>Bearish</span>
      <div className="cv-sentiment-bar-track">
        <div
          className="cv-sentiment-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
        <div className="cv-sentiment-bar-center" />
      </div>
      <span style={{ fontSize: "0.67rem", color: "var(--muted)", minWidth: 35, textAlign: "right" }}>Bullish</span>
    </div>
  );
}

function SourceChip({ title }: { title: string }) {
  return <span className="cv-source-chip" title={title}>{title}</span>;
}

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  return <span className={`cv-confidence cv-confidence--${level}`}>{level}</span>;
}

export function ConsensusView({ result, sources, onBack }: Props) {
  return (
    <div className="cv-root">

      {/* Back button */}
      <button type="button" className="cv-back-btn" onClick={onBack}>
        ← Back to analysis
      </button>

      {/* Header */}
      <div className="cv-header">
        <p className="cv-eyebrow">Cross-Channel Consensus</p>
        <h2 className="cv-title">{result.topic}</h2>
        <p className="cv-meta">{sources.length} video{sources.length !== 1 ? "s" : ""} compared</p>
        <div className="cv-source-list">
          {sources.map((s) => (
            <a
              key={s.id}
              href={s.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cv-source-row"
            >
              <span className="cv-source-channel">{s.channelName ?? "Unknown channel"}</span>
              <span className="cv-source-title">{s.title ?? s.videoId}</span>
            </a>
          ))}
        </div>

        <div className={`cv-sentiment cv-sentiment--${result.overall_sentiment.label}`}>
          {sentimentEmoji(result.overall_sentiment.label)} {result.overall_sentiment.label}
          <span style={{ fontWeight: 400, marginLeft: "0.4rem", opacity: 0.75 }}>
            {result.overall_sentiment.score > 0 ? "+" : ""}{result.overall_sentiment.score.toFixed(1)}/5
          </span>
        </div>

        <SentimentBar score={result.overall_sentiment.score} />
        <p className="cv-sentiment-summary">{result.overall_sentiment.summary}</p>
      </div>

      {/* Shared Opinions */}
      {result.shared_opinions.length > 0 && (
        <section className="cv-section">
          <p className="cv-section-label">✅ Shared Opinions ({result.shared_opinions.length})</p>
          <div className="cv-cards">
            {result.shared_opinions.map((item, i) => (
              <div key={i} className="cv-card">
                <p className="cv-card-claim">{item.claim}</p>
                <div className="cv-card-meta">
                  <ConfidenceBadge level={item.confidence} />
                  <div className="cv-card-sources">
                    {item.agreed_by.map((src, j) => <SourceChip key={j} title={src} />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Disagreements */}
      {result.disagreements.length > 0 && (
        <section className="cv-section">
          <p className="cv-section-label">⚡ Disagreements ({result.disagreements.length})</p>
          <div className="cv-cards">
            {result.disagreements.map((item, i) => (
              <div key={i} className="cv-card">
                <p className="cv-card-claim">{item.point}</p>
                <div className="cv-disagreement-positions">
                  {item.positions.map((pos, j) => (
                    <div key={j} className="cv-position">
                      <span className="cv-position-source">{pos.source}</span>
                      <span className="cv-position-stance">{pos.stance}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Key Predictions */}
      {result.key_predictions.length > 0 && (
        <section className="cv-section">
          <p className="cv-section-label">🔮 Key Predictions ({result.key_predictions.length})</p>
          <div className="cv-cards">
            {result.key_predictions.map((item, i) => (
              <div key={i} className="cv-card">
                <p className="cv-card-claim">{item.prediction}</p>
                <div className="cv-prediction-meta">
                  {item.timeframe && (
                    <span className="cv-timeframe-chip">⏱ {item.timeframe}</span>
                  )}
                  <div className="cv-card-sources">
                    {item.made_by.map((src, j) => <SourceChip key={j} title={src} />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unique Insights */}
      {result.unique_insights.length > 0 && (
        <section className="cv-section">
          <p className="cv-section-label">💡 Unique Insights</p>
          <div className="cv-cards">
            {result.unique_insights.map((item, i) => (
              <div key={i} className="cv-card cv-card--unique">
                <p className="cv-card-claim">{item.insight}</p>
                <div className="cv-card-sources" style={{ marginTop: "0.5rem" }}>
                  <SourceChip title={item.source} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
