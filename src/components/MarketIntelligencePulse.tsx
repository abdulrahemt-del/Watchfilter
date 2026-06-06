"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NavItem } from "./AppSidebar";
import type { FeedVideo } from "@/app/api/youtube/feed/route";
import type { AIScore } from "@/app/api/youtube/filter/route";
import type { ConsensusResult } from "@/app/api/youtube/consensus/route";
import { useFilteredFeed, isoToSeconds, INTEL_CATEGORY_BLOCKS, getChannelAffinity, AFFINITY_PASS_THRESHOLD, type FeedMode } from "@/hooks/useFilteredSubscriptionFeed";
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

export function MarketIntelligencePulse({ onNavigate }: { onNavigate?: (nav: NavItem) => void }) {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? "anon";

  // Intelligence always uses "business" mode — the catch-all that collects ALL approved
  // business/investing/startup/finance content. Narrow modes (founder/finance) only apply
  // to the subscription feed tab's display; they must NOT limit the intelligence pool.
  const mode: FeedMode = "business";

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
  const [consensusKey, setConsensusKey]   = useState(0);
  const [pipelineKey, setPipelineKey]     = useState(0); // bumped on hard refresh to re-run pipeline

  // ── Bootstrap: load feed data only ────────────────────────────────────────
  useEffect(() => {
    if (status !== "authenticated") return;

    const feedKey     = `wf_feed_${email}`;
    const snapshotKey = `wf_snapshot_${email}`;
    const visitKey    = `wf_visit_${email}`;

    try { localStorage.setItem("wf_last_email", email); } catch { /* ignore */ }
    try { const rawSnap = localStorage.getItem(snapshotKey); if (rawSnap) setPrevSnapshot(JSON.parse(rawSnap)); } catch { /* ignore */ }
    try { localStorage.setItem(visitKey, JSON.stringify(Date.now())); } catch { /* ignore */ }

    function tryLoadFeed() {
      try {
        const raw = localStorage.getItem(feedKey);
        if (!raw) return false;
        const cached = JSON.parse(raw) as { ts: number; videos: FeedVideo[] };
        if (!cached.videos?.length) return false;
        setFeedVideos(v => v.length ? v : cached.videos);
        setFeedTs(t => t ?? cached.ts);
        setFeedMissing(false);
        return true;
      } catch { return false; }
    }

    if (!tryLoadFeed()) {
      setFeedMissing(true);
      // SubscriptionFeed (always mounted) fetches feed async and writes to localStorage.
      // Listen for that write and pick it up without requiring a full page refresh.
      const onStorage = (e: StorageEvent) => {
        if (e.key === feedKey && e.newValue) {
          if (tryLoadFeed()) window.removeEventListener("storage", onStorage);
        }
      };
      window.addEventListener("storage", onStorage);
      // Fallback poll — storage events don't fire within the same tab in some browsers
      const poll = setInterval(() => { if (tryLoadFeed()) clearInterval(poll); }, 2000);
      setTimeout(() => clearInterval(poll), 30_000);
    }
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
  }, [structuralFilter.length, email, pipelineKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Pipeline diagnostics ───────────────────────────────────────────────────
  useEffect(() => {
    if (!feedVideos.length) return;
    const aiReady = Object.keys(aiScores).length > 0;
    const scored = Object.values(aiScores);
    const approved = scored.filter(s => s.topicCategory !== "excluded");
    const rejected = scored.filter(s => s.topicCategory === "excluded");

    const rejectedByChannel: Record<string, number> = {};
    rejected.forEach(s => {
      const v = feedVideos.find(f => f.videoId === s.videoId);
      if (v) rejectedByChannel[v.channelTitle] = (rejectedByChannel[v.channelTitle] ?? 0) + 1;
    });

    const catCounts: Record<string, number> = {};
    approved.forEach(s => s.categories?.forEach(c => { catCounts[c] = (catCounts[c] ?? 0) + 1; }));

    const approvedChannels = new Set(
      approved.map(s => feedVideos.find(f => f.videoId === s.videoId)?.channelTitle).filter(Boolean)
    );

    console.group("[intel-pool] Pipeline diagnostics");
    console.log(`Feed total: ${feedVideos.length}`);
    console.log(`Structural filter (business mode): ${structuralFilter.length}`);
    console.log(`AI scored: ${scored.length} | Approved: ${approved.length} | Rejected: ${rejected.length} | AI ready: ${aiReady}`);
    console.log("Approved channels:", [...approvedChannels].sort());
    console.log("Rejected by channel:", rejectedByChannel);
    console.log("Approved categories:", catCounts);
    console.groupEnd();
  }, [feedVideos.length, structuralFilter.length, Object.keys(aiScores).length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────

  // filteredVideos = structural filter → AI exclusion gate.
  // This matches exactly what SubscriptionFeed shows in the feed grid.
  const filteredVideos = useMemo<FeedVideo[]>(() => {
    const aiReady = Object.keys(aiScores).length > 0;
    const base = aiReady
      ? structuralFilter.filter(v => {
          const ai = aiScores[v.videoId];
          if (!ai) return getChannelAffinity(v.channelTitle) >= AFFINITY_PASS_THRESHOLD;
          return ai.topicCategory !== "excluded";
        })
      : structuralFilter.filter(v => getChannelAffinity(v.channelTitle) >= AFFINITY_PASS_THRESHOLD);
    return [...base].sort((a, b) => (aiScores[b.videoId]?.score ?? 0) - (aiScores[a.videoId]?.score ?? 0));
  }, [structuralFilter, aiScores]);

  const todaysThemes = useMemo(() => {
    const blocked = (INTEL_CATEGORY_BLOCKS[mode as keyof typeof INTEL_CATEGORY_BLOCKS]) ?? [];
    const map = new Map<string, { count: number; channels: Set<string>; insights: string[] }>();
    // filteredVideos is already sorted by AI score descending.
    // Only use the top 25 highest-scoring approved videos so weak or loosely related
    // videos don't dilute the consensus signal.
    filteredVideos.slice(0, 25).forEach(v => {
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
        // Include channel name prefix so consensus AI knows who said what
        const insight = ai.whyItMatters
          ? `${v.channelTitle}: ${ai.whyItMatters}`
          : ai.explanation
          ? `${v.channelTitle}: ${ai.explanation}`
          : null;
        if (insight && e.insights.length < 6) e.insights.push(insight);
      });
    });
    const sorted = [...map.entries()].sort((a, b) => b[1].count - a[1].count);
    return sorted
      .filter(([, { channels }]) => channels.size >= 3)
      .slice(0, 8)
      .map(([topic, { count, channels, insights }]) => ({
        topic, count, creators: channels.size,
        // Send all contributing channel names — no cap — so the consensus API
        // shows the correct creator count and can name every source.
        channelNames: [...channels],
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
        themes: todaysThemes.map(t => ({ topic: t.topic, count: t.count, referenceCount: t.count, creators: t.channelNames, insights: t.insights })),
        topOpportunity: { topic: topOpp.topic, count: topOpp.count, referenceCount: topOpp.count, creators: topOpp.channelNames, insights: topOpp.insights },
        topRisk: topRisk ? { topic: topRisk.topic, count: topRisk.count, referenceCount: topRisk.count, creators: topRisk.channelNames, insights: topRisk.insights } : null,
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
  }, [todaysThemes, aiLoading, email, consensusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Widget data derivations ────────────────────────────────────────────────

  const coreMetrics = useMemo(() => {
    const hp = filteredVideos.filter(v => aiScores[v.videoId]?.topicCategory === "high_priority").length;
    const uniqueChannels = new Set(filteredVideos.map(v => v.channelTitle)).size;
    const totalSecs = filteredVideos.reduce((a, v) => a + isoToSeconds(v.duration), 0);
    const savedHrs = Math.round(totalSecs * 0.6 / 3600);
    return [
      { label: "Feed Size",    value: String(feedVideos.length),    sub: "total videos",     trend: "flat"  as const },
      { label: "Signal Yield", value: String(filteredVideos.length), sub: "approved signals", color: "text-[#a3cef1]",   trend: "up"   as const },
      { label: "Themes Found", value: String(todaysThemes.length),   sub: "active clusters",  color: "text-[#a3cef1]",   trend: "up"   as const },
      { label: "Priority",     value: String(hp),                    sub: "high-priority",    color: "text-emerald-300", trend: "up"   as const },
      { label: "Channels",     value: String(uniqueChannels),        sub: "unique sources",   color: "text-white/70",    trend: "flat" as const },
      { label: "Time Saved",   value: `${savedHrs}h`,               sub: "est. saved",       color: "text-[#a3cef1]",   trend: "up"   as const },
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

    const tierOf = (e: ChangeEvent) =>
      e.type === "accelerating" || e.type === "rank_up"  ? 0 :
      e.type === "new"                                   ? 1 :
      2;
    const magnitude = (e: ChangeEvent) => Math.abs(e.pctChange ?? 0) + Math.abs(e.rankChange ?? 0) * 15;
    return events.sort((a, b) => {
      const td = tierOf(a) - tierOf(b);
      return td !== 0 ? td : magnitude(b) - magnitude(a);
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

  function handleForceRefresh() {
    // Wipe cloud DB cache so next load doesn't restore stale data
    fetch("/api/intelligence/scores", { method: "DELETE" }).catch(() => { /* non-blocking */ });
    // Wipe all localStorage caches including the feed — subscription pagination
    // may have changed so we want a fresh fetch with all channels
    try { localStorage.removeItem(`wf_consensus_${email}`); } catch { /* ignore */ }
    try { localStorage.removeItem(`wf_ai_${email}`); } catch { /* ignore */ }
    try { localStorage.removeItem(`wf_feed_${email}`); } catch { /* ignore */ }
    // Reset in-memory feed state so the component shows loading rather than stale cards
    setFeedVideos([]);
    setFeedTs(null);
    // Fetch fresh feed (bypasses server-side cache) and write to localStorage so
    // tryLoadFeed() and the storage listener pick it up and populate feedVideos
    fetch("/api/youtube/feed?force=true")
      .then(r => r.json())
      .then((data: { videos?: FeedVideo[] }) => {
        const vids = data.videos ?? [];
        try { localStorage.setItem(`wf_feed_${email}`, JSON.stringify({ ts: Date.now(), videos: vids })); } catch { /* ignore */ }
        setFeedVideos(vids);
        setFeedTs(Date.now());
        setFeedMissing(vids.length === 0);
      })
      .catch(() => setFeedMissing(true));
    // Reset in-memory state — pipeline re-fires because pipelineKey changes
    setConsensus(null);
    setAiScores({});
    aiPipelineStarted.current = false;
    setConsensusKey(k => k + 1);
    setPipelineKey(k => k + 1);
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#e7ecef] flex items-center justify-center text-[#8b8c89] font-mono text-sm">
        Connecting…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#e7ecef] flex flex-col items-center justify-center gap-4 text-[#8b8c89]">
        <p className="font-mono text-sm">Sign in to view Market Intelligence.</p>
        <button onClick={() => onNavigate?.("feed")} className="text-[#6096ba] hover:text-[#274c77] font-mono text-sm transition-colors">← Return to Feed</button>
      </div>
    );
  }

  if (feedMissing) {
    return (
      <div className="min-h-screen bg-[#e7ecef] flex flex-col items-center justify-center gap-4 text-center px-6">
        <span className="text-4xl">📡</span>
        <h2 className="text-[#274c77] font-black text-lg">No feed data yet</h2>
        <p className="text-[#8b8c89] font-mono text-xs max-w-xs">
          Load your subscription feed first, then return here for your full intelligence briefing.
        </p>
        <button onClick={() => onNavigate?.("feed")} className="mt-2 bg-[#274c77] hover:bg-[#6096ba] text-white font-bold text-sm px-5 py-2 rounded-lg transition-colors">
          ← Go to Feed
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#e7ecef] min-h-screen text-[#274c77] font-sans antialiased">
    <div className="w-full px-4 md:px-6 py-6 space-y-8">

      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#a3cef1]/50 pb-4 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => onNavigate?.("feed")} className="text-sm font-bold font-mono text-[#274c77] hover:text-[#6096ba] bg-white border border-[#a3cef1]/60 hover:border-[#6096ba]/60 px-3 py-1.5 rounded-lg transition-colors">
            ← Feed
          </button>
          <div>
            <h1 className="text-xl font-black text-[#274c77] tracking-tight flex items-center gap-2">
              📡 Creator Trends
            </h1>
            <p className="text-xs text-[#8b8c89] font-mono">
              Creator consensus synthesized from your subscription channels
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isLoading && (
            <span className="text-[10px] font-mono text-amber-700 bg-amber-100 border border-amber-300/50 px-2.5 py-1 rounded-lg animate-pulse">
              {aiLoading ? "⚙ Scoring your feed… (first load ~30s, then cached for 12h)" : "⚙ Synthesizing…"}
            </span>
          )}
          <button
            onClick={handleForceRefresh}
            disabled={isLoading}
            className="text-[10px] font-mono text-[#274c77] bg-white hover:bg-[#a3cef1]/20 hover:text-[#274c77] disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg border border-[#a3cef1]/60 transition-colors"
            title="Clear cached consensus and re-synthesize"
          >
            ↻ Refresh
          </button>
          <div className="text-xs font-mono text-[#8b8c89] bg-white px-3 py-1.5 rounded-lg border border-[#a3cef1]/50">
            Last Sync: <span className="text-[#6096ba] font-bold">{feedTs ? timeAgo(feedTs) : "—"}</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          1. HIGHEST CONVICTION SIGNAL — HERO
         ══════════════════════════════════════════════ */}
      {topInsight ? (
        <div className="bg-gradient-to-br from-[#274c77] via-[#274c77] to-[#6096ba] border border-[#274c77]/20 rounded-2xl p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#a3cef1] font-black uppercase tracking-widest">
              🎯 Highest Conviction Signal Today
            </div>
            {topInsight.trendDirection && (
              <span className={`text-[10px] font-mono font-black ${
                topInsight.trendDirection === "growing"  ? "text-emerald-300" :
                topInsight.trendDirection === "declining" ? "text-red-300" : "text-[#a3cef1]"
              }`}>
                {topInsight.trendDirection === "growing" ? "↑ Growing" : topInsight.trendDirection === "declining" ? "↓ Declining" : "→ Stable"}
              </span>
            )}
          </div>
          <p className="text-lg font-bold text-white leading-relaxed">{topInsight.statement}</p>
          {topInsight.whyItMatters && (
            <p className="text-sm text-[#a3cef1]/80 leading-relaxed">{topInsight.whyItMatters}</p>
          )}
          <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-white/15">
            <div>
              <p className="text-[9px] font-mono text-[#a3cef1]/60 uppercase tracking-wider mb-1">Evidence</p>
              <p className="text-sm font-black text-white">
                {topInsight.supportingCreators} creators · {topInsight.videoCount} videos
              </p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-[#a3cef1]/60 uppercase tracking-wider mb-1">Confidence</p>
              <p className={`text-sm font-black ${topInsight.confidence >= 70 ? "text-emerald-300" : "text-amber-300"}`}>
                {topInsight.confidence}% — {topInsight.confidenceLabel}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-[#a3cef1]/60 uppercase tracking-wider mb-1">Theme</p>
              <p className="text-sm font-black text-[#a3cef1]">{topInsight.topic}</p>
            </div>
          </div>
          {topInsight.suggestedAction && (
            <div className="flex items-start gap-2 bg-white/10 border border-white/15 rounded-lg px-4 py-3">
              <span className="text-[#a3cef1] shrink-0">→</span>
              <p className="text-xs text-white/80 leading-relaxed">{topInsight.suggestedAction}</p>
            </div>
          )}
          {topInsight.contrarianView && (
            <div className="flex items-start gap-2 bg-amber-400/10 border border-amber-300/20 rounded-lg px-4 py-2.5">
              <span className="text-amber-300 shrink-0 text-xs">⚡</span>
              <p className="text-[11px] font-mono text-[#a3cef1]/70 italic leading-relaxed">{topInsight.contrarianView}</p>
            </div>
          )}
        </div>
      ) : conLoading ? (
        <div className="bg-white border border-[#a3cef1]/40 rounded-2xl p-6 animate-pulse space-y-4">
          <div className="h-3 w-52 bg-[#a3cef1]/30 rounded" />
          <div className="h-6 w-full bg-[#e7ecef] rounded" />
          <div className="h-4 w-3/4 bg-[#a3cef1]/20 rounded" />
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════
          2. WHAT CHANGED TODAY
         ══════════════════════════════════════════════ */}
      {whatChangedToday.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#a3cef1]/40 pb-3">
            <div>
              <h2 className="text-sm font-black font-mono tracking-wider text-[#274c77] uppercase">↻ What Changed Today</h2>
              <p className="text-xs text-[#8b8c89] font-mono mt-0.5">Daily momentum shifts across your creator network</p>
            </div>
            <span className="text-[10px] font-mono text-[#8b8c89]">{whatChangedToday.length} signals</span>
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
                  (isAccel || isUp)      ? "bg-emerald-50 border-emerald-300/60 hover:border-emerald-400/70" :
                  (isDecline || isDown)  ? "bg-red-50 border-red-300/50 hover:border-red-400/60" :
                  "bg-amber-50 border-amber-300/50 hover:border-amber-400/60"
                }`}>
                  <div className="shrink-0 pt-0.5">
                    {isNew     && <span className="text-[9px] font-mono font-black text-[#274c77] bg-[#a3cef1]/20 border border-[#6096ba]/30 px-2 py-1 rounded">NEW</span>}
                    {isAccel   && <span className="text-emerald-600 font-black text-base leading-none">↑↑</span>}
                    {isUp      && <span className="text-emerald-600 font-black text-base leading-none">↑</span>}
                    {isDown    && <span className="text-amber-500 font-black text-base leading-none">↓</span>}
                    {isDecline && <span className="text-red-500 font-black text-base leading-none">↓</span>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-[#274c77]">{event.topic}</span>
                      {event.prevRank && event.currRank && event.prevRank !== event.currRank && (
                        <span className="text-[10px] font-mono text-[#8b8c89]">
                          #{event.prevRank} → <span className={isUp || isAccel ? "text-emerald-600 font-bold" : "text-amber-500 font-bold"}>#{event.currRank}</span>
                        </span>
                      )}
                      {event.pctChange !== undefined && event.pctChange !== 0 && (
                        <span className={`text-[10px] font-mono font-black ${event.pctChange > 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {event.pctChange > 0 ? "+" : ""}{event.pctChange}%
                        </span>
                      )}
                      {isNew && <span className="text-[10px] font-mono text-[#8b8c89] italic">Appears in creator consensus for the first time</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {event.creators > 0 && (
                        <span className="text-[10px] font-mono text-[#8b8c89]">{event.creators} creator{event.creators !== 1 ? "s" : ""}</span>
                      )}
                      {event.currCount !== undefined && event.currCount > 0 && (
                        <span className="text-[10px] font-mono text-[#8b8c89]">{event.currCount} video{event.currCount !== 1 ? "s" : ""}</span>
                      )}
                      {event.channelNames.slice(0, 2).map((ch, j) => (
                        <span key={j} className="text-[9px] font-mono bg-[#a3cef1]/20 text-[#274c77] px-1.5 py-0.5 rounded">{ch}</span>
                      ))}
                    </div>
                    {event.whyItMatters && (
                      <p className="text-xs font-semibold text-[#8b8c89] mt-1.5 leading-relaxed">{event.whyItMatters}</p>
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
      <div className="bg-white border border-[#a3cef1]/50 rounded-xl p-5 space-y-4 shadow-sm">
        <OpportunityAlertsWidget alerts={opportunityAlerts} loading={aiLoading} />
      </div>

      {/* ══════════════════════════════════════════════
          4. CREATOR CONSENSUS ENGINE
         ══════════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#a3cef1]/40 pb-3">
          <div>
            <h2 className="text-sm font-black font-mono tracking-wider text-[#274c77] uppercase">
              📂 Creator Consensus Engine
            </h2>
            <p className="text-xs text-[#8b8c89] font-mono mt-0.5">
              Click a signal card to expand verifiable source data trails
            </p>
          </div>
          <span className="text-[10px] text-[#8b8c89] font-mono">
            {emergingSignalThemes.filter(t => t.macroTakeaway).length} of {emergingSignalThemes.length} synthesized
          </span>
        </div>
        <CollapsibleSignalCards themes={emergingSignalThemes} loading={isLoading && !emergingSignalThemes.length} />
      </div>

      {/* ══════════════════════════════════════════════
          5. DO THIS TODAY — ACTIONABLE INTELLIGENCE
         ══════════════════════════════════════════════ */}
      {(consensusData?.actions?.length ?? 0) > 0 && (
        <div className="bg-white border border-[#6096ba]/25 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#a3cef1]/40 pb-3">
            <h3 className="text-[10px] font-mono font-black text-[#274c77] uppercase tracking-widest">
              🎯 Do This Today
            </h3>
            <span className="text-[10px] text-[#8b8c89] font-mono">Based on creator consensus</span>
          </div>
          <ol className="space-y-3">
            {consensusData!.actions.map((action, i) => (
              <li key={i} className="flex gap-3 text-sm text-[#274c77] leading-relaxed">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#274c77] text-white font-black text-[9px] flex items-center justify-center mt-0.5">
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
      <div className="bg-[#274c77] border border-[#1e3a5f] rounded-xl p-5 space-y-4 shadow-sm">
        <CreatorShareOfVoiceWidget creators={creatorVoices} loading={aiLoading} />
      </div>

      {/* ══════════════════════════════════════════════
          7. SIGNAL METRICS — SUPPORTING DATA
         ══════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-mono font-black text-[#8b8c89] uppercase tracking-widest px-1">
          Signal Metrics
        </h2>
        <CorePulseMetrics metrics={coreMetrics} loading={isLoading && !coreMetrics.some(m => m.value !== "0")} />
      </div>

    </div>
    </div>
  );
}
