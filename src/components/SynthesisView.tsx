"use client";

import type { SynthesisResult } from "@/lib/synthesis";
import type { AnalysisSummary } from "@/lib/client-types";

interface Props {
  result: SynthesisResult;
  sources: AnalysisSummary[];
  onBack: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SCORE_COLOR: Record<string, string> = {
  "Very High": "#16a34a",
  "High":      "#2563eb",
  "Moderate":  "#d97706",
  "Low":       "#dc2626",
  "Conflicted":"#7c3aed",
};

const PRIORITY_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  Critical: { bg: "#fef2f2", text: "#dc2626", border: "#fca5a5" },
  High:     { bg: "#eff6ff", text: "#2563eb", border: "#93c5fd" },
  Medium:   { bg: "#f0fdf4", text: "#16a34a", border: "#86efac" },
};

const RISK_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  High:   { bg: "#fef2f2", text: "#dc2626", border: "#fca5a5" },
  Medium: { bg: "#fffbeb", text: "#d97706", border: "#fcd34d" },
  Low:    { bg: "#f0fdf4", text: "#16a34a", border: "#86efac" },
};

const STRENGTH_STYLE: Record<string, { bg: string; text: string }> = {
  Universal: { bg: "#eff6ff", text: "#2563eb" },
  Majority:  { bg: "#f0fdf4", text: "#16a34a" },
  Plurality: { bg: "#fafaf9", text: "#78716c" },
};

