"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Search, Sparkles, Compass, History, MessageSquare } from "lucide-react";
import { track } from "@/lib/analytics";
import { AnalysisView } from "./AnalysisView";
import { ConsensusView } from "./ConsensusView";
import { AppSidebar, type NavItem } from "./AppSidebar";
import { GlobalAudioPlayer, type GlobalAudioPlayerHandle } from "./GlobalAudioPlayer";
import { BriefingCard } from "./BriefingCard";
import { SubscriptionFeed } from "./SubscriptionFeed";
import { MarketIntelligencePulse } from "./MarketIntelligencePulse";
import type {
  AnalysisSummary,
  ApiErrorBody,
  HistoryResponse,
  SavedAnalysis,
} from "@/lib/client-types";
import type { ConsensusResult } from "@/lib/consensus";

// ── Dashboard ─────────────────────────────────────────────────────

function DashboardView({
  history,
  activeId,
  onOpenAnalysis,
  onListenBrief,
  onAnalyzeUrl,
  analyzing,
  voice,
  onVoiceChange,
}: {
  history: AnalysisSummary[];
  activeId: string | null;
  onOpenAnalysis: (id: string) => void;
  onListenBrief: (id: string) => void;
  onAnalyzeUrl: (url: string) => void;
  analyzing: boolean;
  voice: "onyx" | "nova";
  onVoiceChange: (v: "onyx" | "nova") => void;
}) {
  const [localUrl, setLocalUrl] = useState("");
  const [feedTab, setFeedTab] = useState<"subscriptions" | "briefings">("subscriptions");

  function handleCmdSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!localUrl.trim() || analyzing) return;
    onAnalyzeUrl(localUrl.trim());
    setLocalUrl("");
  }

  return (
    <div className="home-root">

      {/* ── Sticky search header ── */}
      <div className="dash-deck-header">
        <div className="dash-deck-brand">
          <div className="dash-deck-logo">
            <Sparkles size={14} color="#fff" aria-hidden />
          </div>
          <div>
            <span className="dash-deck-brand-name">WatchFilter</span>
            <span className="dash-deck-brand-sub">Workspace</span>
          </div>
        </div>

        <form className="dash-deck-form" onSubmit={(e) => void handleCmdSubmit(e)}>
          <Search size={14} color="#94a3b8" style={{ flexShrink: 0 }} aria-hidden />
          <input
            className="dash-deck-input"
            type="url"
            placeholder="Paste any YouTube URL to extract verified metrics..."
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            disabled={analyzing}
          />
          <div className="dash-deck-voices">
            <button
              type="button"
              className={`dash-deck-voice${voice === "onyx" ? " dash-deck-voice--active-m" : ""}`}
              onClick={() => onVoiceChange("onyx")}
            >♂ Male</button>
            <button
              type="button"
              className={`dash-deck-voice${voice === "nova" ? " dash-deck-voice--active-f" : ""}`}
              onClick={() => onVoiceChange("nova")}
            >♀ Female</button>
          </div>
          <button
            type="submit"
            className="dash-deck-submit"
            disabled={analyzing || !localUrl.trim()}
          >
            {analyzing ? <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 2, borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.3)" }} /> </> : "⚡ "}
            {analyzing ? "Decoding…" : "Decode"}
          </button>
        </form>

        <div className="dash-deck-sync">
          <span className="home-sync-dot" />
          Sync Active
        </div>
      </div>

      {/* ── Tabbed feed ── */}
      <div className="home-feed-section">
        <div className="home-tabs-bar">
          <div className="home-tabs">
            <button
              type="button"
              className={`home-tab${feedTab === "subscriptions" ? " home-tab--active" : ""}`}
              onClick={() => setFeedTab("subscriptions")}
            >
              <Compass size={14} aria-hidden /> My Subscriptions
            </button>
            <button
              type="button"
              className={`home-tab${feedTab === "briefings" ? " home-tab--active" : ""}`}
              onClick={() => setFeedTab("briefings")}
            >
              <History size={14} aria-hidden /> Recent Briefings
            </button>
          </div>
          <div className="dash-tab-count">
            Showing {feedTab === "briefings" ? history.length : "your"} {feedTab === "briefings" ? "entries" : "subscriptions"}
          </div>
        </div>

        {/* Always mounted so Intelligence Terminal state survives tab switches */}
        <div style={{ display: feedTab === "subscriptions" ? "contents" : "none" }}>
          <SubscriptionFeed onAnalyze={(ytUrl) => { onAnalyzeUrl(ytUrl); }} />
        </div>

        {feedTab === "briefings" && (
          history.length === 0 ? (
            <div className="dash-empty">
              <p className="dash-empty__text">No briefings yet. Paste a YouTube URL above to get started.</p>
            </div>
          ) : (
            <div className="bc-grid">
              {history.slice(0, 8).map((item) => (
                <BriefingCard
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  onSelect={() => onOpenAnalysis(item.id)}
                  onListenBrief={item.audioPath ? () => onListenBrief(item.id) : undefined}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Floating feedback button ── */}
      <a
        href="mailto:hello@watchfilter.app?subject=WatchFilter%20Feedback"
        className="dash-feedback-btn"
        title="Send feedback"
      >
        <MessageSquare size={14} color="#60a5fa" aria-hidden />
        Send Feedback
      </a>
    </div>
  );
}

// ── Library ───────────────────────────────────────────────────────

function libStringHue(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function libRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

const TH: React.CSSProperties = {
  padding: "0.55rem 0.9rem",
  textAlign: "left",
  fontSize: "0.68rem",
  fontWeight: 600,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "#94a3b8",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = { padding: "0.6rem 0.9rem", verticalAlign: "middle" };

function LibraryView({
  history,
  loading,
  activeId,
  onSelect,
  onRefresh,
  onCompare,
  onListenBrief,
}: {
  history: AnalysisSummary[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onCompare: (ids: string[], sources: AnalysisSummary[]) => void;
  onListenBrief?: (id: string) => void;
}) {
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  function toggleCompareMode() { setCompareMode((v) => !v); setSelected(new Set()); }
  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  }
  function handleCompare() {
    const ids = Array.from(selected);
    onCompare(ids, history.filter((i) => ids.includes(i.id)));
    setCompareMode(false);
    setSelected(new Set());
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? history.filter(
        (i) =>
          (i.title ?? "").toLowerCase().includes(q) ||
          (i.channelName ?? "").toLowerCase().includes(q) ||
          i.primarySubject.toLowerCase().includes(q),
      )
    : history;

  return (
    <div className="library-view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Saved Briefings</h1>
          <p className="view-sub">{history.length} {history.length === 1 ? "briefing" : "briefings"} saved</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={loading} title="Refresh">↻</button>
        </div>
      </div>

      <input
        type="search"
        placeholder="Filter by title, channel, or subject…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%", padding: "0.5rem 0.8rem", marginBottom: "1rem",
          border: "1px solid #e2e8f0", borderRadius: "0.5rem",
          fontSize: "0.875rem", background: "var(--surface-2, #f8fafc)",
          color: "inherit", outline: "none", boxSizing: "border-box",
        }}
      />

      {history.length === 0 ? (
        <div className="dash-empty">
          <p className="dash-empty__text">{loading ? "Loading…" : "No saved briefings yet. Analyze a video to get started."}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dash-empty">
          <p className="dash-empty__text">No results for &ldquo;{search}&rdquo;</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{
            minWidth: 560, width: "100%", borderCollapse: "separate", borderSpacing: 0,
            background: "white", border: "1px solid #e2e8f0", borderRadius: "0.75rem",
            overflow: "hidden", boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)", fontSize: "0.875rem",
          }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {compareMode && <th style={TH}>✓</th>}
                <th style={TH}>Creator</th>
                <th style={TH}>Title</th>
                <th style={TH}>Score</th>
                <th style={{ ...TH, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const hue = libStringHue(item.channelName ?? item.videoId);
                const letter = (item.channelName ?? item.videoId)[0]?.toUpperCase() ?? "?";
                const score = item.clickbaitScore;
                const scoreClass = score <= 3 ? "score-ok" : score <= 6 ? "score-mid" : "score-high";
                const scoreLabel = score <= 3 ? "Accurate" : score <= 6 ? "Sensationalized" : "High Clickbait";
                const isSelected = selected.has(item.id);
                const isActive = !compareMode && item.id === activeId;
                const rowBg = isActive ? "#f0f7ff" : isSelected ? "#eff6ff" : "transparent";
                return (
                  <tr key={item.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9", background: rowBg }}>
                    {compareMode && (
                      <td style={TD}>
                        <button
                          type="button"
                          onClick={() => toggleItem(item.id)}
                          aria-label={isSelected ? "Deselect" : "Select for compare"}
                          style={{
                            width: 20, height: 20, borderRadius: 4, cursor: "pointer", padding: 0,
                            border: `2px solid ${isSelected ? "#3b82f6" : "#cbd5e1"}`,
                            background: isSelected ? "#3b82f6" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {isSelected && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </td>
                    )}
                    <td style={TD}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        background: `hsl(${hue}, 55%, 52%)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "white", fontWeight: 700, fontSize: "0.75rem",
                      }} title={item.channelName ?? undefined}>{letter}</div>
                    </td>
                    <td style={{ ...TD, maxWidth: 380 }}>
                      <button
                        type="button"
                        onClick={() => compareMode ? toggleItem(item.id) : onSelect(item.id)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                      >
                        <span style={{
                          display: "block", fontWeight: 500, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360,
                          color: "var(--fg, #0f172a)", lineHeight: 1.4,
                        }}>{item.title ?? item.videoId}</span>
                        <span style={{ display: "block", fontSize: "0.72rem", color: "var(--fg-muted, #64748b)", marginTop: 2 }}>
                          {item.channelName ?? "Unknown"} · {libRelative(item.createdAt)}
                        </span>
                      </button>
                    </td>
                    <td style={TD}>
                      <span className={`bc-score-badge ${scoreClass}`} style={{ whiteSpace: "nowrap" }}>
                        {score}/10 {scoreLabel}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                        {item.audioPath && onListenBrief && (
                          <button
                            type="button"
                            onClick={() => onListenBrief(item.id)}
                            className="bc-btn bc-btn--audio"
                            style={{ padding: "0.28rem 0.55rem", fontSize: "0.75rem" }}
                            title="Play audio briefing"
                          >▶</button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelect(item.id)}
                          className="bc-btn bc-btn--report"
                          style={{ padding: "0.28rem 0.55rem", fontSize: "0.75rem" }}
                          title="Open full report"
                        >Report →</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Creator Trends ────────────────────────────────────────────────

function TrendsView() {
  return (
    <div className="placeholder-view">
      <div className="placeholder-view__icon">📈</div>
      <h1 className="view-title">Market &amp; Creator Trends</h1>
      <p className="view-sub">
        Browse the top pre-analyzed videos across finance, business, and investing — without
        pasting a single link. New users get instant value on day one.
      </p>
      <div className="placeholder-badge">Coming in Phase 2</div>
    </div>
  );
}

// ── Cross-Channel Consensus ───────────────────────────────────────

function CrossChannelConsensusView() {
  const [briefings, setBriefings]               = useState<AnalysisSummary[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [compareMode, setCompareMode]           = useState(false);
  const [selected, setSelected]                 = useState<Set<string>>(new Set());
  const [comparing, setComparing]               = useState(false);
  const [consensus, setConsensus]               = useState<ConsensusResult | null>(null);
  const [consensusSources, setConsensusSources] = useState<AnalysisSummary[]>([]);
  const [error, setError]                       = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analyses")
      .then((r) => r.json())
      .then((data: HistoryResponse & ApiErrorBody) => setBriefings(data.analyses ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  }

  function cancelCompare() {
    setCompareMode(false);
    setSelected(new Set());
    setError(null);
  }

  async function runCompare() {
    const ids = Array.from(selected);
    setComparing(true);
    setError(null);
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as ConsensusResult & ApiErrorBody;
      if (!res.ok) throw new Error((data as ApiErrorBody).error ?? "Consensus failed");
      setConsensus(data);
      setConsensusSources(briefings.filter((b) => ids.includes(b.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consensus failed");
    } finally {
      setComparing(false);
    }
  }

  if (consensus) {
    return (
      <ConsensusView
        result={consensus}
        sources={consensusSources}
        onBack={() => { setConsensus(null); cancelCompare(); }}
      />
    );
  }

  if (comparing) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: "60vh", gap: "1.5rem",
      }}>
        <div style={{ position: "relative", width: 72, height: 72 }}>
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" style={{ animation: "spin 0.9s linear infinite" }}>
            <circle cx="36" cy="36" r="30" stroke="#e2e8f0" strokeWidth="6" />
            <circle cx="36" cy="36" r="30" stroke="var(--accent)" strokeWidth="6"
              strokeLinecap="round" strokeDasharray="94 100" strokeDashoffset="0" />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem", color: "var(--text)" }}>
            Comparing {selected.size} briefings…
          </p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
            Cross-examining creators for consensus signals
          </p>
        </div>
      </div>
    );
  }

  const count = selected.size;
  const atMax = count === 5;
  const canCompare = count >= 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingBottom: compareMode ? "88px" : "0" }}>

      {/* Header */}
      <div>
        <h1 className="view-title">Cross-Channel Consensus</h1>
        <p className="view-sub">
          See what multiple creators are independently agreeing on — across channels, niches,
          and audiences. When unconnected voices converge on the same signal, that&apos;s where
          the real opportunity is.
        </p>
      </div>

      {/* 2×2 feature cards */}
      <div className="feature-grid-2col">
        {[
          { icon: "📡", title: "Multi-Creator Signal Detection", desc: "Automatically surfaces topics that 3+ creators have covered independently within the same time window." },
          { icon: "📊", title: "Agreement Strength Score",       desc: "Ranks consensus signals by how strongly creators agree — not just that they mentioned the same topic, but that their conclusions align." },
          { icon: "⚡", title: "Contrarian Alerts",              desc: "Flags when one creator breaks from the consensus — often the most valuable signal of all." },
          { icon: "🗂️", title: "Evidence Audit Trail",           desc: "Every consensus point links back to the exact timestamp and quote from each creator that contributed to it." },
        ].map((f) => (
          <div key={f.title} className="workspace-feature-card">
            <span className="workspace-feature-card__icon">{f.icon}</span>
            <div>
              <h3 className="workspace-feature-card__title">{f.title}</h3>
              <p className="workspace-feature-card__desc">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Briefing grid header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "var(--muted)" }}>
            Your Saved Briefings
          </p>
          {compareMode && (
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
              {count === 0
                ? "Tap the briefings you want to compare"
                : atMax
                  ? "Max 5 reached — deselect one to swap"
                  : canCompare
                    ? `${count} selected — hit Compare when ready`
                    : `${count} selected — pick ${2 - count} more to compare`}
            </p>
          )}
        </div>

        {!compareMode ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: "0.55rem 1.25rem", fontSize: "0.85rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}
            onClick={() => setCompareMode(true)}
          >
            ⚖ Compare Briefings
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "0.45rem 1rem", fontSize: "0.82rem" }}
            onClick={cancelCompare}
          >
            ✕ Cancel
          </button>
        )}
      </div>

      {error && (
        <div className="status-box status-error">{error}</div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="bc-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ height: 320, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : briefings.length === 0 ? (
        <div className="dash-empty">
          <p className="dash-empty__text">No briefings yet. Analyze a video to get started.</p>
        </div>
      ) : (
        <div className="bc-grid">
          {briefings.map((b) => {
            const isSelected = selected.has(b.id);
            const isDisabled = compareMode && atMax && !isSelected;
            return (
              <div
                key={b.id}
                onClick={() => compareMode && !isDisabled && toggleItem(b.id)}
                style={{
                  cursor: compareMode ? (isDisabled ? "not-allowed" : "pointer") : "default",
                  borderRadius: 14,
                  outline: isSelected ? "2.5px solid var(--accent)" : "2.5px solid transparent",
                  outlineOffset: 2,
                  opacity: isDisabled ? 0.4 : 1,
                  transform: isSelected ? "scale(1.015)" : "scale(1)",
                  transition: "outline 0.15s, opacity 0.15s, transform 0.15s, box-shadow 0.15s",
                  boxShadow: isSelected ? "0 4px 20px rgba(74,111,165,0.22)" : undefined,
                  position: "relative" as const,
                }}
              >
                {compareMode && isSelected && (
                  <div style={{
                    position: "absolute", top: 10, right: 10, zIndex: 10,
                    width: 26, height: 26, borderRadius: "50%",
                    background: "var(--accent)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                  }}>
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                {compareMode && !isSelected && !isDisabled && (
                  <div style={{
                    position: "absolute", top: 10, right: 10, zIndex: 10,
                    width: 26, height: 26, borderRadius: "50%",
                    border: "2px solid rgba(74,111,165,0.4)",
                    background: "rgba(255,255,255,0.9)",
                  }} />
                )}
                <BriefingCard
                  item={b}
                  compareMode={compareMode}
                  compareSelected={isSelected}
                  onSelect={() => compareMode && !isDisabled && toggleItem(b.id)}
                  onToggleCompare={() => compareMode && !isDisabled && toggleItem(b.id)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky compare bar — only in compare mode */}
      {compareMode && (
        <div className="ccv-sticky-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: i <= count ? "var(--accent)" : "rgba(255,255,255,0.12)",
                  border: i <= count ? "none" : "1px solid rgba(255,255,255,0.2)",
                  transition: "background 0.2s",
                }} />
              ))}
            </div>
            <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.83rem" }}>
              {count === 0
                ? "No briefings selected yet"
                : `${count} briefing${count > 1 ? "s" : ""} selected`}
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={cancelCompare}
              style={{
                background: "transparent", border: "1px solid rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.55)", borderRadius: 8,
                padding: "0.5rem 1rem", fontSize: "0.8rem", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canCompare || comparing}
              onClick={() => void runCompare()}
              className="btn btn-primary"
              style={{
                padding: "0.5rem 1.4rem", fontSize: "0.88rem", fontWeight: 700,
                opacity: canCompare ? 1 : 0.4,
                display: "flex", alignItems: "center", gap: "0.45rem",
              }}
            >
              {canCompare ? `Compare ${count} Briefings →` : "Select 2+ to Compare"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Team Workspace ────────────────────────────────────────────────

const TEAM_SIZES = ["Just me", "2–5 people", "6–20 people", "21–50 people", "50+"];

function TeamWorkspaceView() {
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    track("team_workspace_page_viewed");
    fetch("/api/waitlist/team-workspace")
      .then((r) => r.json())
      .then((d: { count: number }) => setCount(d.count))
      .catch(() => null);
  }, []);

  function openModal() {
    track("team_workspace_request_clicked");
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!teamSize) { setFormErr("Please select a team size."); return; }
    setSubmitting(true);
    setFormErr(null);
    try {
      const res = await fetch("/api/waitlist/team-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company, teamSize }),
      });
      const d = await res.json() as { success?: boolean; count?: number; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Failed");
      if (d.count) setCount(d.count);
      track("team_workspace_waitlist_joined", { label: teamSize, value: company.length > 0 ? 1 : 0 });
      setSubmitted(true);
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="placeholder-view">
      <div className="placeholder-view__icon">👥</div>
      <h1 className="view-title">Team Workspace</h1>
      <p className="view-sub">
        Collaborate with your team on intelligence briefings. Share analyses, annotate
        insights, and build a shared knowledge base — all in one place.
      </p>

      {/* Planned features */}
      <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted, #94a3b8)", marginBottom: "0.5rem" }}>Planned Features</p>
      <div className="workspace-features">
        {[
          { icon: "📋", title: "Shared Briefings", desc: "Push any analysis directly to your team's shared library. Everyone stays on the same page." },
          { icon: "💬", title: "Inline Annotations", desc: "Highlight key insights and leave context for your team directly inside any briefing." },
          { icon: "🔔", title: "Daily Intelligence Brief", desc: "Auto-deliver a curated morning brief to your whole team — no manual curation required." },
          { icon: "📊", title: "Team Signal Board", desc: "A live view of every emerging signal your team is tracking, ranked by consensus strength." },
        ].map((f) => (
          <div key={f.title} className="workspace-feature-card">
            <span className="workspace-feature-card__icon">{f.icon}</span>
            <div>
              <h3 className="workspace-feature-card__title">{f.title}</h3>
              <p className="workspace-feature-card__desc">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Early access CTA */}
      <div style={{ marginTop: "2rem", background: "var(--surface, #fff)", border: "1.5px solid var(--border, #e2e8f0)", borderRadius: 16, padding: "1.75rem", textAlign: "center", maxWidth: 480, margin: "2rem auto 0" }}>
        <p style={{ fontWeight: 700, fontSize: "1.05rem", margin: "0 0 0.4rem", color: "var(--text, #0f172a)" }}>Interested in Team Workspaces?</p>
        <p style={{ fontSize: "0.875rem", color: "var(--muted, #64748b)", margin: "0 0 1.25rem", lineHeight: 1.55 }}>
          Help shape the future of collaborative intelligence. Join the early access list and we&apos;ll notify you when Team Workspaces become available.
        </p>
        {count !== null && count > 0 && (
          <p style={{ fontSize: "0.78rem", color: "var(--muted, #64748b)", marginBottom: "0.85rem" }}>
            🙋 {count} professional{count !== 1 ? "s have" : " has"} already requested access.
          </p>
        )}
        <button type="button" className="btn btn-primary" onClick={openModal}>
          Request Early Access
        </button>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fb-overlay" onClick={() => !submitting && setModalOpen(false)}>
          <div className="fb-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Request early access">
            <div className="fb-dialog__header">
              <div className="fb-dialog__title">👥 Request Early Access</div>
              <button type="button" className="fb-dialog__close" onClick={() => setModalOpen(false)} disabled={submitting}>✕</button>
            </div>
            {submitted ? (
              <div className="fb-dialog__sent">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p style={{ fontWeight: 700, fontSize: "1rem", margin: "0.5rem 0 0.25rem" }}>You&apos;re on the list.</p>
                <p style={{ fontSize: "0.85rem", color: "var(--muted, #64748b)", margin: 0 }}>We&apos;ll let you know when Team Workspaces become available.</p>
                {count !== null && count > 0 && (
                  <p style={{ fontSize: "0.78rem", color: "var(--muted, #94a3b8)", marginTop: "0.75rem" }}>
                    {count} professional{count !== 1 ? "s have" : " has"} already requested access.
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="fb-dialog__body">
                <label className="fb-label">
                  Email Address <span style={{ color: "#ef4444" }}>*</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    disabled={submitting}
                    className="fb-textarea"
                    style={{ height: "auto", padding: "0.5rem 0.75rem" }}
                  />
                </label>
                <label className="fb-label">
                  Company Name <span style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)" }}>(optional)</span>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Inc."
                    disabled={submitting}
                    className="fb-textarea"
                    style={{ height: "auto", padding: "0.5rem 0.75rem" }}
                  />
                </label>
                <label className="fb-label">
                  Team Size <span style={{ color: "#ef4444" }}>*</span>
                  <select
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value)}
                    required
                    disabled={submitting}
                    className="fb-select"
                  >
                    <option value="">Select team size…</option>
                    {TEAM_SIZES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                {formErr && <p className="fb-error">{formErr}</p>}
                <div className="fb-dialog__footer">
                  <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting || !email || !teamSize}>
                    {submitting ? <><span className="spinner" /> Submitting…</> : "Join Early Access"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Upgrade ───────────────────────────────────────────────────────

function UpgradeView() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [cancelAt, setCancelAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => r.json())
      .then((d: { isPro: boolean; cancelAt: string | null }) => {
        setIsPro(d.isPro);
        setCancelAt(d.cancelAt);
      })
      .catch(() => setIsPro(false));
  }, []);

  async function handleUpgrade() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Failed to start checkout");
      window.location.href = data.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (isPro) {
    return (
      <div className="placeholder-view">
        <div className="placeholder-view__icon">✅</div>
        <h1 className="view-title">You&apos;re on WatchFilter Pro</h1>
        <p className="view-sub">All executive features are active on your account.</p>
        {cancelAt && (
          <div style={{
            background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a",
            borderRadius: 10, padding: "0.6rem 0.9rem", marginBottom: "1rem",
            fontSize: "0.82rem", fontWeight: 500,
          }}>
            ⚠️ Your subscription will cancel on{" "}
            <strong>{new Date(cancelAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</strong>.
            You keep Pro access until then.
          </div>
        )}
        <div className="upgrade-card">
          <ul className="upgrade-card__features">
            <li>✓ Daily Intelligence Brief</li>
            <li>✓ Cross-Creator Consensus</li>
            <li>✓ Opportunity Detection</li>
            <li>✓ Emerging Signals</li>
            <li>✓ Full Audio Briefings</li>
            <li>✓ Team workspace &amp; sharing</li>
          </ul>
          <button
            type="button"
            className="btn btn-ghost upgrade-card__cta"
            style={{ marginTop: "1rem" }}
            onClick={async () => {
              const res = await fetch("/api/portal", { method: "POST" });
              const d = await res.json() as { url?: string };
              if (d.url) window.location.href = d.url;
            }}
          >
            Manage subscription →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="placeholder-view">
      <div className="placeholder-view__icon">👑</div>
      <h1 className="view-title">WatchFilter Pro</h1>
      <p className="view-sub">
        Executive-tier intelligence. Unlimited briefings, priority processing, and team access.
      </p>
      <div className="upgrade-card">
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "0.4rem",
          background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a",
          borderRadius: 20, padding: "0.25rem 0.75rem", fontSize: "0.75rem",
          fontWeight: 600, marginBottom: "0.85rem",
        }}>
          🧪 Beta — payments not active yet
        </div>
        <div className="upgrade-card__price">
          <span className="upgrade-card__amount">$29</span>
          <span className="upgrade-card__period">/month</span>
        </div>
        <ul className="upgrade-card__features">
          <li>✓ Daily Intelligence Brief</li>
          <li>✓ Cross-Creator Consensus</li>
          <li>✓ Opportunity Detection</li>
          <li>✓ Emerging Signals</li>
          <li>✓ Full Audio Briefings</li>
          <li>✓ Team workspace &amp; sharing</li>
        </ul>
        {err && <p style={{ color: "#ef4444", fontSize: "0.82rem", marginBottom: "0.5rem" }}>{err}</p>}
        <button
          type="button"
          className="btn btn-primary upgrade-card__cta"
          onClick={() => void handleUpgrade()}
          disabled={loading || isPro === null}
        >
          {loading ? "Redirecting…" : "Get Executive Access →"}
        </button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────

export function WatchFilterApp() {
  const [url, setUrl] = useState("");
  const [voice, setVoice] = useState<"onyx" | "nova">("onyx");
  const [history, setHistory] = useState<AnalysisSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [analysis, setAnalysis] = useState<SavedAnalysis | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem>("dashboard");
  const [upgradedBanner, setUpgradedBanner] = useState(false);

  function handleNav(nav: NavItem) {
    setActiveNav(nav);
    if (nav === "dashboard") track("dashboard_viewed");
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      setUpgradedBanner(true);
      setActiveNav("dashboard");
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setUpgradedBanner(false), 6000);
    }
  }, []);
  const [globalAudio, setGlobalAudio] = useState<{
    src: string; title: string; analysisId: string; autoPlay?: boolean;
  } | null>(null);
  const globalAudioRef = useRef(globalAudio);
  const playerRef = useRef<GlobalAudioPlayerHandle>(null);
  useEffect(() => { globalAudioRef.current = globalAudio; }, [globalAudio]);

  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [consensusSources, setConsensusSources] = useState<AnalysisSummary[]>([]);
  const [consensusLoading, setConsensusLoading] = useState(false);
  const [view, setView] = useState<"analysis" | "consensus">("analysis");

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/analyses");
      const data = (await res.json()) as HistoryResponse & ApiErrorBody;
      if (!res.ok) throw new Error(data.error ?? "Failed to load history");
      setHistory(data.analyses);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadAnalysis = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setError(null);
    setView("analysis");
    setActiveNav("analyze");
    try {
      const res = await fetch(`/api/analyses/${id}`);
      const data = (await res.json()) as SavedAnalysis & ApiErrorBody;
      if (!res.ok) throw new Error(data.error ?? "Failed to load analysis");
      setAnalysis(data);
      setActiveId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Surface or update the audio player whenever the analysis (or its audioPath) changes
  useEffect(() => {
    if (!analysis?.audioPath) return;
    setGlobalAudio((prev) => {
      // No player open yet — open it without autoplay
      if (!prev) {
        return { src: analysis.audioPath!, title: analysis.title ?? analysis.videoId, analysisId: analysis.id };
      }
      // Same analysis but audioPath changed (e.g. after backfill + audio regen) — update src silently
      if (prev.analysisId === analysis.id && prev.src !== analysis.audioPath) {
        return { ...prev, src: analysis.audioPath! };
      }
      return prev;
    });
  }, [analysis]);

  function handleListenBrief(id: string) {
    const item = history.find((h) => h.id === id);
    if (!item?.audioPath) return;
    if (globalAudioRef.current?.analysisId === item.id) {
      playerRef.current?.triggerPlay();
    } else {
      setGlobalAudio({ src: item.audioPath, title: item.title ?? item.videoId, analysisId: item.id });
    }
  }


  async function analyzeFromUrl(targetUrl: string) {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    setAnalyzing(true);
    setError(null);
    setActiveNav("analyze");
    setView("analysis");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, voice }),
      });

      const data = (await res.json()) as SavedAnalysis & ApiErrorBody;

      if (!res.ok) {
        let message = data.error ?? "Analysis failed";
        if (data.attempts?.length) {
          message += ` (${data.attempts.length} transcript attempts)`;
        }
        throw new Error(message);
      }

      setAnalysis(data);
      setActiveId(data.id);
      setUrl("");
      track("video_analyzed", { videoId: data.videoId, analysisId: data.id, label: data.title ?? data.videoId });
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await analyzeFromUrl(url);
  }

  async function handleCompare(ids: string[], sources: AnalysisSummary[]) {
    setConsensusLoading(true);
    setError(null);
    setConsensusSources(sources);
    setActiveNav("analyze");
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as ConsensusResult & ApiErrorBody;
      if (!res.ok) throw new Error((data as ApiErrorBody).error ?? "Consensus analysis failed");
      setConsensus(data);
      setView("consensus");
      track("consensus_opened", { label: `${ids.length} analyses` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consensus analysis failed");
    } finally {
      setConsensusLoading(false);
    }
  }

  function handleSelectHistory(id: string) {
    if (id === activeId && analysis && view === "analysis" && activeNav === "analyze") return;
    void loadAnalysis(id);
  }

  const ANALYZE_MESSAGES = [
    "Scanning transcript…",
    "Filtering signal from noise…",
    "Extracting data points…",
    "Mapping causal chains…",
    "Assessing credibility…",
    "Summarising key insights…",
    "Building your briefing…",
  ];
  const CONSENSUS_MESSAGES = [
    "Reading all transcripts…",
    "Finding common ground…",
    "Spotting contradictions…",
    "Synthesising consensus…",
    "Finalising comparison…",
  ];
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!analyzing && !consensusLoading) { setMsgIndex(0); return; }
    setMsgIndex(0);
    const id = setInterval(() => {
      setMsgIndex((i) => {
        const pool = consensusLoading ? CONSENSUS_MESSAGES : ANALYZE_MESSAGES;
        return (i + 1) % pool.length;
      });
    }, 2200);
    return () => clearInterval(id);
  }, [analyzing, consensusLoading]);

  const showLoading = analyzing || loadingDetail || consensusLoading;
  const loadingMessage = loadingDetail
    ? "Loading saved analysis…"
    : consensusLoading
      ? CONSENSUS_MESSAGES[msgIndex % CONSENSUS_MESSAGES.length]
      : ANALYZE_MESSAGES[msgIndex % ANALYZE_MESSAGES.length];

  return (
    <div className="app-shell">
      <AppSidebar
        active={activeNav}
        onNav={handleNav}
        analysisCount={history.length}
      />

      <main className="main-panel">
        {upgradedBanner && (
          <div style={{
            background: "linear-gradient(90deg,#059669,#0d9488)", color: "#fff",
            borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.25rem",
            display: "flex", alignItems: "center", gap: "0.75rem",
            boxShadow: "0 4px 16px rgba(5,150,105,0.25)",
          }}>
            <span style={{ fontSize: "1.4rem" }}>🎉</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem" }}>Welcome to WatchFilter Pro!</p>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.82rem", opacity: 0.9 }}>Your subscription is active. All Pro features are now unlocked.</p>
            </div>
            <button type="button" onClick={() => setUpgradedBanner(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "1.1rem", opacity: 0.8 }}>✕</button>
          </div>
        )}
        {/* ── Dashboard — always mounted so feedTab + feed state survive nav changes ── */}
        <div style={{ display: activeNav === "dashboard" ? "contents" : "none" }}>
          <DashboardView
            history={history}
            activeId={activeId}
            onOpenAnalysis={(id) => void loadAnalysis(id)}
            onListenBrief={(id) => handleListenBrief(id)}
            onAnalyzeUrl={(targetUrl) => void analyzeFromUrl(targetUrl)}
            analyzing={analyzing}
            voice={voice}
            onVoiceChange={setVoice}
          />
        </div>

        {/* ── Analyze Video ── */}
        {activeNav === "analyze" && (
          <>
            <h1 className="brand">WatchFilter</h1>
            <p className="tagline">
              Paste a YouTube URL. Get facts, takeaways, and a clickbait score — saved automatically.
            </p>

            <form className="analyze-form" onSubmit={(e) => void handleSubmit(e)}>
              <input
                className="url-input"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={analyzing}
                required
              />
              <div
                className="voice-toggle"
                title="Audio voice — applies to new analyses only."
              >
                <button
                  type="button"
                  className={`voice-btn${voice === "onyx" ? " voice-btn--active" : ""}`}
                  onClick={() => setVoice("onyx")}
                >
                  ♂ Male
                </button>
                <button
                  type="button"
                  className={`voice-btn${voice === "nova" ? " voice-btn--active" : ""}`}
                  onClick={() => setVoice("nova")}
                >
                  ♀ Female
                </button>
              </div>
              <button className="btn btn-primary" type="submit" disabled={analyzing}>
                {analyzing ? "Analyzing…" : "Analyze"}
              </button>
            </form>

            {showLoading && (
              <div className="status-box status-loading">
                <span className="spinner" /> {loadingMessage}
              </div>
            )}

            {error && (
              <div className="status-box status-error" role="alert">
                {error}
              </div>
            )}

            {view === "consensus" && consensus && !consensusLoading && (
              <ConsensusView
                result={consensus}
                sources={consensusSources}
                onBack={() => setView("analysis")}
              />
            )}

            {view === "analysis" && analysis && !loadingDetail && (
              <AnalysisView
                analysis={analysis}
                onRefresh={() => void loadAnalysis(analysis.id)}
                onReanalyzed={(newAnalysis) => { setAnalysis(newAnalysis); setActiveId(newAnalysis.id); void loadHistory(); }}
                onPlayAudio={analysis.audioPath ? () => {
                  if (globalAudio?.analysisId === analysis.id) {
                    playerRef.current?.triggerPlay();
                  } else {
                    setGlobalAudio({ src: analysis.audioPath!, title: analysis.title ?? analysis.videoId, analysisId: analysis.id });
                  }
                } : undefined}
              />
            )}
          </>
        )}

        {/* ── Library ── */}
        {activeNav === "library" && (
          <LibraryView
            history={history}
            loading={historyLoading}
            activeId={activeId}
            onSelect={(id) => handleSelectHistory(id)}
            onRefresh={() => void loadHistory()}
            onCompare={(ids, sources) => void handleCompare(ids, sources)}
            onListenBrief={(id) => handleListenBrief(id)}
          />
        )}

        {/* ── Subscription Feed — always mounted so state survives nav changes ── */}
        <div style={{ display: activeNav === "feed" ? "contents" : "none" }}>
          <SubscriptionFeed onAnalyze={(ytUrl) => void analyzeFromUrl(ytUrl)} />
        </div>

        {/* ── Trends ── */}
        {activeNav === "trends" && <MarketIntelligencePulse />}

        {/* ── Cross-Channel Consensus ── */}
        {activeNav === "consensus-page" && <CrossChannelConsensusView />}

        {/* ── Team Workspace ── */}
        {activeNav === "workspace" && <TeamWorkspaceView />}

        {/* ── Upgrade ── */}
        {activeNav === "upgrade" && <UpgradeView />}
      </main>

      {globalAudio && (
        <GlobalAudioPlayer
          ref={playerRef}
          src={globalAudio.src}
          title={globalAudio.title}
          analysisId={globalAudio.analysisId}
          autoPlay={globalAudio.autoPlay}
          onClose={() => setGlobalAudio(null)}
          onAudioPathUpdated={(newPath) => {
            setGlobalAudio(prev => prev ? { ...prev, src: newPath } : prev);
            setAnalysis(prev => prev ? { ...prev, audioPath: newPath } : prev);
          }}
        />
      )}
    </div>
  );
}
