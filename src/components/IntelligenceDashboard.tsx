"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FeedVideo } from "@/app/api/youtube/feed/route";
import type { AIScore } from "@/app/api/youtube/filter/route";
import type { ConsensusResult } from "@/app/api/youtube/consensus/route";
import {
  calcEvidenceStrength,
  hasHardData,
  meetsOpportunityThreshold,
  meetsRiskThreshold,
  STRENGTH_BADGE,
  STRENGTH_BAR_PCT,
  type EvidenceStrength,
} from "@/lib/evidence";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
}

function formatAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function smartTruncate(desc: string, max = 400): string {
  if (!desc || desc.length <= max) return desc;
  return desc.slice(0, max).trimEnd() + "…";
}

// ── SVG: Intelligence Score Ring ──────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const R = 44, C = 2 * Math.PI * R;
  const dash = (score / 100) * C;
  const color = score >= 80 ? "#22c55e" : score >= 65 ? "#3b82f6" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg viewBox="0 0 110 110" className="id-score-ring" aria-hidden>
      <circle cx={55} cy={55} r={R} fill="none" stroke="#1e293b" strokeWidth={7} />
      <circle cx={55} cy={55} r={R} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash.toFixed(1)} ${(C - dash).toFixed(1)}`}
        strokeDashoffset={(C * 0.25).toFixed(1)}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }} />
      <text x={55} y={51} textAnchor="middle" fontSize={22} fontWeight={800} fill={color}
        fontFamily="system-ui, -apple-system, sans-serif">{score}</text>
      <text x={55} y={65} textAnchor="middle" fontSize={9} fill="#64748b"
        fontFamily="system-ui, -apple-system, sans-serif">INTEL SCORE</text>
    </svg>
  );
}


// ── Main Component ────────────────────────────────────────────────────────────

const CACHE_TTL = 24 * 60 * 60 * 1000;

function readCacheSync<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch { return null; }
}

function getLastEmail(): string {
  try { return localStorage.getItem("wf_last_email") ?? "anon"; } catch { return "anon"; }
}

export function IntelligenceDashboard() {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? "anon";

  // Read all cached data synchronously on first render — no spinner, no blank flash
  const [feedVideos, setFeedVideos] = useState<FeedVideo[]>(() => {
    const e = getLastEmail();
    const cached = readCacheSync<{ ts: number; videos: FeedVideo[] }>(`wf_feed_${e}`);
    return cached?.videos ?? [];
  });
  const [aiScores, setAiScores] = useState<Record<string, AIScore>>(() => {
    const e = getLastEmail();
    const cached = readCacheSync<{ ts: number; scores: Record<string, AIScore> }>(`wf_ai_${e}`);
    if (cached && Date.now() - cached.ts < CACHE_TTL && Object.keys(cached.scores).length > 0) return cached.scores;
    return {};
  });
  const [consensusData, setConsensus] = useState<ConsensusResult | null>(() => {
    const e = getLastEmail();
    const cached = readCacheSync<{ ts: number; data: ConsensusResult }>(`wf_consensus_${e}`);
    if (cached && Date.now() - cached.ts < CACHE_TTL && cached.data) return cached.data;
    return null;
  });
  const [lastVisit, setLastVisit]       = useState<Date | null>(null);
  const [prevSnapshot, setPrevSnapshot] = useState<{ themes: { topic: string; count: number }[] } | null>(null);
  const [feedMissing, setFeedMissing]   = useState(false);
  const [aiLoading, setAiLoading]       = useState(false);
  const consensusFiredRef               = useRef(false);
  const [consensusLoading, setConLoading] = useState(false);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(() => {
    const e = getLastEmail();
    const cached = readCacheSync<{ ts: number; videos: FeedVideo[] }>(`wf_feed_${e}`);
    return cached ? new Date(cached.ts) : null;
  });

  // ── Bootstrap: verify session, write last email, kick off pipeline if needed ─
  useEffect(() => {
    if (status !== "authenticated") return;

    // Save email so next page load can pre-populate from correct cache keys
    try { localStorage.setItem("wf_last_email", email); } catch { /* ignore */ }

    const feedKey     = `wf_feed_${email}`;
    const aiKey       = `wf_ai_${email}`;
    const visitKey    = `wf_visit_${email}`;
    const snapshotKey = `wf_snapshot_${email}`;

    try {
      const rawVisit = localStorage.getItem(visitKey);
      if (rawVisit) setLastVisit(new Date(JSON.parse(rawVisit) as number));
      localStorage.setItem(visitKey, JSON.stringify(Date.now()));

      const rawSnap = localStorage.getItem(snapshotKey);
      if (rawSnap) setPrevSnapshot(JSON.parse(rawSnap) as { themes: { topic: string; count: number }[] });
    } catch { /* ignore */ }

    try {
      const raw = localStorage.getItem(feedKey);
      if (!raw) { setFeedMissing(true); return; }
      const cached = JSON.parse(raw) as { ts: number; videos: FeedVideo[] };
      if (!cached.videos?.length) { setFeedMissing(true); return; }
      if (!feedVideos.length) setFeedVideos(cached.videos);
      if (!lastUpdated) setLastUpdated(new Date(cached.ts));

      // Skip AI pipeline if scores already loaded from cache
      if (Object.keys(aiScores).length > 0) return;

      // Check if AI cache is fresh
      try {
        const rawAI = localStorage.getItem(aiKey);
        if (rawAI) {
          const cachedAI = JSON.parse(rawAI) as { ts: number; scores: Record<string, AIScore> };
          if (Date.now() - cachedAI.ts < CACHE_TTL && Object.keys(cachedAI.scores).length > 0) {
            setAiScores(cachedAI.scores);
            return;
          }
        }
      } catch { /* corrupt AI cache */ }

      runAIPipeline(cached.videos, aiKey);
    } catch { setFeedMissing(true); }
  }, [status, email]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAIPipeline(videos: FeedVideo[], aiKey: string) {
    const eligible = videos.filter(v => isoToSeconds(v.duration) >= 1200).slice(0, 50);
    if (!eligible.length) return;

    setAiLoading(true);
    const batches: FeedVideo[][] = [];
    for (let i = 0; i < eligible.length; i += 25) batches.push(eligible.slice(i, i + 25));

    const accumulated: Record<string, AIScore> = {};

    const scanBatch = async (batch: FeedVideo[]): Promise<void> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch("/api/youtube/filter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videos: batch.map(v => ({
              videoId:      v.videoId,
              title:        v.title,
              channelTitle: v.channelTitle,
              description:  smartTruncate(v.description, 400),
            })),
          }),
          signal: controller.signal,
        });
        const data = await res.json() as { results?: AIScore[] };
        (data.results ?? []).forEach(r => { accumulated[r.videoId] = r; });
        // Render immediately with whatever we have — don't wait for other batches
        setAiScores({ ...accumulated });
      } catch {
        // silent — partial results still render
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      await Promise.all(batches.map(scanBatch));
      try { localStorage.setItem(aiKey, JSON.stringify({ ts: Date.now(), scores: accumulated })); } catch { /* storage full */ }
    } finally {
      setAiLoading(false);
    }
  }

  // ── Derived: filtered + ranked video list ─────────────────────────────────
  const filteredVideos = useMemo<FeedVideo[]>(() => {
    if (!feedVideos.length) return [];
    const aiReady = Object.keys(aiScores).length > 0;
    const base = aiReady
      ? feedVideos.filter(v => aiScores[v.videoId]?.topicCategory !== "excluded")
      : feedVideos.filter(v => isoToSeconds(v.duration) >= 1200);
    return [...base].sort((a, b) => (aiScores[b.videoId]?.score ?? 0) - (aiScores[a.videoId]?.score ?? 0));
  }, [feedVideos, aiScores]);

  // ── Derived: theme map (same deduplication logic as main feed) ────────────
  const todaysThemes = useMemo(() => {
    const map = new Map<string, { count: number; channels: Set<string>; insights: string[]; hardDataCount: number }>();
    filteredVideos.forEach(v => {
      const ai = aiScores[v.videoId];
      if (!ai) return;
      ai.categories.forEach(cat => {
        if (!cat) return;
        if (!map.has(cat)) map.set(cat, { count: 0, channels: new Set(), insights: [], hardDataCount: 0 });
        const e = map.get(cat)!;
        e.count++;
        e.channels.add(v.channelTitle);
        if (ai.whyItMatters) {
          if (e.insights.length < 4) e.insights.push(ai.whyItMatters);
          if (hasHardData(ai.whyItMatters)) e.hardDataCount++;
        }
      });
    });
    const sorted = [...map.entries()].sort((a, b) => b[1].count - a[1].count);
    const usedChannels = new Set<string>();
    return sorted.slice(0, 8).map(([topic, { count, channels, insights, hardDataCount }]) => {
      const pills = [...channels].filter(ch => !usedChannels.has(ch)).slice(0, 3);
      pills.forEach(ch => usedChannels.add(ch));
      const evidenceStrength = calcEvidenceStrength(channels.size, count, insights.length, hardDataCount);
      return { topic, count, creators: channels.size, channelNames: pills, insights, hardDataCount, evidenceStrength };
    });
  }, [filteredVideos, aiScores]);

  // ── Derived: stat aggregates ──────────────────────────────────────────────
  const uniqueChannels = useMemo(
    () => new Set(filteredVideos.map(v => v.channelTitle)).size,
    [filteredVideos],
  );

  const highPriorityCount = useMemo(
    () => filteredVideos.filter(v => aiScores[v.videoId]?.topicCategory === "high_priority").length,
    [filteredVideos, aiScores],
  );

  // ── Derived: influential creators ─────────────────────────────────────────
  const influentialCreators = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    filteredVideos.forEach(v => {
      if (!map.has(v.channelTitle)) map.set(v.channelTitle, { count: 0, total: 0 });
      const e = map.get(v.channelTitle)!;
      e.count++;
      e.total += aiScores[v.videoId]?.score ?? 0;
    });
    return [...map.entries()]
      .map(([ch, { count, total }]) => ({ channel: ch, count, avgScore: Math.round(total / count) }))
      .sort((a, b) => b.avgScore * Math.log1p(b.count) - a.avgScore * Math.log1p(a.count))
      .slice(0, 8);
  }, [filteredVideos, aiScores]);

  // ── Derived: missed since last visit ─────────────────────────────────────
  const missedVideos = useMemo(() => {
    if (!lastVisit) return [];
    return filteredVideos.filter(v => new Date(v.publishedAt) > lastVisit).slice(0, 6);
  }, [filteredVideos, lastVisit]);

  // ── Derived: consensus shift vs previous snapshot ─────────────────────────
  const shiftData = useMemo(() => {
    if (!prevSnapshot?.themes?.length || !todaysThemes.length) return [];
    const prevMap = new Map(prevSnapshot.themes.map(t => [t.topic.toLowerCase(), t.count]));
    return todaysThemes
      .map(t => ({
        topic:   t.topic,
        current: t.count,
        delta:   t.count - (prevMap.get(t.topic.toLowerCase()) ?? 0),
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6);
  }, [todaysThemes, prevSnapshot]);

  // ── Derived: intelligence score ───────────────────────────────────────────
  const intelligenceScore = useMemo(() => {
    if (!filteredVideos.length || !todaysThemes.length) return null;
    const quality   = Math.round((highPriorityCount / Math.max(filteredVideos.length, 1)) * 100);
    const diversity = Math.min(100, uniqueChannels * 4);
    const coverage  = Math.min(100, todaysThemes.length * 13);
    const avgEvidencePct = Math.round(
      todaysThemes.reduce((a, t) => a + STRENGTH_BAR_PCT[t.evidenceStrength], 0) / todaysThemes.length,
    );
    return Math.min(99, Math.round(quality * 0.30 + diversity * 0.20 + coverage * 0.20 + avgEvidencePct * 0.30));
  }, [filteredVideos, highPriorityCount, uniqueChannels, todaysThemes]);

  // ── Derived: top opportunity videos (fallback when no consensus yet) ───────
  const opportunityVideos = useMemo(
    () => filteredVideos
      .filter(v => {
        const ai = aiScores[v.videoId];
        return ai && ai.score >= 75 && (
          ai.categories.some(c => /opportunity|growth|saas|startup|revenue|scale/i.test(c)) ||
          ai.topicCategory === "high_priority"
        );
      })
      .slice(0, 4),
    [filteredVideos, aiScores],
  );

  // ── Consensus pipeline (fires as soon as themes are available, parallel with AI scoring) ──
  useEffect(() => {
    if (!todaysThemes.length || consensusData || consensusFiredRef.current) return;
    // Need at least 3 themes to be worth synthesizing
    if (todaysThemes.length < 3) return;

    consensusFiredRef.current = true;
    setConLoading(true);
    const topOpp  = todaysThemes.find(t => /opportunity|growth|startup|revenue/i.test(t.topic)) ?? todaysThemes[0];
    const topRisk = todaysThemes.find(t => /risk|crash|warning|decline|crisis/i.test(t.topic)) ?? null;

    fetch("/api/youtube/consensus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        themes: todaysThemes.map(t => ({
          topic: t.topic, count: t.count, creators: t.channelNames, insights: t.insights,
        })),
        topOpportunity: { topic: topOpp.topic, count: topOpp.count, creators: topOpp.channelNames, insights: topOpp.insights },
        topRisk: topRisk ? { topic: topRisk.topic, count: topRisk.count, creators: topRisk.channelNames, insights: topRisk.insights } : null,
      }),
    })
      .then(r => r.json())
      .then((data: ConsensusResult) => {
        setConsensus(data);
        try {
          localStorage.setItem(`wf_consensus_${email}`, JSON.stringify({ ts: Date.now(), data }));
          localStorage.setItem(`wf_snapshot_${email}`, JSON.stringify({
            ts: Date.now(),
            themes: todaysThemes.map(t => ({ topic: t.topic, count: t.count })),
          }));
        } catch { /* storage full */ }
      })
      .catch(() => { /* silent fail */ })
      .finally(() => setConLoading(false));
  }, [todaysThemes, consensusData, email]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render guards ──────────────────────────────────────────────────────────
  if (status === "unauthenticated") {
    return (
      <div className="id-page id-page--center">
        <p style={{ color: "#64748b" }}>Sign in to view your Intelligence Dashboard.</p>
        <Link href="/" className="id-btn-primary">← Return to Feed</Link>
      </div>
    );
  }

  if (feedMissing) {
    return (
      <div className="id-page id-page--center">
        <div className="id-empty-state">
          <span className="id-empty-state__icon">📡</span>
          <h2 className="id-empty-state__title">No feed data yet</h2>
          <p className="id-empty-state__body">
            Load your subscription feed first — it only takes a moment. Then return here for your full intelligence briefing.
          </p>
          <Link href="/" className="id-btn-primary">← Go to Feed</Link>
        </div>
      </div>
    );
  }

  const aiReady = Object.keys(aiScores).length > 0;
  const grade = intelligenceScore
    ? intelligenceScore >= 80 ? "A" : intelligenceScore >= 65 ? "B" : intelligenceScore >= 50 ? "C" : "D"
    : "—";

  // ── Dashboard ──────────────────────────────────────────────────────────────
  return (
    <div className="id-page">

      {/* ── Header ── */}
      <header className="id-header">
        <div className="id-header__left">
          <Link href="/" className="id-header__back">← Feed</Link>
          <div>
            <h1 className="id-header__title">Intelligence Dashboard</h1>
            <p className="id-header__sub">
              {lastUpdated ? `Feed cached ${formatAge(lastUpdated.toISOString())}` : ""}
              {aiLoading ? " · Scoring videos…" : aiReady ? ` · ${filteredVideos.length} signals processed` : ""}
            </p>
          </div>
        </div>
        <div className="id-header__right">
          {aiLoading      && <span className="id-status id-status--loading"><span className="spinner" /> AI Scoring…</span>}
          {consensusLoading && <span className="id-status id-status--loading"><span className="spinner" /> Synthesizing…</span>}
          {!aiLoading && !consensusLoading && aiReady && (
            <span className="id-status id-status--ready">⚡ Live Intelligence</span>
          )}
        </div>
      </header>

      {/* ── KPI Strip ── */}
      <div className="id-kpi-strip">
        <div className="id-kpi-card">
          <span className="id-kpi-card__icon">📊</span>
          <div className="id-kpi-card__value">{feedVideos.length}</div>
          <div className="id-kpi-card__label">Videos Fetched</div>
        </div>
        <div className="id-kpi-card">
          <span className="id-kpi-card__icon">⚡</span>
          <div className="id-kpi-card__value id-kpi-card__value--blue">{filteredVideos.length}</div>
          <div className="id-kpi-card__label">High-Signal</div>
        </div>
        <div className="id-kpi-card">
          <span className="id-kpi-card__icon">📡</span>
          <div className="id-kpi-card__value id-kpi-card__value--purple">{uniqueChannels}</div>
          <div className="id-kpi-card__label">Unique Channels</div>
        </div>
        <div className="id-kpi-card">
          <span className="id-kpi-card__icon">📈</span>
          <div className="id-kpi-card__value id-kpi-card__value--green">{todaysThemes.length}</div>
          <div className="id-kpi-card__label">Major Themes</div>
        </div>
        <div className="id-kpi-card">
          <span className="id-kpi-card__icon">🎯</span>
          <div className="id-kpi-card__value id-kpi-card__value--amber">{highPriorityCount}</div>
          <div className="id-kpi-card__label">Priority Signals</div>
        </div>
        {missedVideos.length > 0 && (
          <div className="id-kpi-card id-kpi-card--alert">
            <span className="id-kpi-card__icon">🔔</span>
            <div className="id-kpi-card__value id-kpi-card__value--red">{missedVideos.length}</div>
            <div className="id-kpi-card__label">Missed Since Last Visit</div>
          </div>
        )}
      </div>

      {/* ── Main 2-col grid ── */}
      <div className="id-grid">

        {/* ════ Left column ════ */}
        <div className="id-col-main">

          {/* Intelligence Score */}
          <div className="id-section id-section--score">
            <div className="id-section__head">
              <h2 className="id-section__title">Intelligence Score</h2>
              <span className="id-section__badge">Today</span>
            </div>
            <div className="id-score-wrap">
              {intelligenceScore !== null
                ? <ScoreRing score={intelligenceScore} />
                : <div className="id-score-skeleton" />}
              <div className="id-score-breakdown">
                <div className="id-score-row">
                  <span className="id-score-row__label">Signal Quality</span>
                  <div className="id-score-bar">
                    <div className="id-score-bar__fill id-score-bar__fill--blue"
                      style={{ width: `${Math.round(highPriorityCount / Math.max(filteredVideos.length, 1) * 100)}%` }} />
                  </div>
                  <span className="id-score-row__val">
                    {Math.round(highPriorityCount / Math.max(filteredVideos.length, 1) * 100)}%
                  </span>
                </div>
                <div className="id-score-row">
                  <span className="id-score-row__label">Source Diversity</span>
                  <div className="id-score-bar">
                    <div className="id-score-bar__fill id-score-bar__fill--purple"
                      style={{ width: `${Math.min(100, uniqueChannels * 4)}%` }} />
                  </div>
                  <span className="id-score-row__val">{uniqueChannels} ch</span>
                </div>
                <div className="id-score-row">
                  <span className="id-score-row__label">Theme Coverage</span>
                  <div className="id-score-bar">
                    <div className="id-score-bar__fill id-score-bar__fill--green"
                      style={{ width: `${Math.min(100, todaysThemes.length * 13)}%` }} />
                  </div>
                  <span className="id-score-row__val">{todaysThemes.length} themes</span>
                </div>
                <div className="id-score-row">
                  <span className="id-score-row__label">Grade</span>
                  <div className="id-score-bar" />
                  <span className="id-score-row__val id-score-row__val--grade">{grade}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Executive Brief */}
          <div className="id-section">
            <div className="id-section__head">
              <h2 className="id-section__title">Executive Brief</h2>
              {consensusLoading && <span className="id-section__badge id-section__badge--loading">Synthesizing…</span>}
              {consensusData && !consensusLoading && <span className="id-section__badge">⚡ AI Synthesized</span>}
            </div>
            {consensusData?.executiveBrief?.length ? (
              <ul className="id-brief-list">
                {consensusData.executiveBrief.map((b, i) => (
                  <li key={i} className="id-brief-item">
                    <span className="id-brief-item__num">{i + 1}</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : consensusLoading ? (
              <div className="id-skeleton-lines">
                {[90, 75, 82, 68, 78].map(w => (
                  <div key={w} className="id-skeleton-line" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <p className="id-section__empty">
                {aiLoading ? "Waiting for AI scoring to complete…" : "Activate a mode in the main feed to generate a brief."}
              </p>
            )}
          </div>

          {/* Missed While Away */}
          {(missedVideos.length > 0 || lastVisit) && (
            <div className="id-section id-section--missed">
              <div className="id-section__head">
                <h2 className="id-section__title">Missed While Away</h2>
                {lastVisit && (
                  <span className="id-section__badge">Since {formatAge(lastVisit.toISOString())}</span>
                )}
              </div>
              {missedVideos.length > 0 ? (
                <div className="id-missed-list">
                  {missedVideos.map(v => {
                    const ai = aiScores[v.videoId];
                    return (
                      <a key={v.videoId}
                        href={`https://youtube.com/watch?v=${v.videoId}`}
                        target="_blank" rel="noopener noreferrer"
                        className="id-missed-item">
                        <div className="id-missed-item__score">{ai?.score ?? "—"}</div>
                        <div className="id-missed-item__body">
                          <div className="id-missed-item__title">{v.title}</div>
                          <div className="id-missed-item__meta">
                            {v.channelTitle} · {formatAge(v.publishedAt)}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <p className="id-section__empty">You&apos;re all caught up since your last visit.</p>
              )}
            </div>
          )}

          {/* Opportunity Alerts */}
          <div className="id-section id-section--opp">
            <div className="id-section__head">
              <h2 className="id-section__title">🚀 Opportunity Alerts</h2>
            </div>
            {(() => {
              const oppTheme = todaysThemes.find(t =>
                meetsOpportunityThreshold(t.creators, t.count, t.insights.length) &&
                /opportunity|growth|startup|revenue|saas|scale/i.test(t.topic),
              ) ?? (todaysThemes.find(t => meetsOpportunityThreshold(t.creators, t.count, t.insights.length)));
              return oppTheme && consensusData?.topOpportunity ? (
              <div className="id-opp-card">
                <div className="id-opp-card__label">Top Opportunity</div>
                <h3 className="id-opp-card__topic">{consensusData.topOpportunity.topic}</h3>
                <p className="id-opp-card__reason">{consensusData.topOpportunity.reason}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${STRENGTH_BADGE[oppTheme.evidenceStrength]}`}>
                    {oppTheme.evidenceStrength}
                  </span>
                  <span className="text-[10px] font-mono text-[#6b8a99]">
                    {oppTheme.creators} creators · {oppTheme.count} videos
                  </span>
                </div>
              </div>
            ) : null; })()}
            {opportunityVideos.length > 0 && !consensusData?.topOpportunity ? (
              <div className="id-missed-list">
                {opportunityVideos.map(v => {
                  const ai = aiScores[v.videoId];
                  return (
                    <a key={v.videoId}
                      href={`https://youtube.com/watch?v=${v.videoId}`}
                      target="_blank" rel="noopener noreferrer"
                      className="id-missed-item id-missed-item--opp">
                      <div className="id-missed-item__score id-missed-item__score--green">{ai?.score ?? "—"}</div>
                      <div className="id-missed-item__body">
                        <div className="id-missed-item__title">{v.title}</div>
                        <div className="id-missed-item__meta">{v.channelTitle}</div>
                        {ai?.whyItMatters && (
                          <div className="id-missed-item__why">{ai.whyItMatters}</div>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="id-section__empty">
                {consensusLoading ? "Scanning for opportunities…" : "No major opportunities flagged today."}
              </p>
            )}
          </div>

          {/* Do This Today */}
          {(consensusData?.actions?.length ?? 0) > 0 && (
            <div className="id-section id-section--actions">
              <div className="id-section__head">
                <h2 className="id-section__title">Do This Today</h2>
                <span className="id-section__badge">Based on creator consensus</span>
              </div>
              <ol className="id-actions-list">
                {consensusData!.actions.map((action, i) => (
                  <li key={i} className="id-actions-item">
                    <span className="id-actions-item__num">{i + 1}</span>
                    <span className="id-actions-item__text">{action}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

        </div>

        {/* ════ Right column ════ */}
        <div className="id-col-side">

          {/* Risk Monitor */}
          <div className={`id-section${consensusData?.topRisk ? " id-section--risk" : " id-section--safe"}`}>
            <div className="id-section__head">
              <h2 className="id-section__title">
                {consensusData?.topRisk ? "⚠️ Risk Monitor" : "✅ Risk Monitor"}
              </h2>
            </div>
            {(() => {
              const riskTheme = todaysThemes.find(t =>
                meetsRiskThreshold(t.creators, t.count) &&
                /risk|crash|warning|decline|crisis/i.test(t.topic),
              );
              if (riskTheme && consensusData?.topRisk) return (
                <>
                  <h3 className="id-risk-topic">{consensusData.topRisk.topic}</h3>
                  <p className="id-risk-reason">{consensusData.topRisk.reason}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${STRENGTH_BADGE[riskTheme.evidenceStrength]}`}>
                      {riskTheme.evidenceStrength}
                    </span>
                    <span className="text-[10px] font-mono text-[#6b8a99]">
                      {riskTheme.creators} creators · {riskTheme.count} videos
                    </span>
                  </div>
                </>
              );
              return (
                <p className="id-section__empty id-section__empty--ok">
                  {consensusLoading ? "Scanning for risks…" : "No consensus risks detected today."}
                </p>
              );
            })()}
          </div>

          {/* Creator Consensus Engine */}
          <div className="id-section">
            <div className="id-section__head">
              <h2 className="id-section__title">Creator Consensus Engine</h2>
            </div>
            {todaysThemes.length > 0 ? (
              <div className="id-consensus-list">
                {todaysThemes.slice(0, 6).map((t, i) => {
                  const cTheme = consensusData?.themes.find(
                    ct => ct.topic.toLowerCase() === t.topic.toLowerCase(),
                  );
                  return (
                    <div key={t.topic} className="id-consensus-row">
                      <div className="id-consensus-row__rank">#{i + 1}</div>
                      <div className="id-consensus-row__body">
                        <div className="id-consensus-row__topic">{t.topic}</div>
                        {cTheme?.consensus && (
                          <div className="id-consensus-row__statement">{cTheme.consensus}</div>
                        )}
                        <div className="id-consensus-row__pills">
                          {t.channelNames.map(ch => (
                            <span key={ch} className="id-consensus-row__pill">{ch}</span>
                          ))}
                          {t.creators > t.channelNames.length && (
                            <span className="id-consensus-row__pill id-consensus-row__pill--more">
                              +{t.creators - t.channelNames.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="id-consensus-row__conf">
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${STRENGTH_BADGE[t.evidenceStrength]}`}>
                          {t.evidenceStrength}
                        </span>
                        <div className="id-consensus-row__bar mt-1">
                          <div className="id-consensus-row__bar-fill" style={{ width: `${STRENGTH_BAR_PCT[t.evidenceStrength]}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : aiLoading ? (
              <div className="id-skeleton-lines">
                {[85, 70, 78].map(w => (
                  <div key={w} className="id-skeleton-line" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <p className="id-section__empty">No themes detected. Activate a mode in the main feed first.</p>
            )}
          </div>

          {/* What Changed Today */}
          <div className="id-section">
            <div className="id-section__head">
              <h2 className="id-section__title">What Changed Today</h2>
              <span className="id-section__badge">vs. last visit</span>
            </div>
            {shiftData.length > 0 ? (
              <div className="id-shift-list">
                {shiftData.map(item => {
                  const icon = item.delta > 0 ? "↑" : item.delta < 0 ? "↓" : "→";
                  const label =
                    item.delta > 0
                      ? `${item.topic} gaining momentum (+${item.delta} videos)`
                      : item.delta < 0
                      ? `${item.topic} declining (−${Math.abs(item.delta)} videos)`
                      : `${item.topic} holding steady`;
                  return (
                    <div key={item.topic} className="id-shift-row">
                      <div className="id-shift-row__topic">
                        <span className={
                          item.delta > 0 ? "id-shift-delta id-shift-delta--up" :
                          item.delta < 0 ? "id-shift-delta id-shift-delta--down" :
                          "id-shift-delta id-shift-delta--flat"
                        }>{icon}</span>
                        {label}
                      </div>
                      <div className="id-shift-row__right">
                        <span className="id-shift-row__current">{item.current} videos</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="id-section__empty">
                {prevSnapshot ? "No significant shifts detected." : "First visit — return tomorrow for daily change tracking."}
              </p>
            )}
          </div>

          {/* Emerging Trends */}
          <div className="id-section">
            <div className="id-section__head">
              <h2 className="id-section__title">Emerging Trends</h2>
            </div>
            {todaysThemes.length > 0 ? (
              <table className="id-table">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th style={{ textAlign: "right" }}>Videos</th>
                    <th style={{ textAlign: "right" }}>Creators</th>
                    <th style={{ textAlign: "right" }}>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {todaysThemes.map((t, i) => (
                    <tr key={t.topic}>
                      <td>
                        <span className="id-table__rank">#{i + 1}</span>
                        {t.topic}
                      </td>
                      <td style={{ textAlign: "right" }}>{t.count}</td>
                      <td style={{ textAlign: "right" }}>{t.creators}</td>
                      <td style={{ textAlign: "right" }}>
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${STRENGTH_BADGE[t.evidenceStrength]}`}>
                          {t.evidenceStrength}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="id-section__empty">{aiLoading ? "Detecting themes…" : "No trends detected yet."}</p>
            )}
          </div>

          {/* Most Influential Creators */}
          <div className="id-section">
            <div className="id-section__head">
              <h2 className="id-section__title">Most Influential Creators</h2>
            </div>
            {influentialCreators.length > 0 ? (
              <div className="id-creators-list">
                {influentialCreators.map((c, i) => (
                  <div key={c.channel} className="id-creator-row">
                    <span className="id-creator-row__rank">#{i + 1}</span>
                    <div className="id-creator-row__body">
                      <div className="id-creator-row__name">{c.channel}</div>
                      <div className="id-creator-row__meta">
                        {c.count} video{c.count !== 1 ? "s" : ""} · avg score {c.avgScore}
                      </div>
                    </div>
                    <div className="id-creator-row__bar">
                      <div className="id-creator-row__bar-fill" style={{ width: `${c.avgScore}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="id-section__empty">{aiLoading ? "Ranking creators…" : "No data yet."}</p>
            )}
          </div>

          {/* Opportunity Heatmap */}
          {todaysThemes.length > 0 && (
            <div className="id-section">
              <div className="id-section__head">
                <h2 className="id-section__title">Opportunity Heatmap</h2>
              </div>
              <div className="id-heatmap">
                {todaysThemes.map(t => {
                  const level = t.evidenceStrength === "Very Strong" ? "high" : t.evidenceStrength === "Strong" || t.evidenceStrength === "Medium" ? "mid" : "low";
                  return (
                    <div key={t.topic} className={`id-heatmap-cell id-heatmap-cell--${level}`}>
                      <div className="id-heatmap-cell__topic">{t.topic}</div>
                      <div className="id-heatmap-cell__count">{t.count} video{t.count !== 1 ? "s" : ""}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
