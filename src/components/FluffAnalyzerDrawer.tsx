"use client";

import type React from "react";
import type { FeedVideo } from "@/app/api/youtube/feed/route";
import type { AIScore } from "@/app/api/youtube/filter/route";
import { isoToSeconds, getChannelAffinity } from "@/hooks/useFilteredSubscriptionFeed";

// ── Timeline estimation ───────────────────────────────────────────────────────

interface TimelineSegments {
  intro: number;
  context: number;
  core: number;
  ads: number;
  outro: number;
}

function estimateTimeline(durationSecs: number, contentType: string, affinity: number): TimelineSegments {
  const isConversational = ["Interview", "Podcast", "Discussion"].includes(contentType);
  const isLong = durationSecs > 5400;

  // Intro: interview formats jump into content faster
  const intro = isConversational ? 8 : 14;

  // Ads: scale with duration; trusted academic/institutional channels run fewer
  const rawAds = Math.round(durationSecs / 400);
  const ads = Math.min(isLong ? 22 : 18, Math.max(6, affinity >= 75 ? rawAds - 3 : rawAds));

  const outro = 7;
  const context = 10;
  const core = Math.max(40, 100 - intro - context - ads - outro);

  // Normalize to exactly 100
  const total = intro + context + core + ads + outro;
  const s = 100 / total;
  return {
    intro:   Math.round(intro   * s),
    context: Math.round(context * s),
    core:    Math.round(core    * s),
    ads:     Math.round(ads     * s),
    outro:   Math.round(outro   * s),
  };
}

// ── Niche chip color classification ──────────────────────────────────────────

const MACRO_KW    = ["federal reserve", "fed", "liquidity", "private equity", "ipo", "macro", "inflation", "hedge fund", "bond", "yield", "monetary", "central bank", "interest rate", "market cycle", "recession", "gdp"];
const STRATEGY_KW = ["b2b", "scaling", "offer", "ltv", "cac", "revenue", "saas", "marketing", "sales", "growth", "acquisition", "ecommerce", "business model", "pricing", "churn", "conversion", "funnel", "corporate"];
const EXEC_KW     = ["ceo", "founder", "masterclass", "keynote", "case study", "leadership", "executive", "operator", "venture", "startup", "fundraising", "culture", "interview"];

export function categoryChipClass(cat: string): string {
  const lower = cat.toLowerCase();
  if (MACRO_KW.some((k)    => lower.includes(k))) return "feed-card__category-pill feed-card__category-pill--macro";
  if (STRATEGY_KW.some((k) => lower.includes(k))) return "feed-card__category-pill feed-card__category-pill--strategy";
  if (EXEC_KW.some((k)     => lower.includes(k))) return "feed-card__category-pill feed-card__category-pill--exec";
  return "feed-card__category-pill";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  video: FeedVideo | null;
  ai: AIScore | undefined;
  onClose: () => void;
  onFullAnalyze: () => void;
  isAnalyzing: boolean;
}

