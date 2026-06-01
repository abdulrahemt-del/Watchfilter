"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FeedVideo } from "@/app/api/youtube/feed/route";
import type { AIScore } from "@/app/api/youtube/filter/route";
import type { ConsensusResult } from "@/app/api/youtube/consensus/route";
import { useFilteredFeed, isoToSeconds, INTEL_CATEGORY_BLOCKS, type FeedMode } from "@/hooks/useFilteredSubscriptionFeed";
import { CorePulseMetrics } from "./widgets/CorePulseMetrics";
import { OpportunityAlertsWidget, type OpportunityAlert } from "./widgets/OpportunityAlertsWidget";
import { CollapsibleSignalCards, type EmergingSignalTheme } from "./widgets/CollapsibleSignalCards";
import { CreatorShareOfVoiceWidget, type CreatorVoice } from "./widgets/CreatorShareOfVoiceWidget";

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

// ── Cache helpers ─────────────────────────────────────────────────────────────

const AI_TTL  = 24 * 60 * 60 * 1000; // 24 hours
const CON_TTL = 24 * 60 * 60 * 1000;

function getLastEmail(): string {
  try { return localStorage.getItem("wf_last_email") ?? "anon"; } catch { return "anon"; }
}

function readCacheSync<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MarketIntelligencePulse() {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? "anon";

  // Use the same mode the feed is currently in (defaults to "founder" for intelligence breadth)
  const [mode] = useState<FeedMode>(() => {
    try {
      const saved = sessionStorage.getItem("wf_feed_mode");
      if (saved === "business" || saved === "founder" || saved === "finance") return saved as FeedMode;
    } catch { /* ignore */ }
    // Default to "business" — broader than "founder", includes finance/investing channels
    return "business";
  });

  // Read all caches synchronously on first render — content appears without a blank flash
  const [feedVideos, setFeedVideos] = useState<FeedVideo[]>(() => {
    const e = getLastEmail();
    return readCacheSync<{ ts: number; videos: FeedVideo[] }>(`wf_feed_${e}`)?.videos ?? [];
  });

  // Apply the EXACT same structural filter as SubscriptionFeed — channel blocks, title blocks,
  // duration gate, and mode-specific keyword inclusion. Intelligence only covers this pool.
  const structuralFilter = useFilteredFeed(feedVideos, mode);

  const [aiScores, setAiScores] = useState<Record<string, AIScore>>(() => {
    const e = getLastEmail();
    const c = readCacheSync<{ ts: number; scores: Record<string, AIScore> }>(`wf_ai_${e}`);
    if (c && Date.now() - c.ts < AI_TTL && Object.keys(c.scores).length > 0) return c.scores;
    return {};
  });
  const [consensusData, setConsensus] = useState<ConsensusResult | null>(() => {
    const e = getLastEmail();
    const c = readCacheSync<{ ts: number; data: ConsensusResult }>(`wf_consensus_${e}`);
    if (c && Date.now() - c.ts < CON_TTL && c.data) return c.data;
    return null;
  });
  const [prevSnapshot, setPrevSnapshot]   = useState<{
    themes: { topic: string; count: number }[];
    vettedCount?: number;
    timeSavedHours?: number;
  } | null>(null);
  const [feedMissing, setFeedMissing]     = useState(false);
  const [feedTs, setFeedTs]               = useState<number | null>(() => {
    const e = getLastEmail();
    return readCacheSync<{ ts: number; videos: FeedVideo[] }>(`wf_feed_${e}`)?.ts ?? null;
  });
  const [aiLoading, setAiLoading]         = useState(false);
  const [conLoading, setConLoading]       = useState(false);

  // ── Bootstrap: load feed data only ────────────────────────────────────────
  useEffect(() => {
    if (status !== "authenticated") return;

    const feedKey     = `wf_feed_${email}`;
    const snapshotKey = `wf_snapshot_${email}`;
    const visitKey    = `wf_visit_${email}`;

    try { localStorage.setItem("wf_last_email", email); } catch { /* ignore */ }
    try { const rawSnap = localStorage.getItem(snapshotKey); if (rawSnap) setPrevSnapshot(JSON.parse(rawSnap)); } catch { /* ignore */ }
    try { localStorage.setItem(visitKey, JSON.stringify(Date.now())); } catch { /* ignore */ }

    try {
      const raw = localStorage.getItem(feedKey);
      if (!raw) { setFeedMissing(true); return; }
      const cached = JSON.parse(raw) as { ts: number; videos: FeedVideo[] };
      if (!cached.videos?.length) { setFeedMissing(true); return; }
      if (!feedVideos.length) setFeedVideos(cached.videos);
      if (!feedTs) setFeedTs(cached.ts);
      // AI pipeline handled by the separate effect below that watches structuralFilter
    } catch { setFeedMissing(true); }
  }, [status, email]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI pipeline: fires once structural filter is ready ─────────────────────
  // Separated so it always uses the filtered pool, never the raw feed.
  const aiPipelineStarted = useRef(false);
  useEffect(() => {
    if (!structuralFilter.length || aiPipelineStarted.current) return;
    if (Object.keys(aiScores).length > 0) return; // Already populated from sync init

    aiPipelineStarted.current = true;
    const aiKey = `wf_ai_${email}`;

    // localStorage cache check
    let hasLocalCache = false;
    try {
      const rawAI = localStorage.getItem(aiKey);
      if (rawAI) {
        const cachedAI = JSON.parse(rawAI) as { ts: number; scores: Record<string, AIScore> };
        if (Date.now() - cachedAI.ts < AI_TTL && Object.keys(cachedAI.scores).length > 0) {
          setAiScores(cachedAI.scores);
          hasLocalCache = true;
        }
      }
    } catch { /* ignore */ }
    if (hasLocalCache) return;

    // Cloud cache → full pipeline
    void (async () => {
      try {
        const cloudRes = await fetch("/api/intelligence/scores");
        if (cloudRes.ok) {
          const cloud = await cloudRes.json() as { cached: boolean; aiScores?: Record<string, AIScore>; consensusData?: ConsensusResult; cachedAt?: number };
          if (cloud.cached && cloud.aiScores && Object.keys(cloud.aiScores).length > 0) {
            setAiScores(cloud.aiScores);
            try { localStorage.setItem(aiKey, JSON.stringify({ ts: cloud.cachedAt ?? Date.now(), scores: cloud.aiScores })); } catch { /* ignore */ }
            if (cloud.consensusData) {
              setConsensus(cloud.consensusData);
              try { localStorage.setItem(`wf_consensus_${email}`, JSON.stringify({ ts: cloud.cachedAt ?? Date.now(), data: cloud.consensusData })); } catch { /* ignore */ }
            }
            return;
          }
        }
      } catch { /* cloud unavailable — fall through to pipeline */ }
      runAIPipeline(structuralFilter, aiKey);
    })();
  }, [structuralFilter.length, email]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAIPipeline(videos: FeedVideo[], aiKey: string) {
    // videos is already the structural filter output — channel blocks, title blocks,
    // duration gate, and mode keyword inclusion already applied. Cap at 100 to cover
    // users with many subscribed channels across diverse categories.
    const eligible = videos.slice(0, 100);
    if (!eligible.length) return;

    setAiLoading(true);

    const batches: FeedVideo[][] = [];
    for (let i = 0; i < eligible.length; i += 25) batches.push(eligible.slice(i, i + 25));

    const accumulated: Record<string, AIScore> = {};

    const scanBatch = async (batch: FeedVideo[]): Promise<void> => {
      try {
        const res = await fetch("/api/youtube/filter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videos: batch.map(v => ({
              videoId: v.videoId, title: v.title,
              channelTitle: v.channelTitle,
              description: smartTruncate(v.description),
            })),
          }),
        });
        const data = await res.json() as { results?: AIScore[] };
        (data.results ?? []).forEach(r => { accumulated[r.videoId] = r; });
        // Render progressively — don't wait for all batches
        setAiScores({ ...accumulated });
      } catch { /* silent — partial results still render */ }
    };

    await Promise.all(batches.map(scanBatch));

    const finalScores = { ...accumulated };
    setAiScores(finalScores);
    try { localStorage.setItem(aiKey, JSON.stringify({ ts: Date.now(), scores: finalScores })); } catch { /* ignore */ }
    setAiLoading(false);

    // Save scores to cloud so other devices can skip the pipeline
    fetch("/api/intelligence/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiScores: finalScores, consensusData: null }),
    }).catch(() => { /* non-blocking */ });
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  // filteredVideos = structural filter → AI exclusion gate.
  // This matches exactly what SubscriptionFeed shows in the feed grid.
  const filteredVideos = useMemo<FeedVideo[]>(() => {
    const aiReady = Object.keys(aiScores).length > 0;
    const base = aiReady
      ? structuralFilter.filter(v => aiScores[v.videoId]?.topicCategory !== "excluded")
      : structuralFilter;
    return [...base].sort((a, b) => (aiScores[b.videoId]?.score ?? 0) - (aiScores[a.videoId]?.score ?? 0));
  }, [structuralFilter, aiScores]);

  const todaysThemes = useMemo(() => {
    const blocked = (mode === "founder" || mode === "finance" || mode === "business")
      ? (INTEL_CATEGORY_BLOCKS[mode] ?? [])
      : [];
    const map = new Map<string, { count: number; channels: Set<string>; insights: string[] }>();
    filteredVideos.forEach(v => {
      const ai = aiScores[v.videoId];
      if (!ai) return;
      ai.categories.forEach(cat => {
        if (!cat) return;
        // Skip categories that don't belong in this mode's intelligence brief
        const catLower = cat.toLowerCase();
        if (blocked.some(b => catLower === b || catLower.startsWith(b))) return;
        if (!map.has(cat)) map.set(cat, { count: 0, channels: new Set(), insights: [] });
        const e = map.get(cat)!;
        e.count++;
        e.channels.add(v.channelTitle);
        if (ai.whyItMatters && e.insights.length < 4) e.insights.push(ai.whyItMatters);
      });
    });
    const sorted = [...map.entries()].sort((a, b) => b[1].count - a[1].count);
    // Require at least 2 unique creators per theme — single-creator topics are noise.
    // Each theme gets its own full creator list (up to 5) without cross-theme deduplication,
    // so finance/investing themes aren't starved of creators by an AI theme running first.
    return sorted
      .filter(([, { channels }]) => channels.size >= 2)
      .slice(0, 8)
      .map(([topic, { count, channels, insights }]) => ({
        topic, count, creators: channels.size,
        channelNames: [...channels].slice(0, 5),
        insights,
      }));
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
        // Update cloud cache with both scores and consensus
        const currentScores = Object.keys(aiScores).length > 0 ? aiScores : null;
        if (currentScores) {
          fetch("/api/intelligence/scores", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aiScores: currentScores, consensusData: data }),
          }).catch(() => { /* non-blocking */ });
        }
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
        ? t.count > prevCount ? `+${t.count - prevCount} videos` : prevCount > t.count ? `-${prevCount - t.count} videos` : "Steady"
        : isNew ? "New Signal" : "Steady";
      const ct = consensusData?.themes?.find(c => c.topic.toLowerCase() === t.topic.toLowerCase());
      if (!isRisk) alerts.push({
        id: i + 1, type, label: t.topic, delta,
        creators: t.creators, videos: t.count, evidenceCount: t.insights.length,
        whyItMatters: ct?.whyItMatters || t.insights[0] || undefined,
        whyNow: ct?.whyItMatters || consensusData?.topOpportunity?.reason || undefined,
        riskFactors: ct?.contrarianView || undefined,
        suggestedAction: ct?.recommendedActions?.[0] || undefined,
      });
    });
    if (consensusData?.topOpportunity && alerts.length < 3) {
      const already = alerts.some(a => a.label.toLowerCase() === consensusData.topOpportunity!.topic.toLowerCase());
      if (!already) {
        const ct = consensusData.themes?.find(c => c.topic.toLowerCase() === consensusData.topOpportunity!.topic.toLowerCase());
        alerts.push({
          id: alerts.length + 1, type: "Emerging",
          label: consensusData.topOpportunity.topic,
          delta: `${consensusData.topOpportunity.confidence}% confidence`,
          whyNow: consensusData.topOpportunity.reason ?? undefined,
          riskFactors: ct?.contrarianView || undefined,
          suggestedAction: ct?.recommendedActions?.[0] || undefined,
        });
      }
    }
    return alerts.slice(0, 4);
  }, [todaysThemes, prevSnapshot, consensusData]);

  const emergingSignalThemes = useMemo((): EmergingSignalTheme[] => {
    return todaysThemes.slice(0, 6).map((theme, i) => {
      const ct = consensusData?.themes?.find(c => c.topic.toLowerCase() === theme.topic.toLowerCase()) ?? null;
      const topicVideos = filteredVideos
        .filter(v => {
          const ai = aiScores[v.videoId];
          if (!ai) return false;
          const topicLower = theme.topic.toLowerCase();
          const firstWord  = topicLower.split(" ")[0];
          return ai.categories.some(cat => {
            const catLower = cat.toLowerCase();
            return catLower === topicLower || catLower.includes(firstWord) || topicLower.includes(catLower.split(" ")[0]);
          });
        })
        .slice(0, 6);

      const citations = topicVideos.map((v, j) => {
        const ai = aiScores[v.videoId];
        const timeSavedMins = Math.round(isoToSeconds(v.duration) * 0.6 / 60);
        return {
          id: `${theme.topic}-cit-${j}`,
          creatorChannel: v.channelTitle,
          videoTitle: v.title,
          videoId: v.videoId,
          evidenceText: ai?.explanation || ai?.whyItMatters || "",
          timeSavedMins: timeSavedMins > 0 ? timeSavedMins : null,
        };
      });

      const conf = ct?.confidence ?? Math.min(40 + theme.creators * 10, 92);
      const strength: EmergingSignalTheme["evidenceStrength"] =
        theme.count >= 5 || conf >= 75 ? "High" : theme.count >= 3 || conf >= 55 ? "Medium" : "Low";

      return {
        id:                  `theme-${i}`,
        rankIndex:           `#${i + 1}`,
        topicTitle:          theme.topic,
        macroTakeaway:       ct?.consensus || theme.insights[0] || "",
        agreementPercentage: conf,
        evidenceStrength:    strength,
        totalCreatorsCount:  theme.creators,
        totalVideosLinked:   theme.count,
        citationsList:       citations,
        trendDirection:      ct?.trendDirection ?? "stable",
        whyItMatters:        ct?.whyItMatters ?? "",
        recommendedActions:  ct?.recommendedActions ?? [],
        contrarianView:      ct?.contrarianView ?? "",
        opportunitySignal:   ct?.opportunitySignal ?? "Low",
      };
    });
  }, [todaysThemes, filteredVideos, aiScores, consensusData]);

  // ── What Changed Today ────────────────────────────────────────────────────

  type ChangeType = "new" | "rank_up" | "rank_down" | "accelerating" | "declining";
  interface ChangeEvent {
    topic: string; type: ChangeType;
    prevRank?: number; currRank?: number;
    prevCount?: number; currCount?: number;
    pctChange?: number; rankChange?: number;
    creators: number; channelNames: string[];
    whyItMatters?: string; consensus?: string;
    trendDirection?: "growing" | "stable" | "declining";
  }

  const whatChangedToday = useMemo((): ChangeEvent[] => {
    if (!prevSnapshot?.themes?.length || !todaysThemes.length) return [];
    const prevMap = new Map(prevSnapshot.themes.map((t, i) => [t.topic.toLowerCase(), { count: t.count, rank: i + 1 }]));
    const events: ChangeEvent[] = [];

    todaysThemes.forEach((t, i) => {
      const currRank = i + 1;
      const prev = prevMap.get(t.topic.toLowerCase());
      const ct = consensusData?.themes?.find(c => c.topic.toLowerCase() === t.topic.toLowerCase());

      if (!prev) {
        events.push({
          topic: t.topic, type: "new", currRank, currCount: t.count,
          creators: t.creators, channelNames: t.channelNames,
          whyItMatters: ct?.whyItMatters || t.insights[0] || undefined,
          consensus: ct?.consensus || undefined,
          trendDirection: ct?.trendDirection,
        });
      } else {
        const pctChange  = prev.count > 0 ? Math.round(((t.count - prev.count) / prev.count) * 100) : 0;
        const rankChange = prev.rank - currRank;
        if (Math.abs(pctChange) >= 10 || Math.abs(rankChange) >= 1) {
          const type: ChangeType =
            pctChange >= 50 ? "accelerating" :
            (pctChange > 0 || rankChange > 0) ? "rank_up" :
            pctChange <= -20 ? "declining" : "rank_down";
          events.push({
            topic: t.topic, type, prevRank: prev.rank, currRank,
            prevCount: prev.count, currCount: t.count,
            pctChange, rankChange,
            creators: t.creators, channelNames: t.channelNames,
            whyItMatters: ct?.whyItMatters || t.insights[0] || undefined,
            consensus: ct?.consensus || undefined,
            trendDirection: ct?.trendDirection,
          });
        }
      }
    });

    prevSnapshot.themes.slice(0, 8).forEach((pt, i) => {
      const stillPresent = todaysThemes.some(t => t.topic.toLowerCase() === pt.topic.toLowerCase());
      if (!stillPresent && pt.count > 1) {
        events.push({
          topic: pt.topic, type: "declining", prevRank: i + 1, prevCount: pt.count,
          currCount: 0, pctChange: -100, creators: 0, channelNames: [],
        });
      }
    });

    return events.sort((a, b) => {
      if (a.type === "new" && b.type !== "new") return -1;
      if (b.type === "new" && a.type !== "new") return 1;
      const score = (e: ChangeEvent) => Math.abs(e.pctChange ?? 0) + Math.abs(e.rankChange ?? 0) * 15;
      return score(b) - score(a);
    }).slice(0, 7);
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


  const topInsight = useMemo(() => {
    if (!consensusData?.themes?.length || !todaysThemes.length) return null;
    const sorted = [...consensusData.themes].sort((a, b) => b.confidence - a.confidence);
    const top = sorted[0];
    if (!top?.consensus) return null;
    const matchTheme = todaysThemes.find(t => t.topic.toLowerCase() === top.topic.toLowerCase()) ?? todaysThemes[0];
    const conf = top.confidence;
    return {
      statement:          top.consensus,
      topic:              top.topic,
      confidence:         conf,
      confidenceLabel:    conf >= 85 ? "Very High" : conf >= 70 ? "High" : conf >= 55 ? "Medium" : "Emerging",
      supportingCreators: matchTheme.creators,
      videoCount:         matchTheme.count,
      whyItMatters:       top.whyItMatters ?? "",
      suggestedAction:    top.recommendedActions?.[0] ?? "",
      contrarianView:     top.contrarianView ?? "",
      trendDirection:     top.trendDirection ?? "stable",
    };
  }, [consensusData, todaysThemes]);

  const isLoading = aiLoading || conLoading;

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0c1829] flex items-center justify-center text-slate-500 font-mono text-sm">
        Connecting…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#0c1829] flex flex-col items-center justify-center gap-4 text-slate-500">
        <p className="font-mono text-sm">Sign in to view Market Intelligence.</p>
        <Link href="/" className="text-blue-400 hover:text-blue-300 font-mono text-sm transition-colors">← Return to Feed</Link>
      </div>
    );
  }

  if (feedMissing) {
    return (
      <div className="min-h-screen bg-[#0c1829] flex flex-col items-center justify-center gap-4 text-center px-6">
        <span className="text-4xl">📡</span>
        <h2 className="text-white font-black text-lg">No feed data yet</h2>
        <p className="text-slate-500 font-mono text-xs max-w-xs">
          Load your subscription feed first, then return here for your full intelligence briefing.
        </p>
        <Link href="/" className="mt-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-5 py-2 rounded-lg transition-colors">
          ← Go to Feed
        </Link>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#0c1829] min-h-screen text-slate-100 font-sans antialiased">
    <div className="w-full px-4 md:px-6 py-6 space-y-8">

      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-[10px] font-mono text-slate-500 hover:text-slate-300 transition-colors">
            ← Feed
          </Link>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              📡 WatchFilter Intelligence Terminal
            </h1>
            <p className="text-xs text-slate-500 font-mono">
              Creator consensus synthesized from your subscription channels
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isLoading && (
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg animate-pulse">
              {aiLoading ? "⚙ Scoring your feed… (first load ~30s, then cached for 12h)" : "⚙ Synthesizing…"}
            </span>
          )}
          <div className="text-xs font-mono text-slate-500 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
            Last Sync: <span className="text-blue-400">{feedTs ? timeAgo(feedTs) : "—"}</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          1. HIGHEST CONVICTION SIGNAL — HERO
         ══════════════════════════════════════════════ */}
      {topInsight ? (
        <div className="bg-gradient-to-br from-[#0d1f3c] via-[#0d1520] to-[#130d2a] border border-blue-500/30 rounded-2xl p-6 shadow-[0_0_48px_rgba(59,130,246,0.07)] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-[10px] font-mono text-blue-400 font-black uppercase tracking-widest">
              🎯 Highest Conviction Signal Today
            </div>
            {topInsight.trendDirection && (
              <span className={`text-[10px] font-mono font-black ${
                topInsight.trendDirection === "growing"  ? "text-emerald-400" :
                topInsight.trendDirection === "declining" ? "text-red-400" : "text-slate-400"
              }`}>
                {topInsight.trendDirection === "growing" ? "↑ Growing" : topInsight.trendDirection === "declining" ? "↓ Declining" : "→ Stable"}
              </span>
            )}
          </div>
          <p className="text-lg font-bold text-white leading-relaxed">{topInsight.statement}</p>
          {topInsight.whyItMatters && (
            <p className="text-sm text-blue-200/70 leading-relaxed">{topInsight.whyItMatters}</p>
          )}
          <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-blue-500/20">
            <div>
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">Evidence</p>
              <p className="text-sm font-black text-white">
                {topInsight.supportingCreators} creators · {topInsight.videoCount} videos
              </p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">Confidence</p>
              <p className={`text-sm font-black ${topInsight.confidence >= 70 ? "text-emerald-400" : "text-amber-400"}`}>
                {topInsight.confidence}% — {topInsight.confidenceLabel}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">Theme</p>
              <p className="text-sm font-black text-blue-300">{topInsight.topic}</p>
            </div>
          </div>
          {topInsight.suggestedAction && (
            <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/15 rounded-lg px-4 py-3">
              <span className="text-blue-400 shrink-0">→</span>
              <p className="text-xs text-slate-300 leading-relaxed">{topInsight.suggestedAction}</p>
            </div>
          )}
          {topInsight.contrarianView && (
            <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 rounded-lg px-4 py-2.5">
              <span className="text-amber-400 shrink-0 text-xs">⚡</span>
              <p className="text-[11px] font-mono text-slate-400 italic leading-relaxed">{topInsight.contrarianView}</p>
            </div>
          )}
        </div>
      ) : conLoading ? (
        <div className="bg-[#0d1520] border border-slate-800 rounded-2xl p-6 animate-pulse space-y-4">
          <div className="h-3 w-52 bg-slate-800 rounded" />
          <div className="h-6 w-full bg-slate-800 rounded" />
          <div className="h-4 w-3/4 bg-slate-800 rounded" />
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════
          2. WHAT CHANGED TODAY
         ══════════════════════════════════════════════ */}
      {whatChangedToday.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-black font-mono tracking-wider text-slate-200 uppercase">↻ What Changed Today</h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Daily momentum shifts across your creator network</p>
            </div>
            <span className="text-[10px] font-mono text-slate-500">{whatChangedToday.length} signals</span>
          </div>

          <div className="space-y-2">
            {whatChangedToday.map((event, i) => {
              const isNew        = event.type === "new";
              const isAccel      = event.type === "accelerating";
              const isUp         = event.type === "rank_up";
              const isDown       = event.type === "rank_down";
              const isDecline    = event.type === "declining";
              return (
                <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${
                  isNew     ? "bg-blue-500/5 border-blue-500/20 hover:border-blue-500/30" :
                  isAccel   ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/30" :
                  isUp      ? "bg-[#101520] border-slate-800/60 hover:border-slate-700" :
                  isDecline ? "bg-red-500/5 border-red-500/15 hover:border-red-500/25" :
                  "bg-[#101520] border-slate-800/60 hover:border-slate-700"
                }`}>
                  {/* Direction pill */}
                  <div className="shrink-0 pt-0.5">
                    {isNew     && <span className="text-[9px] font-mono font-black text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded">NEW</span>}
                    {isAccel   && <span className="text-emerald-400 font-black text-base leading-none">↑↑</span>}
                    {isUp      && <span className="text-emerald-400 font-black text-base leading-none">↑</span>}
                    {isDown    && <span className="text-amber-400 font-black text-base leading-none">↓</span>}
                    {isDecline && <span className="text-red-400 font-black text-base leading-none">↓</span>}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-white">{event.topic}</span>
                      {event.prevRank && event.currRank && event.prevRank !== event.currRank && (
                        <span className="text-[10px] font-mono text-slate-500">
                          #{event.prevRank} → <span className={isUp || isAccel ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>#{event.currRank}</span>
                        </span>
                      )}
                      {event.pctChange !== undefined && event.pctChange !== 0 && (
                        <span className={`text-[10px] font-mono font-black ${event.pctChange > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {event.pctChange > 0 ? "+" : ""}{event.pctChange}%
                        </span>
                      )}
                      {isNew && <span className="text-[10px] font-mono text-slate-500 italic">Appears in creator consensus for the first time</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {event.creators > 0 && (
                        <span className="text-[10px] font-mono text-slate-500">{event.creators} creator{event.creators !== 1 ? "s" : ""}</span>
                      )}
                      {event.currCount !== undefined && event.currCount > 0 && (
                        <span className="text-[10px] font-mono text-slate-500">{event.currCount} video{event.currCount !== 1 ? "s" : ""}</span>
                      )}
                      {event.channelNames.slice(0, 2).map((ch, j) => (
                        <span key={j} className="text-[9px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{ch}</span>
                      ))}
                    </div>
                    {event.whyItMatters && (
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{event.whyItMatters}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          3. OPPORTUNITY ALERTS
         ══════════════════════════════════════════════ */}
      <div className="bg-[#101520] border border-emerald-500/15 rounded-xl p-5 space-y-4">
        <OpportunityAlertsWidget alerts={opportunityAlerts} loading={aiLoading} />
      </div>

      {/* ══════════════════════════════════════════════
          4. CREATOR CONSENSUS ENGINE
         ══════════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-black font-mono tracking-wider text-slate-300 uppercase">
              📂 Creator Consensus Engine
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Click a signal card to expand verifiable source data trails
            </p>
          </div>
          <span className="text-[10px] text-slate-600 font-mono">
            {emergingSignalThemes.filter(t => t.macroTakeaway).length} of {emergingSignalThemes.length} synthesized
          </span>
        </div>
        <CollapsibleSignalCards themes={emergingSignalThemes} loading={isLoading && !emergingSignalThemes.length} />
      </div>

      {/* ══════════════════════════════════════════════
          5. DO THIS TODAY — ACTIONABLE INTELLIGENCE
         ══════════════════════════════════════════════ */}
      {(consensusData?.actions?.length ?? 0) > 0 && (
        <div className="bg-[#101520] border border-blue-500/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest">
              🎯 Do This Today
            </h3>
            <span className="text-[10px] text-slate-600 font-mono">Based on creator consensus</span>
          </div>
          <ol className="space-y-3">
            {consensusData!.actions.map((action, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[9px] flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          6. CREATOR INFLUENCE
         ══════════════════════════════════════════════ */}
      <div className="bg-[#101520] border border-slate-700/60 rounded-xl p-5 space-y-4">
        <CreatorShareOfVoiceWidget creators={creatorVoices} loading={aiLoading} />
      </div>

      {/* ══════════════════════════════════════════════
          7. SIGNAL METRICS — SUPPORTING DATA
         ══════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-mono font-black text-slate-600 uppercase tracking-widest px-1">
          Signal Metrics
        </h2>
        <CorePulseMetrics metrics={coreMetrics} loading={isLoading && !coreMetrics.some(m => m.value !== "0")} />
      </div>

    </div>
    </div>
  );
}