function SourceChip({ title }: { title: string }) {
  return (
    <span className="sv-chip" title={title}>
      {title.length > 40 ? title.slice(0, 40) + "…" : title}
    </span>
  );
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = SCORE_COLOR[label] ?? "#6b7280";
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="sv-score-ring-wrap">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="55" cy="55" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dashoffset .8s ease" }}
        />
        <text x="55" y="52" textAnchor="middle" fontSize="22" fontWeight="800" fill={color}>{score}</text>
        <text x="55" y="66" textAnchor="middle" fontSize="9" fill="#6b7280">/ 100</text>
      </svg>
      <div className="sv-score-label" style={{ color }}>{label}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SynthesisView({ result, sources, onBack }: Props) {
  const { agreementStrength, narrativeOverlap, contrarianAlerts, evidenceAuditTrail, unifiedPlaybook } = result;

  return (
    <div className="sv-root">

      {/* Back */}
      <button type="button" className="sv-back" onClick={onBack}>
        ← Back to workbench
      </button>

      {/* Header — Agreement Score */}
      <div className="sv-header">
        <div className="sv-header-left">
          <p className="sv-eyebrow">Cross-Channel Synthesis</p>
          <h2 className="sv-title">Consensus Report</h2>
          <p className="sv-sources-count">{sources.length} briefings cross-examined</p>
          <div className="sv-source-list">
            {sources.map((s) => (
              <div key={s.id} className="sv-source-row">
                <span className="sv-source-avatar">{(s.channelName ?? "?")[0].toUpperCase()}</span>
                <div>
                  <p className="sv-source-channel">{s.channelName ?? "Unknown"}</p>
                  <p className="sv-source-title">{s.title ?? s.videoId}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="sv-header-right">
          <ScoreRing score={agreementStrength.score} label={agreementStrength.label} />
          <p className="sv-score-rationale">{agreementStrength.rationale}</p>
        </div>
      </div>

      {/* Contrarian Alerts */}
      {contrarianAlerts.length > 0 && (
        <section className="sv-section">
          <div className="sv-section-header">
            <span className="sv-section-icon">⚡</span>
            <h3 className="sv-section-title">Contrarian Alerts</h3>
            <span className="sv-section-count">{contrarianAlerts.length}</span>
          </div>
          <div className="sv-alert-grid">
            {contrarianAlerts.map((alert, i) => {
              const rs = RISK_STYLE[alert.riskLevel];
              return (
                <div key={i} className="sv-alert-card" style={{ borderColor: rs.border }}>
                  <div className="sv-alert-card-header">
                    <span className="sv-alert-topic">{alert.topic}</span>
                    <span className="sv-risk-badge" style={{ background: rs.bg, color: rs.text, borderColor: rs.border }}>
                      {alert.riskLevel} Risk
                    </span>
                  </div>
                  <p className="sv-alert-clash">{alert.clashDescription}</p>
                  <div className="sv-positions">
                    {alert.positions.map((pos, j) => (
                      <div key={j} className="sv-position">
                        <div className="sv-position-header">
                          <span className="sv-position-source">{pos.channel ?? pos.source}</span>
                        </div>
                        <p className="sv-position-claim">{pos.claim}</p>
                        {pos.evidence && (
                          <blockquote className="sv-position-quote">&ldquo;{pos.evidence}&rdquo;</blockquote>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Narrative Overlap */}
      {narrativeOverlap.length > 0 && (
        <section className="sv-section">
          <div className="sv-section-header">
            <span className="sv-section-icon">✅</span>
            <h3 className="sv-section-title">Narrative Overlap</h3>
            <span className="sv-section-count">{narrativeOverlap.length} shared themes</span>
          </div>
          <div className="sv-overlap-grid">
            {narrativeOverlap.map((item, i) => {
              const ss = STRENGTH_STYLE[item.strength];
              return (
                <div key={i} className="sv-overlap-card">
                  <div className="sv-overlap-card-top">
                    <span className="sv-overlap-strength" style={{ background: ss.bg, color: ss.text }}>
                      {item.strength}
                    </span>
                    <h4 className="sv-overlap-theme">{item.theme}</h4>
                  </div>
                  <p className="sv-overlap-summary">{item.summary}</p>
                  <div className="sv-chip-row">
                    {item.supportedBy.map((src, j) => <SourceChip key={j} title={src} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Evidence Audit Trail */}
      {evidenceAuditTrail.length > 0 && (
        <section className="sv-section">
          <div className="sv-section-header">
            <span className="sv-section-icon">🗂️</span>
            <h3 className="sv-section-title">Evidence Audit Trail</h3>
            <span className="sv-section-count">{evidenceAuditTrail.length} consensus points</span>
          </div>
          <div className="sv-audit-list">
            {evidenceAuditTrail.map((item, i) => (
              <div key={i} className="sv-audit-item">
                <div className="sv-audit-point">
                  <span className="sv-audit-num">{i + 1}</span>
                  <p className="sv-audit-claim">{item.consensusPoint}</p>
                </div>
                <div className="sv-citation-grid">
                  {item.citations.map((c, j) => (
                    <div key={j} className="sv-citation">
                      <p className="sv-citation-source">{c.channel ?? c.source}</p>
                      {c.directQuote ? (
                        <blockquote className="sv-citation-quote">&ldquo;{c.directQuote}&rdquo;</blockquote>
                      ) : c.dataPoint ? (
                        <p className="sv-citation-data">{c.dataPoint}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unified Playbook */}
      {unifiedPlaybook.length > 0 && (
        <section className="sv-section">
          <div className="sv-section-header">
            <span className="sv-section-icon">📋</span>
            <h3 className="sv-section-title">Unified Playbook</h3>
            <span className="sv-section-count">{unifiedPlaybook.length} actions</span>
          </div>
          <div className="sv-playbook-list">
            {unifiedPlaybook.map((item, i) => {
              const ps = PRIORITY_STYLE[item.priority];
              return (
                <div key={i} className="sv-playbook-item">
                  <div className="sv-playbook-left">
                    <span className="sv-playbook-num">{i + 1}</span>
                  </div>
                  <div className="sv-playbook-body">
                    <div className="sv-playbook-top">
                      <p className="sv-playbook-action">{item.action}</p>
                      <span className="sv-priority-badge" style={{ background: ps.bg, color: ps.text, borderColor: ps.border }}>
                        {item.priority}
                      </span>
                    </div>
                    <p className="sv-playbook-rationale">{item.rationale}</p>
                    {item.riskNote && (
                      <div className="sv-playbook-risk">
                        <span className="sv-playbook-risk-label">⚠ Risk</span>
                        {item.riskNote}
                      </div>
                    )}
                    <div className="sv-chip-row" style={{ marginTop: "0.5rem" }}>
                      {item.supportedBy.map((src, j) => <SourceChip key={j} title={src} />)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}
