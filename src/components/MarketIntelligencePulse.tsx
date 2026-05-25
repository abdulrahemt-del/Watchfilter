"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { FeedVideo } from "@/app/api/youtube/feed/route";
import type { AIScore } from "@/app/api/youtube/filter/route";
import type { ConsensusResult } from "@/app/api/youtube/consensus/route";
import { CorePulseMetrics } from "./widgets/CorePulseMetrics";
import { OpportunityAlertsWidget, type OpportunityAlert } from "./widgets/OpportunityAlertsWidget";
import { ConsensusInsightCards, type InsightCard } from "./widgets/ConsensusInsightCards";
import { CreatorShareOfVoiceWidget, type CreatorVoice } from "./widgets/CreatorShareOfVoiceWidget";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
}

function smartTruncate(s: string, n = 400) {
  return s && s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1 hour ago";
  if (h < 24) return `${h} hour${h !== 1 ? "s" : ""} ago`;
  return `${Math.floor(h / 24)} day${Math.floor(h / 24) !== 1 ? "s" : ""} ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MarketIntelligencePulse() {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? "anon";

  const [feedVideos, setFeedVideos]       = useState<FeedVideo[]>([]);
  const [aiScores, setAiScores]           = useState<Record<string, AIScore>>({});
  const [consensusData, setConsensus]     = useState<ConsensusResult | null>(null);
  const [prevSnapshot, setPrevSnapshot]   = useState<{
    themes: { topic: string; count: number }[];
    vettedCount?: number;
    timeSavedHours?: number;
  } | null>(null);
  const [feedMissing, setFeedMissing]     = useState(false);
  const [feedTs, setFeedTs]               = useState<number | null>(null);
  const [aiLoading, setAiLoading]         = useState(false);
  const [conLoading, setConLoading]       = useState(false);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "authenticated") return;

    const feedKey     = `wf_feed_${email}`;
    const aiKey       = `wf_ai_${email}`;
    const snapshotKey = `wf_snapshot_${email}`;
    const visitKey    = `wf_visit_${email}`;

    try {
      const rawSnap = localStorage.getItem(snapshotKey);
      if (rawSnap) setPrevSnapshot(JSON.parse(rawSnap));
    } catch { /* ignore */ }

    // Restore cached consensus (2-hour TTL) so the page loads instantly on repeat visits
    const conKey = `wf_consensus_${email}`;
    const CON_TTL = 2 * 60 * 60 * 1000;
    try {
      const rawCon = localStorage.getItem(conKey);
      if (rawCon) {
        const { ts, data } = JSON.parse(rawCon) as { ts: number; data: ConsensusResult };
        if (Date.now() - ts < CON_TTL && data) setConsensus(data);
      }
    } catch { /* ignore */ }

    // Update last visit
    try { localStorage.setItem(visitKey, JSON.stringify(Date.now())); } catch { /* ignore */ }

    try {
      const raw = localStorage.getItem(feedKey);
      if (!raw) { setFeedMissing(true); return; }
      const cached = JSON.parse(raw) as { ts: number; videos: FeedVideo[] };
      if (!cached.videos?.length) { setFeedMissing(true); return; }
      setFeedVideos(cached.videos);
      setFeedTs(cached.ts);

      const AI_TTL = 2 * 60 * 60 * 1000;
      try {
        const rawAI = localStorage.getItem(aiKey);
        if (rawAI) {
          const cachedAI = JSON.parse(rawAI) as { ts: number; scores: Record<string, AIScore> };
          if (Date.now() - cachedAI.ts < AI_TTL && Object.keys(cachedAI.scores).length > 0) {
            setAiScores(cachedAI.scores);
            return;
          }
        }
      } catch { /* fall through to rescore */ }

      runAIPipeline(cached.videos, aiKey);
    } catch { setFeedMissing(true); }
  }, [status, email]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAIPipeline(videos: FeedVideo[], aiKey: string) {
    const eligible = videos.filter(v => isoToSeconds(v.duration) >= 1200).slice(0, 100);
    if (!eligible.length) return;

    setAiLoading(true);

    const batches: FeedVideo[][] = [];
    for (let i = 0; i < eligible.length; i += 25) batches.push(eligible.slice(i, i + 25));

    const scanBatch = (batch: FeedVideo[]) =>
      fetch("/api/youtube/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: batch.map(v => ({
            videoId: v.videoId, title: v.title,
            channelTitle: v.channelTitle,
            description: smartTruncate(v.description),
          })),
        }),
      })
        .then(r => r.json() as Promise<{ results?: AIScore[] }>)
        .then(d => d.results ?? [])
        .catch(() => [] as AIScore[]);

    const allResults = await Promise.all(batches.map(scanBatch));
    const newScores: Record<string, AIScore> = {};
    allResults.flat().forEach(r => { newScores[r.videoId] = r; });

    setAiScores(newScores);
    try { localStorage.setItem(aiKey, JSON.stringify({ ts: Date.now(), scores: newScores })); } catch { /* ignore */ }
    setAiLoading(false);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredVideos = useMemo<FeedVideo[]>(() => {
    const aiReady = Object.keys(aiScores).length > 0;
    const base = aiReady
      ? feedVideos.filter(v => aiScores[v.videoId]?.topicCategory !== "excluded")
      : feedVideos.filter(v => isoToSeconds(v.duration) >= 1200);
    return [...base].sort((a, b) => (aiScores[b.videoId]?.score ?? 0) - (aiScores[a.videoId]?.score ?? 0));
  }, [feedVideos, aiScores]);

  const todaysThemes = useMemo(() => {
    const map = new Map<string, { count: number; channels: Set<string>; insights: string[] }>();
    filteredVideos.forEach(v => {
      const ai = aiScores[v.videoId];
      if (!ai) return;
      ai.categories.forEach(cat => {
        if (!cat) return;
        if (!map.has(cat)) map.set(cat, { count: 0, channels: new Set(), insights: [] });
        const e = map.get(cat)!;
        e.count++;
        e.channels.add(v.channelTitle);
        if (ai.whyItMatters && e.insights.length < 4) e.insights.push(ai.whyItMatters);
      });
    });
    const sorted = [...map.entries()].sort((a, b) => b[1].count - a[1].count);
    const usedChannels = new Set<string>();
    return sorted.slice(0, 8).map(([topic, { count, channels, insights }]) => {
      const pills = [...channels].filter(ch => !usedChannels.has(ch)).slice(0, 3);
      pills.forEach(ch => usedChannels.add(ch));
      return { topic, count, creators: channels.size, channelNames: pills, insights };
    });
  }, [filteredVideos, aiScores]);

  // ── Consensus pipeline ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!todaysThemes.length || aiLoading || consensusData) return;
    setConLoading(true);
    const topOpp  = todaysThemes[0];
    const topRisk = todaysThemes.find(t => /risk|crash|warning|decline|crisis/i.test(t.topic)) ?? null;

    fetch("/api/youtube/consensus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        themes: todaysThemes.map(t => ({ topic: t.topic, count: t.count, creators: t.channelNames, insights: t.insights })),
        topOpportunity: { topic: topOpp.topic, count: topOpp.count, creators: topOpp.channelNames, insights: topOpp.insights },
        topRisk: topRisk ? { topic: topRisk.topic, count: topRisk.count, creators: topRisk.channelNames, insights: topRisk.insights } : null,
      }),
    })
      .then(r => r.json())
      .then((data: ConsensusResult) => {
        setConsensus(data);
        try { localStorage.setItem(`wf_consensus_${email}`, JSON.stringify({ ts: Date.now(), data })); } catch { /* ignore */ }
        try {
          localStorage.setItem(`wf_snapshot_${email}`, JSON.stringify({
            ts: Date.now(),
            themes: todaysThemes.map(t => ({ topic: t.topic, count: t.count })),
            vettedCount: filteredVideos.length,
            timeSavedHours: Math.round(
              filteredVideos.reduce((a, v) => a + isoToSeconds(v.duration), 0) * 0.6 / 3600
            ),
          }));
        } catch { /* ignore */ }
      })
      .catch(() => { /* silent fail */ })
      .finally(() => setConLoading(false));
  }, [todaysThemes, aiLoading, email]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Widget data derivations ────────────────────────────────────────────────

  const coreMetrics = useMemo(() => {
    const hp = filteredVideos.filter(v => aiScores[v.videoId]?.topicCategory === "high_priority").length;
    const uniqueChannels = new Set(filteredVideos.map(v => v.channelTitle)).size;
    const totalSecs = filteredVideos.reduce((a, v) => a + isoToSeconds(v.duration), 0);
    const savedHrs = Math.round(totalSecs * 0.6 / 3600);
    return [
      { label: "Feed Size",    value: String(feedVideos.length),    sub: "total videos",     trend: "flat"  as const },
      { label: "Signal Yield", value: String(filteredVideos.length), sub: "approved signals", color: "text-[#4a6fa5]",   trend: "up"   as const },
      { label: "Themes Found", value: String(todaysThemes.length),   sub: "active clusters",  color: "text-[#6b4fbb]", trend: "up"   as const },
      { label: "Priority",     value: String(hp),                    sub: "high-priority",    color: "text-[#0a7a4a]",trend: "up"   as const },
      { label: "Channels",     value: String(uniqueChannels),        sub: "unique sources",   color: "text-[#b45309]",  trend: "flat" as const },
      { label: "Time Saved",   value: `${savedHrs}h`,               sub: "est. saved",       color: "text-cyan-400",   trend: "up"   as const },
    ];
  }, [feedVideos, filteredVideos, aiScores, todaysThemes]);

  const opportunityAlerts = useMemo((): OpportunityAlert[] => {
    if (!todaysThemes.length) return [];
    const alerts: OpportunityAlert[] = [];
    todaysThemes.slice(0, 3).forEach((t, i) => {
      const isRisk = /risk|crash|warning|decline|crisis/i.test(t.topic);
      const isNew  = !prevSnapshot?.themes?.some(p => p.topic.toLowerCase() === t.topic.toLowerCase());
      const type: OpportunityAlert["type"] = isNew ? "Emerging" : i === 0 ? "Critical" : "Stable";
      const prevCount = prevSnapshot?.themes?.find(p => p.topic.toLowerCase() === t.topic.toLowerCase())?.count;
      const delta = prevCount !== undefined
        ? t.count > prevCount ? `+${t.count - prevCount}` : prevCount > t.count ? `-${prevCount - t.count}` : "Steady"
        : isNew ? "New Track" : "Steady";
      const whyItMatters = t.insights[0] ?? undefined;
      if (!isRisk) alerts.push({ id: i + 1, type, label: t.topic, delta, creators: t.creators, videos: t.count, evidenceCount: t.insights.length, whyItMatters });
    });
    // fill with consensus opportunity if available
    if (consensusData?.topOpportunity && alerts.length < 3) {
      const already = alerts.some(a => a.label.toLowerCase() === consensusData.topOpportunity!.topic.toLowerCase());
      if (!already) alerts.push({ id: alerts.length + 1, type: "Emerging", label: consensusData.topOpportunity.topic, delta: `${consensusData.topOpportunity.confidence}% conf`, creators: undefined, videos: undefined, whyItMatters: consensusData.topOpportunity.reason ?? undefined });
    }
    return alerts.slice(0, 4);
  }, [todaysThemes, prevSnapshot, consensusData]);

  const insightCards = useMemo((): InsightCard[] => {
    const prevMap = new Map(
      (prevSnapshot?.themes ?? []).map(t => [t.topic.toLowerCase(), t.count])
    );
    return todaysThemes.slice(0, 6).map(t => {
      const consensusTheme = consensusData?.themes?.find(
        c => c.topic.toLowerCase() === t.topic.toLowerCase()
      ) ?? null;
      const prevCount = prevMap.get(t.topic.toLowerCase());
      const isNew = prevCount === undefined;
      const deltaPercent = !isNew && prevCount > 0
        ? Math.round(((t.count - prevCount) / prevCount) * 100)
        : null;
      return {
        topic:        t.topic,
        consensus:    consensusTheme?.consensus ?? null,
        confidence:   consensusTheme?.confidence ?? null,
        creators:     t.creators,
        videoCount:   t.count,
        channelNames: t.channelNames,
        deltaPercent,
        isNew,
      };
    });
  }, [todaysThemes, consensusData, prevSnapshot]);

  const newOpportunity = useMemo(() => {
    if (!prevSnapshot?.themes?.length || !todaysThemes.length) return null;
    const prevMap = new Map(prevSnapshot.themes.map(t => [t.topic.toLowerCase(), t.count]));
    const best = todaysThemes.reduce<{
      topic: string; prevCount: number; currCount: number; momentum: number;
    } | null>((acc, t) => {
      const prev = prevMap.get(t.topic.toLowerCase());
      if (!prev || prev === 0) return acc;
      const momentum = Math.round(((t.count - prev) / prev) * 100);
      if (momentum <= 50) return acc;
      return !acc || momentum > acc.momentum
        ? { topic: t.topic, prevCount: prev, currCount: t.count, momentum }
        : acc;
    }, null);
    if (!best) return null;
    const match = consensusData?.themes?.find(t => t.topic.toLowerCase() === best.topic.toLowerCase()) ?? null;
    return { ...best, confidence: match?.confidence ?? null, consensus: match?.consensus ?? null };
  }, [prevSnapshot, todaysThemes, consensusData]);

  const creatorVoices = useMemo((): CreatorVoice[] => {
    const map = new Map<string, number>();
    filteredVideos.forEach(v => {
      map.set(v.channelTitle, (map.get(v.channelTitle) ?? 0) + 1);
    });
    const total = filteredVideos.length || 1;
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({
        name,
        count,
        share: Math.round((count / total) * 100),
      }));
  }, [filteredVideos]);

  // ── Live-feel derived state ────────────────────────────────────────────────

  const sinceLastVisit = useMemo(() => {
    if (!prevSnapshot) return null;
    const currentHours = Math.round(
      filteredVideos.reduce((a, v) => a + isoToSeconds(v.duration), 0) * 0.6 / 3600
    );
    const newAlerts = opportunityAlerts.filter(a => a.type === "Emerging").length;
    const newShifts = insightCards.filter(c => c.isNew || (c.deltaPercent !== null && c.deltaPercent > 50)).length;
    const newVetted = prevSnapshot.vettedCount !== undefined
      ? Math.max(0, filteredVideos.length - prevSnapshot.vettedCount)
      : 0;
    const newHours  = prevSnapshot.timeSavedHours !== undefined
      ? Math.max(0, currentHours - prevSnapshot.timeSavedHours)
      : 0;

    const items: { label: string; color: string }[] = [];
    if (newAlerts > 0) items.push({ label: `+${newAlerts} opportunity alert${newAlerts !== 1 ? "s" : ""}`,  color: "text-[#0a7a4a] bg-emerald-500/10 border-emerald-500/20" });
    if (newShifts > 0) items.push({ label: `+${newShifts} consensus shift${newShifts !== 1 ? "s" : ""}`,   color: "text-[#4a6fa5] bg-blue-500/10 border-blue-500/20" });
    if (newVetted > 0) items.push({ label: `+${newVetted} new vetted video${newVetted !== 1 ? "s" : ""}`,  color: "text-[#6b4fbb] bg-purple-500/10 border-purple-500/20" });
    if (newHours  > 0) items.push({ label: `+${newHours}h of content analyzed`,                            color: "text-[#b45309] bg-amber-500/10 border-amber-500/20" });
    return items.length > 0 ? { items } : null;
  }, [prevSnapshot, opportunityAlerts, insightCards, filteredVideos]);

  const biggestChange = useMemo(() => {
    if (!prevSnapshot?.themes?.length || !todaysThemes.length) return null;
    const prevMap   = new Map(prevSnapshot.themes.map(t => [t.topic.toLowerCase(), t.count]));
    const prevTotal = prevSnapshot.themes.reduce((a, t) => a + t.count, 0) || 1;
    const currTotal = todaysThemes.reduce((a, t) => a + t.count, 0) || 1;

    type BestEntry = { topic: string; prevCount: number; currCount: number; delta: number };
    const best = todaysThemes.reduce<BestEntry | null>((acc, t) => {
      const prev = prevMap.get(t.topic.toLowerCase());
      if (prev === undefined) return acc;
      const delta = Math.abs(t.count - prev);
      return !acc || delta > acc.delta ? { topic: t.topic, prevCount: prev, currCount: t.count, delta } : acc;
    }, null);
    if (!best) return null;

    const prevPct = Math.round((best.prevCount / prevTotal) * 100);
    const currPct = Math.round((best.currCount / currTotal) * 100);
    const surging = best.currCount > best.prevCount;
    const match   = consensusData?.themes?.find(t => t.topic.toLowerCase() === best!.topic.toLowerCase())
                 ?? consensusData?.themes?.[0]
                 ?? null;
    return { topic: best.topic, prevPct, currPct, change: currPct - prevPct, surging, reason: match?.consensus ?? null };
  }, [prevSnapshot, todaysThemes, consensusData]);

  const topInsight = useMemo(() => {
    if (!consensusData?.themes?.length || !todaysThemes.length) return null;
    const sorted = [...consensusData.themes].sort((a, b) => b.confidence - a.confidence);
    const top = sorted[0];
    if (!top?.consensus) return null;
    const matchTheme = todaysThemes.find(t => t.topic.toLowerCase() === top.topic.toLowerCase()) ?? todaysThemes[0];
    const conf = top.confidence;
    return {
      statement:         top.consensus,
      topic:             top.topic,
      confidence:        conf,
      confidenceLabel:   conf >= 85 ? "Very High" : conf >= 70 ? "High" : conf >= 55 ? "Medium" : "Emerging",
      supportingCreators: matchTheme.creators,
      videoCount:        matchTheme.count,
    };
  }, [consensusData, todaysThemes]);

  const isLoading = aiLoading || conLoading;

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-[#6b8a99] font-mono text-sm">
        Connecting…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 text-[#6b8a99]">
        <p className="font-mono text-sm">Sign in to view Market Intelligence.</p>
        <Link href="/" className="text-[#4a6fa5] hover:text-[#4a6fa5] font-mono text-sm">← Return to Feed</Link>
      </div>
    );
  }

  if (feedMissing) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 text-center px-6">
        <span className="text-4xl">📡</span>
        <h2 className="text-[#0f2535] font-black text-lg">No feed data yet</h2>
        <p className="text-[#6b8a99] font-mono text-xs max-w-xs">
          Load your subscription feed first, then return here for your intelligence briefing.
        </p>
        <Link href="/" className="mt-2 bg-blue-600 hover:bg-blue-500 text-[#0f2535] font-bold text-sm px-5 py-2 rounded-lg transition-colors">
          ← Go to Feed
        </Link>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 bg-white min-h-screen text-[#1a2e3b] font-sans">

      {/* HEADER HUD */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#c0d6df] pb-4 gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-[10px] font-mono text-[#6b8a99] hover:text-[#6b8a99] transition-colors">
            ← Feed
          </Link>
          <div>
            <h1 className="text-xl font-black text-[#0f2535] tracking-tight flex items-center gap-2">
              📡 Market Intelligence Hub
            </h1>
            <p className="text-xs text-[#6b8a99]">
              Real-time thematic shifts synthesized from your subscription channels.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isLoading && (
            <span className="text-[10px] font-mono text-[#b45309] bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg animate-pulse">
              {aiLoading ? "⚙ Scoring…" : "⚙ Synthesizing…"}
            </span>
          )}
          <div className="text-xs font-mono text-[#6b8a99] bg-[#dbe9ee]/50 px-3 py-1.5 rounded-lg border border-[#c0d6df]">
            Last Sync:{" "}
            <span className="text-[#4a6fa5]">{feedTs ? timeAgo(feedTs) : "—"}</span>
          </div>
        </div>
      </div>

      {/* ⏱ SINCE YOUR LAST VISIT */}
      {sinceLastVisit && (
        <div className="flex flex-wrap gap-2 px-1">
          <span className="text-[9px] font-mono text-[#4f6d7a] uppercase tracking-widest self-center mr-1">Since last visit:</span>
          {sinceLastVisit.items.map((item, i) => (
            <span key={i} className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border ${item.color}`}>
              {item.label}
            </span>
          ))}
        </div>
      )}

      {/* 🎯 MOST IMPORTANT INSIGHT TODAY */}
      {topInsight ? (
        <div className="bg-gradient-to-br from-blue-950/60 via-[#101520] to-purple-950/50 border border-blue-500/60/40 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-black text-[#4a6fa5] tracking-widest uppercase">🎯 Most Important Insight Today</span>
          </div>
          <p className="text-base font-bold text-[#0f2535] leading-relaxed">
            {topInsight.statement}
          </p>
          <div className="grid grid-cols-3 gap-4 pt-1 border-t border-[#c0d6df]">
            <div>
              <p className="text-[9px] font-mono text-[#6b8a99] uppercase tracking-wider mb-1">Confidence</p>
              <p className={`text-sm font-black ${topInsight.confidence >= 70 ? "text-[#0a7a4a]" : "text-[#b45309]"}`}>
                {topInsight.confidence}%
              </p>
              <p className="text-[9px] text-[#6b8a99] font-mono">{topInsight.confidenceLabel}</p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-[#6b8a99] uppercase tracking-wider mb-1">Supporting Creators</p>
              <p className="text-sm font-black text-[#0f2535]">{topInsight.supportingCreators}</p>
              <p className="text-[9px] text-[#6b8a99] font-mono">independent</p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-[#6b8a99] uppercase tracking-wider mb-1">Supporting Videos</p>
              <p className="text-sm font-black text-[#0f2535]">{topInsight.videoCount}</p>
              <p className="text-[9px] text-[#6b8a99] font-mono">{topInsight.topic}</p>
            </div>
          </div>
        </div>
      ) : conLoading ? (
        <div className="bg-[#101520] border border-[#c0d6df] rounded-xl p-6 animate-pulse space-y-4">
          <div className="h-3 w-52 bg-[#c0d6df] rounded" />
          <div className="h-5 w-full bg-[#c0d6df] rounded" />
          <div className="h-4 w-3/4 bg-[#c0d6df] rounded" />
          <div className="h-3 w-40 bg-[#c0d6df] rounded" />
        </div>
      ) : null}

      {/* 🚀 NEW OPPORTUNITY DETECTED */}
      {newOpportunity && (
        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-black text-[#0a7a4a] tracking-widest uppercase">🚀 New Opportunity Detected</span>
              <span className="text-[9px] font-mono font-black px-2 py-0.5 rounded bg-emerald-500/20 text-[#0a7a4a] border border-emerald-500/30 animate-pulse">
                +{newOpportunity.momentum}% momentum
              </span>
            </div>
            {newOpportunity.confidence !== null && (
              <span className="text-[9px] font-mono text-[#0a7a4a]">{newOpportunity.confidence}% conf</span>
            )}
          </div>
          <p className="text-base font-black text-[#0f2535]">{newOpportunity.topic}</p>
          <div className="flex items-center gap-6 text-[10px] font-mono">
            <span className="text-[#6b8a99]">
              Last visit: <span className="text-[#6b8a99] font-bold">{newOpportunity.prevCount} video{newOpportunity.prevCount !== 1 ? "s" : ""}</span>
            </span>
            <span className="text-[#4f6d7a]">→</span>
            <span className="text-[#6b8a99]">
              Today: <span className="text-[#0a7a4a] font-bold">{newOpportunity.currCount} video{newOpportunity.currCount !== 1 ? "s" : ""}</span>
            </span>
          </div>
          {newOpportunity.consensus && (
            <p className="text-xs text-emerald-200/80 leading-relaxed pl-3 border-l-2 border-emerald-500/40">
              {newOpportunity.consensus}
            </p>
          )}
        </div>
      )}

      {/* 📊 BIGGEST CHANGE TODAY */}
      {biggestChange && (
        <div className="bg-[#101520] border border-[#a8bfcb]/60 rounded-xl p-5 space-y-3">
          <span className="text-[10px] font-mono font-black text-[#6b8a99] tracking-widest uppercase">📊 Biggest Change Today</span>
          <div className="flex items-center gap-4">
            <p className="text-sm font-black text-[#0f2535] flex-1">{biggestChange.topic}</p>
            <div className="flex items-center gap-3 shrink-0 text-[11px] font-mono">
              <span className="text-[#6b8a99]">{biggestChange.prevPct}%</span>
              <span className="text-[#4f6d7a]">→</span>
              <span className={`font-black ${biggestChange.surging ? "text-[#0a7a4a]" : "text-[#c0392b]"}`}>
                {biggestChange.currPct}%
                <span className="ml-1">{biggestChange.surging ? "↑" : "↓"}</span>
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-black border ${biggestChange.surging ? "text-[#0a7a4a] bg-emerald-500/10 border-emerald-500/20" : "text-[#c0392b] bg-red-500/10 border-red-500/20"}`}>
                {biggestChange.change > 0 ? "+" : ""}{biggestChange.change}pp
              </span>
            </div>
          </div>
          {biggestChange.reason && (
            <p className="text-xs text-[#6b8a99] leading-relaxed pl-3 border-l-2 border-[#a8bfcb]/50">
              {biggestChange.reason}
            </p>
          )}
        </div>
      )}

      {/* CREATOR CONSENSUS — MAIN INTELLIGENCE GRID */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-[#6b8a99] tracking-wider uppercase font-mono">
            ⚡ Creator Consensus
          </h2>
          <span className="text-[10px] text-[#6b8a99] font-mono">
            {insightCards.filter(c => c.consensus).length} of {insightCards.length} themes synthesized
          </span>
        </div>
        <ConsensusInsightCards cards={insightCards} loading={isLoading && !insightCards.length} />
      </div>

      {/* EVIDENCE ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#101520] border border-[#c0d6df]/80 rounded-xl p-5 space-y-4">
          <OpportunityAlertsWidget alerts={opportunityAlerts} loading={aiLoading} />
        </div>
        <div className="bg-[#101520] border border-[#c0d6df]/80 rounded-xl p-5 space-y-4">
          <CreatorShareOfVoiceWidget creators={creatorVoices} loading={aiLoading} />
        </div>
      </div>

      {/* DATA STRIP */}
      <CorePulseMetrics metrics={coreMetrics} loading={isLoading && !coreMetrics.some(m => m.value !== "0")} />

      {/* DO THIS TODAY */}
      {(consensusData?.actions?.length ?? 0) > 0 && (
        <div className="bg-[#101520] border border-blue-500/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#c0d6df] pb-2">
            <h3 className="text-xs font-bold text-[#6b8a99] tracking-wider uppercase font-mono">
              🎯 Do This Today
            </h3>
            <span className="text-[10px] text-[#6b8a99] font-mono">Based on creator consensus</span>
          </div>
          <ol className="space-y-2.5">
            {consensusData!.actions.map((action, i) => (
              <li key={i} className="flex gap-3 text-xs text-[#6b8a99] leading-relaxed">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-600 text-[#0f2535] font-black text-[9px] flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}

    </div>
  );
}