export function FluffAnalyzerDrawer({ isOpen, video, ai, onClose, onFullAnalyze, isAnalyzing }: Props) {
  if (!isOpen || !video) return null;

  const durationSecs = isoToSeconds(video.duration);
  const affinity     = getChannelAffinity(video.channelTitle);
  const contentType  = ai?.contentType ?? "General";
  const segments     = estimateTimeline(durationSecs, contentType, affinity);

  const totalH   = Math.floor(durationSecs / 3600);
  const totalM   = Math.floor((durationSecs % 3600) / 60);
  const coreMins = Math.round((segments.core / 100) * durationSecs / 60);
  const fluffPct = segments.intro + segments.ads + segments.outro;

  // Build action points from available AI data — no extra network call
  const actionPoints: string[] = [];
  if (ai?.explanation) actionPoints.push(ai.explanation);
  if (ai?.subScores) {
    const { educationalValue, actionability, informationDensity } = ai.subScores;
    if (educationalValue >= 70)
      actionPoints.push(`Educational depth ${educationalValue}/100 — dense with learnable frameworks and transferable concepts.`);
    if (actionability >= 70)
      actionPoints.push(`Actionability ${actionability}/100 — contains concrete, executable steps you can apply immediately.`);
    if (informationDensity >= 70)
      actionPoints.push(`Information density ${informationDensity}/100 — low filler-to-insight ratio throughout runtime.`);
  }

  return (
    <>
      <div className="fluff-drawer__overlay" onClick={onClose} />

      <div className="fluff-drawer">
        {/* Header */}
        <div className="fluff-drawer__header">
          <div>
            <span className="fluff-drawer__label">AI Deep Audit Engine</span>
            <h2 className="fluff-drawer__channel">{video.channelTitle}</h2>
          </div>
          <button onClick={onClose} className="fluff-drawer__close">✕ Close</button>
        </div>

        {/* Scrollable body */}
        <div className="fluff-drawer__body">

          {/* Video summary */}
          <div className="fluff-drawer__video-card">
            {video.thumbnail && (
              <div className="fluff-drawer__thumb-wrap">
                <img src={video.thumbnail} alt="" className="fluff-drawer__thumb" />
                <span className="fluff-drawer__thumb-duration">
                  {totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`}
                </span>
              </div>
            )}
            <div className="fluff-drawer__video-info">
              <p className="fluff-drawer__video-title">{video.title}</p>
              {ai?.contentType && (
                <span className="fluff-drawer__content-type-badge">{contentType}</span>
              )}
            </div>
          </div>

          {/* WatchFilter Verdict */}
          {ai && (() => {
            const score     = ai.score ?? 0;
            const topicCat  = ai.topicCategory;
            const isYes     = topicCat === "high_priority" || score >= 75;
            const isNo      = topicCat === "excluded"      || score < 50;
            const verdict   = isYes ? "YES" : isNo ? "NO" : "MAYBE";
            const quality   = score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
            const reason    = ai.whyItMatters || ai.explanation || null;
            const verdictStyle: React.CSSProperties = isYes
              ? { color: "#34d399", background: "rgba(52,211,153,0.08)", borderColor: "rgba(52,211,153,0.3)" }
              : isNo
              ? { color: "#f87171", background: "rgba(248,113,113,0.08)", borderColor: "rgba(248,113,113,0.3)" }
              : { color: "#fbbf24", background: "rgba(251,191,36,0.08)", borderColor: "rgba(251,191,36,0.3)" };
            const qualityColor = quality === "High" ? "#34d399" : quality === "Medium" ? "#fbbf24" : "#94a3b8";
            return (
              <div className="fluff-drawer__timeline" style={{ marginBottom: "0.5rem" }}>
                <h4 className="fluff-drawer__section-title">WatchFilter Verdict</h4>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  <span style={{ fontSize: "12px", fontFamily: "monospace", fontWeight: 800, padding: "4px 10px", borderRadius: "6px", border: "1px solid", ...verdictStyle }}>
                    Worth Watching: {verdict}
                  </span>
                  <span style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: 700, color: qualityColor }}>
                    WatchFilter's Read: {quality}
                  </span>
                </div>
                {reason && (
                  <p style={{ marginTop: "0.4rem", fontSize: "10px", fontFamily: "monospace", color: "#94a3b8", lineHeight: 1.55, fontStyle: "italic" }}>
                    {reason}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Efficiency metrics */}
          <div className="fluff-drawer__metrics">
            <div className="fluff-drawer__metric fluff-drawer__metric--emerald">
              <p className="fluff-drawer__metric-label">Fluff Detected</p>
              <div className="fluff-drawer__metric-value">{fluffPct}%</div>
              <p className="fluff-drawer__metric-sub">of runtime</p>
            </div>
            <div className="fluff-drawer__metric fluff-drawer__metric--blue">
              <p className="fluff-drawer__metric-label">Substantive Content</p>
              <div className="fluff-drawer__metric-value">~{coreMins} min</div>
              <p className="fluff-drawer__metric-sub">WatchFilter estimate</p>
            </div>
          </div>

          {/* Timeline bar */}
          <div className="fluff-drawer__timeline">
            <h4 className="fluff-drawer__section-title">Timeline Segment Map</h4>
            <div className="fluff-drawer__bar">
              <div className="fluff-drawer__bar-intro"    style={{ width: `${segments.intro}%` }}    title={`Intro / Hook (${segments.intro}%)`} />
              <div className="fluff-drawer__bar-context"  style={{ width: `${segments.context}%` }}  title={`Context & Setup (${segments.context}%)`} />
              <div className="fluff-drawer__bar-core"     style={{ width: `${segments.core}%` }}     title={`Core Framework (${segments.core}%)`} />
              <div className="fluff-drawer__bar-ads"      style={{ width: `${segments.ads}%` }}      title={`Sponsorship / Fluff (${segments.ads}%)`} />
              <div className="fluff-drawer__bar-outro"    style={{ width: `${segments.outro}%` }}    title={`Outro / CTA (${segments.outro}%)`} />
            </div>
            <div className="fluff-drawer__legend">
              <div className="fluff-drawer__legend-item">
                <span className="fluff-drawer__legend-dot fluff-drawer__legend-dot--core" />
                Core Strategy ({segments.core}%)
              </div>
              <div className="fluff-drawer__legend-item">
                <span className="fluff-drawer__legend-dot fluff-drawer__legend-dot--context" />
                Context ({segments.context}%)
              </div>
              <div className="fluff-drawer__legend-item">
                <span className="fluff-drawer__legend-dot fluff-drawer__legend-dot--ads" />
                Ad Fluff ({segments.ads}%)
              </div>
              <div className="fluff-drawer__legend-item">
                <span className="fluff-drawer__legend-dot fluff-drawer__legend-dot--intro" />
                Intro / Outro ({segments.intro + segments.outro}%)
              </div>
            </div>
          </div>

          {/* Niche chips */}
          {ai?.categories && ai.categories.length > 0 && (
            <div className="fluff-drawer__timeline">
              <h4 className="fluff-drawer__section-title">Intelligence Domain</h4>
              <div className="feed-card__categories" style={{ marginTop: "0.4rem" }}>
                {ai.categories.map((cat) => (
                  <span key={cat} className={categoryChipClass(cat)}>{cat}</span>
                ))}
              </div>
            </div>
          )}

          <hr className="fluff-drawer__divider" />

          {/* Extracted intel */}
          {actionPoints.length > 0 && (
            <div className="fluff-drawer__timeline">
              <h4 className="fluff-drawer__section-title">Extracted Strategic Intel</h4>
              <ul className="fluff-drawer__action-list">
                {actionPoints.map((pt, i) => (
                  <li key={i} className="fluff-drawer__action-item">
                    <span className="fluff-drawer__action-check">✓</span>
                    <p>{pt}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!ai && (
            <p className="fluff-drawer__no-ai">
              Enable Business or Founder mode and wait for AI scoring to unlock deeper intel.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="fluff-drawer__footer">
          <button
            onClick={onFullAnalyze}
            disabled={isAnalyzing}
            className="fluff-drawer__analyze-btn"
          >
            {isAnalyzing
              ? <><span className="spinner" /> Analyzing…</>
              : "⚡ Run Full Deep Analysis"}
          </button>
        </div>
      </div>
    </>
  );
}
