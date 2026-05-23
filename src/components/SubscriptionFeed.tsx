"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import type { FeedVideo } from "@/app/api/youtube/feed/route";
import type { AIScore, ContentType, TopicCategory } from "@/app/api/youtube/filter/route";
import {
  useFilteredFeed,
  getChannelAffinity,
  isoToSeconds,
  detectPrimaryTopic,
  AFFINITY_PASS_THRESHOLD,
  type FeedMode,
} from "@/hooks/useFilteredSubscriptionFeed";
import { FluffAnalyzerDrawer, categoryChipClass } from "@/components/FluffAnalyzerDrawer";

const DEBUG_BADGES = true;

// ── Consensus types ───────────────────────────────────────────────────────────

interface ConsensusTheme { topic: string; consensus: string; confidence: number; }
interface ConsensusResult {
  executiveBrief: string[];
  themes:         ConsensusTheme[];
  topOpportunity: { topic: string; reason: string; confidence: number } | null;
  topRisk:        { topic: string; reason: string; confidence: number } | null;
  actions:        string[];
}

interface Props {
  onAnalyze: (youtubeUrl: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function smartTruncateDescription(desc: string, maxChars = 500): string {
  if (!desc || desc.length <= maxChars) return desc;
  let truncated = desc.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.8) truncated = truncated.slice(0, lastSpace);
  return truncated.trim() + "… [Truncated for Metadata Analysis]";
}

function formatAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatDuration(iso: string): string {
  const t = isoToSeconds(iso);
  if (t === 0) return "";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function estimateSavings(iso: string): string {
  const t = isoToSeconds(iso);
  if (t < 120) return "";
  const saved = Math.round((t * 0.4) / 60);
  return saved >= 1 ? `Save ~${saved} min` : "";
}

// ── Ranking ───────────────────────────────────────────────────────────────────

function durationMultiplier(iso: string, mode: FeedMode): number {
  const s = isoToSeconds(iso);
  if (mode === "founder") {
    if (s < 2700)  return 0.80; // 40–45 min: slight penalty
    if (s < 3600)  return 0.95; // 45–60 min
    if (s < 5400)  return 1.10; // 60–90 min
    if (s < 7200)  return 1.20; // 90–120 min
    return 1.30;                 // 2h+
  }
  if (s < 3600)  return 0.90;
  if (s < 5400)  return 1.05;
  return 1.15;
}

const CONTENT_TYPE_BOOST: Partial<Record<ContentType, number>> = {
  "Interview":          8,
  "Podcast":            6,
  "Deep Dive":          5,
  "Market Commentary":  5,
  "Case Study":         4,
  "Analysis":           4,
  "Discussion":         2,
};

// New weights: 60% topic + 25% business relevance + 15% channel trust
// Channel trust: normalize affinity (-100..+100) → 0..100
function rankingScore(video: FeedVideo, ai: AIScore, mode: FeedMode, affinity: number): number {
  const topicScore   = ai.topicScore   ?? ai.score;
  const bizScore     = ai.subScores?.businessRelevance ?? ai.score;
  const channelTrust = Math.min(100, Math.max(0, (affinity + 100) / 2));

  const weighted = (topicScore * 0.60) + (bizScore * 0.25) + (channelTrust * 0.15);
  const durAdj   = weighted * durationMultiplier(video.duration, mode);
  const typeBoost = (mode === "founder" || mode === "business" || mode === "finance")
    ? (CONTENT_TYPE_BOOST[ai.contentType] ?? 0)
    : 0;

  return Math.min(100, Math.max(0, Math.round(durAdj + typeBoost)));
}

// ── Score badge ───────────────────────────────────────────────────────────────

function scoreBadgeClass(score: number): string {
  if (score >= 80) return "feed-card__score-badge feed-card__score-badge--high";
  if (score >= 65) return "feed-card__score-badge feed-card__score-badge--mid";
  return "feed-card__score-badge feed-card__score-badge--low";
}

const CONTENT_TYPE_ICONS: Partial<Record<ContentType, string>> = {
  "Podcast":           "🎙",
  "Interview":         "🎤",
  "Market Commentary": "📊",
  "Deep Dive":         "🔬",
  "Case Study":        "📋",
  "Analysis":          "📈",
  "Discussion":        "💬",
};

// ── Mode metadata ─────────────────────────────────────────────────────────────

const MODE_META: Record<"business" | "founder" | "finance", { label: string; banner: string; empty: string }> = {
  business: {
    label: "💼 Business Intelligence",
    banner: "💼 Business Intelligence — Trusted business channels + AI-confirmed content only",
    empty: "No business content found. Try disabling the filter.",
  },
  founder: {
    label: "🎙 Founder & Investing",
    banner: "🎙 Founder & Investing — Premium: founder interviews, podcasts & market analysis (40 min+)",
    empty: "No founder/investing content found. Try Business Intelligence mode.",
  },
  finance: {
    label: "💰 Finance",
    banner: "💰 Finance — Personal finance, wealth management & market intelligence (40 min+)",
    empty: "No finance content found. Try Business Intelligence mode.",
  },
};

// ── Intelligence sections ─────────────────────────────────────────────────────

type IntelSection = "opportunities" | "founder" | "market" | "risks" | "general";

const SECTION_META: Record<Exclude<IntelSection, "general">, { title: string; emoji: string; desc: string; keywords: string[] }> = {
  risks: {
    title: "Today's Risks",
    emoji: "⚠️",
    desc: "Threats, downturns and market warnings to track",
    keywords: ["crash", "risk", "warning", "bubble", "collapse", "bear", "debt", "crisis", "decline", "downturn", "recession", "layoffs", "bankruptcy"],
  },
  opportunities: {
    title: "Today's Opportunities",
    emoji: "🚀",
    desc: "Business models and trends gaining momentum",
    keywords: ["opportunity", "growth", "saas", "revenue", "scale", "venture", "raise", "funding", "acquisition", "startup", "ecommerce", "b2b", "ipo", "trending"],
  },
  founder: {
    title: "Founder Insights",
    emoji: "🎤",
    desc: "CEO interviews, playbooks and case studies",
    keywords: ["founder", "ceo", "entrepreneur", "masterclass", "billionaire", "case study", "leadership", "operator", "executive"],
  },
  market: {
    title: "Market Signals",
    emoji: "📊",
    desc: "Macro, markets and economic intelligence",
    keywords: ["market", "macro", "economics", "fed", "inflation", "stocks", "equity", "bond", "yield", "crypto", "bitcoin", "interest rate", "gdp", "monetary", "investing"],
  },
};

function classifyVideo(ai: AIScore | undefined): IntelSection {
  if (!ai) return "general";
  const text = [...(ai.categories ?? []), ai.contentType ?? ""].map(c => c.toLowerCase()).join(" ");
  if (SECTION_META.risks.keywords.some(k => text.includes(k)))         return "risks";
  if (SECTION_META.opportunities.keywords.some(k => text.includes(k))) return "opportunities";
  if (SECTION_META.founder.keywords.some(k => text.includes(k)))       return "founder";
  if (SECTION_META.market.keywords.some(k => text.includes(k)))        return "market";
  if (ai.contentType === "Interview" || ai.contentType === "Podcast")   return "founder";
  if (ai.contentType === "Market Commentary" || ai.contentType === "Analysis") return "market";
  return "general";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SubscriptionFeed({ onAnalyze }: Props) {
  const { data: session, status } = useSession();
  const [videos, setVideos]           = useState<FeedVideo[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [drawerVideo, setDrawerVideo] = useState<FeedVideo | null>(null);
  const [mode, setMode]               = useState<FeedMode>("off");
  const [aiResults, setAiResults]     = useState<Record<string, AIScore>>({});
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiScanEnabled, setAiScanEnabled] = useState(false);
  const [cacheAge, setCacheAge]           = useState<Date | null>(null);
  const [consensusData, setConsensusData]         = useState<ConsensusResult | null>(null);
  const [consensusLoading, setConsensusLoading]   = useState(false);
  const [selectedConsensusTheme, setSelectedConsensusTheme] = useState<string | null>(null);

  // ── Structural filter ──────────────────────────────────────────────────────
  // business/founder: all 40-min+ videos with ≥1 business keyword in title,
  //                   after hard channel/title blocks. Shows immediately.
  // longform:         all 40-min+ after hard blocks (no topic gate).
  // off:              all after hard blocks only.
  const structuralFilter = useFilteredFeed(videos, mode);

  // ── Scan target: all structurally-passed videos (capped at 200) ────────────
  const scanTarget = useMemo<FeedVideo[]>(() => {
    if (mode === "off" || mode === "longform") return [];
    return structuralFilter.slice(0, 200);
  }, [structuralFilter, mode]);

  // ── Final display list ─────────────────────────────────────────────────────
  // Shows structural results immediately while AI loads.
  // After AI scores: keep only videos with businessRelevance ≥ threshold.
  // Sort by ranking score throughout.
  const filteredVideos = useMemo<FeedVideo[]>(() => {
    if (mode === "off" || mode === "longform") return structuralFilter;

    const aiReady = aiScanEnabled && !aiLoading && Object.keys(aiResults).length > 0;

    const base = aiReady
      ? structuralFilter.filter((v) => {
          const ai = aiResults[v.videoId];
          if (!ai) return true; // unscored → keep optimistically
          // topicCategory is the only hard gate — score is used for ranking only.
          // "excluded" means the AI confirmed this specific episode's topic is
          // outside the business/investing domain regardless of channel.
          return ai.topicCategory !== "excluded";
        })
      : structuralFilter;

    // Sort: ranking score (AI) → channel affinity → duration
    return [...base].sort((a, b) => {
      const aiA  = aiResults[a.videoId];
      const aiB  = aiResults[b.videoId];
      const affA = getChannelAffinity(a.channelTitle);
      const affB = getChannelAffinity(b.channelTitle);
      const scoreA = aiA ? rankingScore(a, aiA, mode, affA) : affA;
      const scoreB = aiB ? rankingScore(b, aiB, mode, affB) : affB;
      return scoreB - scoreA;
    });
  }, [mode, structuralFilter, aiScanEnabled, aiLoading, aiResults]);

  // Pipeline diagnostics
  useEffect(() => {
    if (!videos.length) return;
    console.log(
      `[pipeline] received=${videos.length}` +
      ` | structural=${structuralFilter.length}` +
      ` | display=${filteredVideos.length}`,
    );
  }, [videos, structuralFilter, filteredVideos]);

  // Feed cache — 2-hour TTL, keyed per Google account
  const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
  const cacheKey = `wf_feed_${session?.user?.email ?? "anon"}`;

  function loadFeed(forceRefresh = false) {
    if (!forceRefresh) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as { ts: number; videos: FeedVideo[] };
          if (Date.now() - cached.ts < CACHE_TTL_MS && cached.videos?.length) {
            setVideos(cached.videos);
            setCacheAge(new Date(cached.ts));
            setAiResults({});
            setAiScanEnabled(false);
            setConsensusData(null);
            setSelectedConsensusTheme(null);
            return;
          }
        }
      } catch { /* corrupt cache — fall through to fetch */ }
    }

    setLoading(true);
    setError(null);
    fetch("/api/youtube/feed")
      .then((r) => r.json())
      .then((data: { videos?: FeedVideo[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        const vids = data.videos ?? [];
        setVideos(vids);
        setCacheAge(new Date());
        setAiResults({});
        setAiScanEnabled(false);
        setConsensusData(null);
        setSelectedConsensusTheme(null);
        try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), videos: vids })); } catch { /* storage full */ }
      })
      .catch((e: unknown) => {
        // Stale fallback: serve expired cache instead of an error screen
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            const cached = JSON.parse(raw) as { ts: number; videos: FeedVideo[] };
            if (cached.videos?.length) {
              setVideos(cached.videos);
              setCacheAge(new Date(cached.ts));
              setError("YouTube quota exceeded — showing cached results from " + new Date(cached.ts).toLocaleString());
              return;
            }
          }
        } catch { /* corrupt cache */ }
        setError(e instanceof Error ? e.message : "Failed to load feed");
      })
      .finally(() => setLoading(false));
  }

  // Fetch feed (cache-first)
  useEffect(() => {
    if (status !== "authenticated") return;
    loadFeed();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enable AI scan when user enters an AI-assisted mode
  useEffect(() => {
    if (mode === "business" || mode === "founder" || mode === "finance") {
      setAiScanEnabled(true);
    }
  }, [mode]);

  // AI scoring — fires only when aiScanEnabled and scanTarget changes
  useEffect(() => {
    if (!aiScanEnabled || scanTarget.length === 0) return;
    setAiLoading(true);

    const toScan  = scanTarget;
    const batches: typeof toScan[] = [];
    for (let i = 0; i < toScan.length; i += 25) batches.push(toScan.slice(i, i + 25));

    console.log(`[AI-scan] scanning ${toScan.length} videos in ${batches.length} batches`);

    const scanBatch = (batch: typeof toScan) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      return fetch("/api/youtube/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: batch.map((v) => ({
            videoId:      v.videoId,
            title:        v.title,
            channelTitle: v.channelTitle,
            description:  smartTruncateDescription(v.description),
          })),
        }),
        signal: controller.signal,
      })
        .then((r) => r.json() as Promise<{ results?: AIScore[] }>)
        .then((d) => d.results ?? [])
        .catch(() => [] as AIScore[])
        .finally(() => clearTimeout(timer));
    };

    setConsensusData(null);
    setSelectedConsensusTheme(null);

    Promise.all(batches.map(scanBatch))
      .then((batchResults) => {
        const map: Record<string, AIScore> = {};
        batchResults.flat().forEach((r) => { map[r.videoId] = r; });
        console.log(`[AI-scan] scored ${Object.keys(map).length} videos`);
        setAiResults(map);
        // Share scores with IntelligenceDashboard so it skips re-scoring
        try {
          const aiKey = `wf_ai_${session?.user?.email ?? "anon"}`;
          localStorage.setItem(aiKey, JSON.stringify({ ts: Date.now(), scores: map }));
        } catch { /* storage full */ }
      })
      .finally(() => setAiLoading(false));
  }, [scanTarget, aiScanEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Analytics header: computed across the full raw pool so it reflects total fluff blocked
  const analyticsMetrics = useMemo(() => {
    if (!videos.length || mode === "off") return null;
    const rawSecs  = videos.reduce((a, v) => a + isoToSeconds(v.duration), 0);
    const filtSecs = filteredVideos.reduce((a, v) => a + isoToSeconds(v.duration), 0);
    const savedSecs = Math.max(0, rawSecs - filtSecs);
    const pct = rawSecs > 0 ? Math.round((savedSecs / rawSecs) * 100) : 0;
    return {
      pct,
      savedHrs:  Math.round(savedSecs / 3600),
      totalHrs:  Math.round(rawSecs   / 3600),
      shown: filteredVideos.length,
      total: videos.length,
    };
  }, [videos, filteredVideos, mode]);

  function handleModeClick(clicked: FeedMode) {
    setMode((prev) => prev === clicked ? "off" : clicked);
    setSelectedConsensusTheme(null);
  }

  function handleAnalyze(video: FeedVideo) {
    setDrawerVideo(null);
    setAnalyzingId(video.videoId);
    onAnalyze(`https://www.youtube.com/watch?v=${video.videoId}`);
  }

  const showAI  = mode === "business" || mode === "founder" || mode === "finance";
  const aiReady = aiScanEnabled && !aiLoading && Object.keys(aiResults).length > 0;

  // Today's Themes: top categories with creator counts
  const todaysThemes = useMemo(() => {
    if (!aiReady) return [];
    const map = new Map<string, { count: number; channels: Set<string> }>();
    for (const [videoId, ai] of Object.entries(aiResults)) {
      if (ai.topicCategory === "excluded") continue;
      const video = filteredVideos.find((v) => v.videoId === videoId);
      if (!video) continue;
      for (const cat of ai.categories ?? []) {
        if (cat.length <= 3) continue;
        if (!map.has(cat)) map.set(cat, { count: 0, channels: new Set() });
        const e = map.get(cat)!;
        e.count++;
        e.channels.add(video.channelTitle);
      }
    }
    const sorted = [...map.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6);

    // Each channel may appear in pills exactly once across all 6 cards.
    // Top themes get first pick; lower-ranked themes surface different sources.
    const usedChannels = new Set<string>();
    return sorted.map(([topic, { count, channels }]) => {
      const pills = [...channels].filter(ch => !usedChannels.has(ch)).slice(0, 3);
      pills.forEach(ch => usedChannels.add(ch));
      return { topic, count, creators: channels.size, channelNames: pills };
    });
  }, [aiResults, aiReady, filteredVideos]);

  // Trending topics: top 3 categories by frequency across all scored videos
  const trendingTopics = useMemo(() => {
    if (!aiReady) return [];
    const counts = new Map<string, number>();
    for (const ai of Object.values(aiResults)) {
      for (const cat of ai.categories ?? []) {
        if (cat.length > 3) counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
  }, [aiResults, aiReady]);

  // Videos grouped into intel sections
  const sectionedVideos = useMemo((): Record<IntelSection, FeedVideo[]> => {
    const out: Record<IntelSection, FeedVideo[]> = { opportunities: [], founder: [], market: [], risks: [], general: [] };
    if (!aiReady) return out;
    for (const video of filteredVideos) out[classifyVideo(aiResults[video.videoId])].push(video);
    return out;
  }, [filteredVideos, aiResults, aiReady]);

  // Biggest opportunity: top category among opportunity-section videos
  const biggestOpportunity = useMemo(() => {
    if (!aiReady) return null;
    const catMap = new Map<string, { count: number; channels: Set<string> }>();
    for (const v of sectionedVideos.opportunities) {
      for (const cat of aiResults[v.videoId]?.categories ?? []) {
        if (!catMap.has(cat)) catMap.set(cat, { count: 0, channels: new Set() });
        catMap.get(cat)!.count++;
        catMap.get(cat)!.channels.add(v.channelTitle);
      }
    }
    const top = [...catMap.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    if (!top || top[1].count < 2) return null;
    return { topic: top[0], mentions: top[1].count, creators: top[1].channels.size };
  }, [sectionedVideos, aiResults, aiReady]);

  // Top risk: top category among risk-section videos
  const topRisk = useMemo(() => {
    if (!aiReady) return null;
    const catMap = new Map<string, { count: number; channels: Set<string> }>();
    for (const v of sectionedVideos.risks) {
      for (const cat of aiResults[v.videoId]?.categories ?? []) {
        if (!catMap.has(cat)) catMap.set(cat, { count: 0, channels: new Set() });
        catMap.get(cat)!.count++;
        catMap.get(cat)!.channels.add(v.channelTitle);
      }
    }
    const top = [...catMap.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    if (!top || top[1].count < 2) return null;
    return { topic: top[0], mentions: top[1].count, creators: top[1].channels.size };
  }, [sectionedVideos, aiResults, aiReady]);

  // Representative whyItMatters/explanation per section for the brief bullets
  const briefBullets = useMemo(() => {
    if (!aiReady) return null;
    const pick = (videos: FeedVideo[]) => {
      for (const v of videos) {
        const ai = aiResults[v.videoId];
        const desc = ai?.whyItMatters || ai?.explanation;
        if (desc) return { topic: v.channelTitle, desc };
      }
      return null;
    };
    return {
      opportunity: biggestOpportunity ? { topic: biggestOpportunity.topic, ...pick(sectionedVideos.opportunities) } : null,
      risk: topRisk ? { topic: topRisk.topic, ...pick(sectionedVideos.risks) } : null,
      trend: todaysThemes[0] ?? null,
      action: todaysThemes[1] ?? null,
    };
  }, [aiReady, biggestOpportunity, topRisk, sectionedVideos, aiResults, todaysThemes]);

  // Per-theme creator list + insight snippets (used to build consensus API payload)
  const themeDataMap = useMemo(() => {
    if (!aiReady) return new Map<string, { creators: string[]; insights: string[] }>();
    const map = new Map<string, { creators: Set<string>; insights: string[] }>();
    for (const video of filteredVideos) {
      const ai = aiResults[video.videoId];
      if (!ai || ai.topicCategory === "excluded") continue;
      const insight = ai.whyItMatters || ai.explanation;
      for (const cat of ai.categories ?? []) {
        if (cat.length <= 3) continue;
        if (!map.has(cat)) map.set(cat, { creators: new Set(), insights: [] });
        const e = map.get(cat)!;
        e.creators.add(video.channelTitle);
        if (insight && e.insights.length < 5) e.insights.push(insight);
      }
    }
    const out = new Map<string, { creators: string[]; insights: string[] }>();
    for (const [k, v] of map) out.set(k, { creators: [...v.creators], insights: v.insights });
    return out;
  }, [filteredVideos, aiResults, aiReady]);

  // Consensus API payload — stable after AI scan completes
  const consensusPayload = useMemo(() => {
    if (!aiReady || todaysThemes.length === 0) return null;
    const sectionInsights = (vids: FeedVideo[]) =>
      vids.map((v) => aiResults[v.videoId]?.whyItMatters || aiResults[v.videoId]?.explanation)
          .filter(Boolean).slice(0, 4) as string[];
    return {
      themes: todaysThemes.map(({ topic, count }) => {
        const d = themeDataMap.get(topic);
        return { topic, count, creators: (d?.creators ?? []).slice(0, 4), insights: (d?.insights ?? []).slice(0, 3) };
      }),
      topOpportunity: biggestOpportunity
        ? { topic: biggestOpportunity.topic, count: biggestOpportunity.mentions,
            creators: sectionedVideos.opportunities.slice(0, 4).map((v) => v.channelTitle),
            insights: sectionInsights(sectionedVideos.opportunities) }
        : null,
      topRisk: topRisk
        ? { topic: topRisk.topic, count: topRisk.mentions,
            creators: sectionedVideos.risks.slice(0, 4).map((v) => v.channelTitle),
            insights: sectionInsights(sectionedVideos.risks) }
        : null,
    };
  }, [aiReady, todaysThemes, themeDataMap, biggestOpportunity, topRisk, sectionedVideos, aiResults]);

  // Overall consensus strength: average theme confidence (or creator-count fallback)
  const consensusStrength = useMemo(() => {
    if (consensusData?.themes?.length) {
      return Math.round(consensusData.themes.reduce((s, t) => s + t.confidence, 0) / consensusData.themes.length);
    }
    if (!aiReady || !todaysThemes.length) return null;
    const avg = todaysThemes.reduce((s, t) => s + t.creators, 0) / todaysThemes.length;
    return Math.min(92, Math.round(40 + avg * 12));
  }, [consensusData, aiReady, todaysThemes]);

  // Personalized insights: top categories the user consumed today → highlight matching themes
  const personalizedInsights = useMemo(() => {
    if (!aiReady || todaysThemes.length === 0) return null;
    const basedOn = todaysThemes.slice(0, 3).map((t) => t.topic);
    const recommended = todaysThemes
      .filter((t) => {
        const ct = consensusData?.themes.find((c) => c.topic.toLowerCase() === t.topic.toLowerCase());
        return (ct?.confidence ?? Math.min(92, 40 + t.creators * 14)) >= 65;
      })
      .slice(0, 3)
      .map(({ topic, count, creators }) => ({ topic, count, creators }));
    return { basedOn, recommended };
  }, [aiReady, todaysThemes, consensusData]);

  // Consensus synthesis — fires once when AI scan completes and consensusPayload is ready
  useEffect(() => {
    if (!consensusPayload || consensusData !== null || consensusLoading) return;
    setConsensusLoading(true);
    fetch("/api/youtube/consensus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(consensusPayload),
    })
      .then((r) => r.json())
      .then((data: ConsensusResult & { error?: string }) => {
        if (!data.error) setConsensusData(data);
      })
      .catch(() => {})
      .finally(() => setConsensusLoading(false));
  }, [consensusPayload, consensusData, consensusLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Top insight: best whyItMatters from highest-scored videos (for exec-brief signal grid)
  const topInsight = useMemo(() => {
    if (!aiReady) return null;
    for (const video of filteredVideos) {
      const ai = aiResults[video.videoId];
      if (ai?.whyItMatters && (ai.score ?? 0) >= 80) return ai.whyItMatters;
    }
    for (const video of filteredVideos) {
      const ai = aiResults[video.videoId];
      if (ai?.whyItMatters) return ai.whyItMatters;
    }
    return null;
  }, [filteredVideos, aiResults, aiReady]);

  // Watch time saved estimate (60% of filtered videos' total runtime)
  const savedTimeStr = useMemo(() => {
    if (!filteredVideos.length) return "";
    const secs = Math.round(filteredVideos.reduce((a, v) => a + isoToSeconds(v.duration), 0) * 0.6);
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [filteredVideos]);

  // Videos shown in the proof grid — filtered to selected consensus theme when one is active
  const displayVideos = useMemo(() => {
    if (!selectedConsensusTheme || !aiReady) return filteredVideos;
    return filteredVideos.filter((v) =>
      aiResults[v.videoId]?.categories?.some(
        (c) => c.toLowerCase() === selectedConsensusTheme.toLowerCase()
      )
    );
  }, [filteredVideos, selectedConsensusTheme, aiResults, aiReady]);

  const userName     = session?.user?.name?.split(" ")[0] ?? session?.user?.email?.split("@")[0] ?? "there";
  const hour         = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Shared card renderer — used by both flat grid and sectioned layout
  function renderCard(video: FeedVideo) {
    const ai       = aiResults[video.videoId];
    const affinity = getChannelAffinity(video.channelTitle);
    const rs       = ai && showAI ? rankingScore(video, ai, mode, affinity) : null;
    const ctIcon   = ai && showAI ? (CONTENT_TYPE_ICONS[ai.contentType] ?? null) : null;
    const isTrusted  = affinity >= AFFINITY_PASS_THRESHOLD;
    const bizScore   = ai?.subScores?.businessRelevance ?? null;
    const topicCat   = ai?.topicCategory as TopicCategory | undefined;
    const topicScore = ai?.topicScore ?? null;
    const topic      = detectPrimaryTopic(video.title, video.description);
    const topicIcon  = topicCat === "high_priority" ? "🎯" : topicCat === "neutral" ? "〰️" : topicCat === "excluded" ? "🚫" : "⏳";
    return (
      <div key={video.videoId} className="feed-card">
        {video.thumbnail && (
          <div className="feed-card__thumb-wrap">
            <img src={video.thumbnail} alt="" className="feed-card__thumb" loading="lazy" />
            {video.duration && formatDuration(video.duration) && (
              <span className="feed-card__duration-badge">{formatDuration(video.duration)}</span>
            )}
            {rs !== null && <span className={scoreBadgeClass(rs)}>{rs}</span>}
          </div>
        )}
        <div className="feed-card__body">
          <div className="feed-card__channel-row">
            <p className="feed-card__channel">{video.channelTitle}</p>
            {ctIcon && <span className="feed-card__content-type" title={ai?.contentType}>{ctIcon} {ai?.contentType}</span>}
          </div>
          {ai?.categories?.length > 0 && showAI && (
            <div className="feed-card__categories">
              {ai.categories.slice(0, 3).map((cat) => (
                <span key={cat} className={categoryChipClass(cat)}>{cat}</span>
              ))}
            </div>
          )}
          <p className="feed-card__title">{video.title}</p>
          {ai?.whyItMatters && showAI && (
            <p className="feed-card__why-matters">
              <span className="feed-card__why-label">Why it matters</span>
              {ai.whyItMatters}
            </p>
          )}
          {ai?.explanation && showAI && !ai?.whyItMatters && <p className="feed-card__explanation">{ai.explanation}</p>}
          <div className="feed-card__meta">
            <span className="feed-card__age">{formatAge(video.publishedAt)}</span>
            {video.duration && estimateSavings(video.duration) && (
              <span className="feed-card__savings">{estimateSavings(video.duration)}</span>
            )}
          </div>
          <button onClick={() => setDrawerVideo(video)} className="feed-card__analyze-btn">
            ⚡ Analyze Fluff
          </button>
          {DEBUG_BADGES && (
            <div className="feed-card__debug-badge">
              <span>⏱ {isoToSeconds(video.duration)}s</span>
              <span>{topicIcon} Topic: {topicScore ?? "—"}</span>
              <span>💼 Biz: {bizScore ?? "—"}</span>
              <span>⭐ Ch: {affinity > 0 ? `+${affinity}` : affinity}{isTrusted ? " ✓" : ""}</span>
              <span>📌 {topic}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (status === "unauthenticated") {
    return (
      <div className="feed-signin">
        <div className="feed-signin__card">
          <span className="feed-signin__icon">📺</span>
          <h2 className="feed-signin__title">Your Subscription Feed</h2>
          <p className="feed-signin__body">
            Connect your Google account to pull your YouTube subscriptions and
            analyze any video in one click — no copy-pasting required.
          </p>
          <button onClick={() => void signIn("google")} className="feed-signin__btn">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908C16.658 13.814 17.64 11.506 17.64 9.2z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.706A5.41 5.41 0 0 1 3.68 9c0-.59.102-1.163.284-1.706V4.962H.957A9.007 9.007 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 6.294C4.672 4.161 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return <div className="feed-state-msg"><span className="spinner" /> Connecting…</div>;
  }

  return (
    <div className="feed-root">
      <div className="feed-header">
        <div>
          <h2 className="feed-title">Subscription Feed</h2>
          <p className="feed-subtitle">
            {session?.user?.email}
            {cacheAge && (
              <span className="feed-cache-age"> · cached {formatAge(cacheAge.toISOString())}</span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Link href="/intelligence" className="id-nav-link">Intelligence →</Link>
          <button
            onClick={() => { setAiResults({}); setAiScanEnabled(false); loadFeed(true); }}
            disabled={loading}
            className="feed-refresh-btn"
            title="Force-refresh from YouTube (uses API quota)"
          >
            {loading ? <><span className="spinner" /> Loading…</> : "↻ Refresh"}
          </button>
          <button onClick={() => void signOut()} className="feed-signout">Sign out</button>
        </div>
      </div>

      {mode === "off" && (
        <div className="feed-info-banner">
          <Info size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
          <div>
            <h4 className="feed-info-banner__title">Your Business Intelligence Terminal</h4>
            <p className="feed-info-banner__body">
              Select a mode below to surface today's most important business insights from your subscriptions.
            </p>
          </div>
        </div>
      )}

      {!loading && videos.length > 0 && (
        <div className="feed-filter-bar">
          {(["business", "founder", "finance"] as ("business" | "founder" | "finance")[]).map((m) => {
            const isActive  = mode === m;
            const isLoading = aiLoading && isActive;
            const variantBase   = m === "founder" ? "research" : m === "finance" ? "finance" : null;
            const cls = [
              "feed-filter-btn",
              variantBase ? `feed-filter-btn--${variantBase}` : "",
              isActive ? `feed-filter-btn--${variantBase ?? "active"}${variantBase ? "-active" : ""}` : "",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={m}
                type="button"
                className={cls}
                onClick={() => handleModeClick(m)}
                disabled={isLoading}
              >
                {isLoading
                  ? <><span className="spinner" /> Scoring…</>
                  : MODE_META[m].label}
              </button>
            );
          })}

          {mode !== "off" && filteredVideos.length > 0 && (
            <span className="feed-filter-count">
              {filteredVideos.length} video{filteredVideos.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {(mode === "business" || mode === "founder" || mode === "finance") && (
        <div className="feed-deep-research-banner">
          <span>{MODE_META[mode].banner}</span>
        </div>
      )}

      {analyticsMetrics && (
        <div className="feed-analytics-header">
          <div className="feed-analytics-header__pulse">
            <span className="feed-analytics-header__ping" />
            <span className="feed-analytics-header__dot" />
          </div>
          <span className="feed-analytics-header__stat">
            🛡️ <strong>{analyticsMetrics.pct}%</strong> fluff deflected
          </span>
          <span className="feed-analytics-header__divider">·</span>
          <span className="feed-analytics-header__stat">
            ⏳ <strong>~{analyticsMetrics.savedHrs}h</strong> of noise removed
          </span>
          <span className="feed-analytics-header__divider">·</span>
          <span className="feed-analytics-header__stat">
            📺 <strong>{analyticsMetrics.shown}</strong> of {analyticsMetrics.total} videos approved
          </span>
        </div>
      )}

      {loading && <div className="feed-state-msg"><span className="spinner" /> Fetching your subscriptions…</div>}
      {error && <p className="feed-error">⚠ {error}</p>}

      {!loading && !error && filteredVideos.length === 0 && !aiLoading && (mode === "business" || mode === "founder" || mode === "finance") && (
        <p className="feed-empty">{MODE_META[mode].empty}</p>
      )}

      {!loading && filteredVideos.length > 0 && (
        <>
          {aiReady ? (
            <>
              {/* ── Section 7: Intelligence Scoreboard ── */}
              <div className="intel-scoreboard">
                <div className="intel-scoreboard__item">
                  <span className="intel-scoreboard__icon">📊</span>
                  <div className="intel-scoreboard__value">{analyticsMetrics?.total ?? videos.length}</div>
                  <div className="intel-scoreboard__label">Videos Analyzed</div>
                </div>
                <div className="intel-scoreboard__item">
                  <span className="intel-scoreboard__icon">⚡</span>
                  <div className="intel-scoreboard__value intel-scoreboard__value--blue">{filteredVideos.length}</div>
                  <div className="intel-scoreboard__label">High-Signal</div>
                </div>
                <div className="intel-scoreboard__item">
                  <span className="intel-scoreboard__icon">📈</span>
                  <div className="intel-scoreboard__value intel-scoreboard__value--purple">{todaysThemes.length}</div>
                  <div className="intel-scoreboard__label">Major Trends</div>
                </div>
                <div className="intel-scoreboard__item">
                  <span className="intel-scoreboard__icon">🚀</span>
                  <div className="intel-scoreboard__value intel-scoreboard__value--green">{sectionedVideos.opportunities.length}</div>
                  <div className="intel-scoreboard__label">Opportunities</div>
                </div>
                <div className="intel-scoreboard__item">
                  <span className="intel-scoreboard__icon">⚠️</span>
                  <div className="intel-scoreboard__value intel-scoreboard__value--amber">{sectionedVideos.risks.length}</div>
                  <div className="intel-scoreboard__label">Risks Detected</div>
                </div>
                {consensusStrength !== null && (
                  <div className="intel-scoreboard__item">
                    <span className="intel-scoreboard__icon">🎯</span>
                    <div className="intel-scoreboard__value intel-scoreboard__value--cyan">{consensusStrength}%</div>
                    <div className="intel-scoreboard__label">Consensus Strength</div>
                  </div>
                )}
                <div className="intel-scoreboard__item">
                  <span className="intel-scoreboard__icon">⏳</span>
                  <div className="intel-scoreboard__value intel-scoreboard__value--green">{savedTimeStr || "—"}</div>
                  <div className="intel-scoreboard__label">Time Saved</div>
                </div>
              </div>

              {/* ── Section 1: Executive Intelligence Brief ── */}
              <div className={`exec-brief${consensusLoading && !consensusData ? " exec-brief--loading" : ""}`}>
                <div className="exec-brief__head">
                  <div>
                    <p className="exec-brief__eyebrow">AI Intelligence Terminal</p>
                    <h2 className="exec-brief__title">Today&apos;s Executive Intelligence Brief</h2>
                    <p className="exec-brief__sub">
                      Prepared from {analyticsMetrics?.total ?? videos.length} videos · {filteredVideos.length} approved sources
                    </p>
                  </div>
                  {consensusLoading && !consensusData
                    ? <span className="exec-brief__badge exec-brief__badge--loading">Synthesizing…</span>
                    : consensusData && <span className="exec-brief__badge">⚡ AI Synthesized</span>}
                </div>
                {consensusData?.executiveBrief?.length ? (
                  <ul className="exec-brief__list">
                    {consensusData.executiveBrief.map((bullet, i) => (
                      <li key={i} className="exec-brief__item">{bullet}</li>
                    ))}
                  </ul>
                ) : consensusLoading ? (
                  <div className="exec-brief__skeleton">
                    {[88, 72, 80, 65, 76].map((w) => (
                      <div key={w} className="exec-brief__skeleton-line" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : (
                  <p className="exec-brief__placeholder">Waiting for enough creator signals to synthesize a brief…</p>
                )}

                {/* Signal mini-grid: Trend Vector / Emerging Theme / Biggest Insight */}
                {todaysThemes.length > 0 && (
                  <div className="exec-brief__signal-grid">
                    <div className="exec-brief__signal-item">
                      <span className="exec-brief__signal-label">Trend Vector</span>
                      <p className="exec-brief__signal-topic">{todaysThemes[0].topic}</p>
                      {(() => {
                        const ct = consensusData?.themes.find(t => t.topic.toLowerCase() === todaysThemes[0].topic.toLowerCase());
                        return ct?.consensus
                          ? <p className="exec-brief__signal-desc">{ct.consensus}</p>
                          : consensusLoading
                            ? <div className="exec-brief__signal-skeleton" style={{ width: "90%" }} />
                            : null;
                      })()}
                    </div>
                    {todaysThemes[1] && (
                      <div className="exec-brief__signal-item">
                        <span className="exec-brief__signal-label">Emerging Theme</span>
                        <p className="exec-brief__signal-topic">{todaysThemes[1].topic}</p>
                        {(() => {
                          const ct = consensusData?.themes.find(t => t.topic.toLowerCase() === todaysThemes[1].topic.toLowerCase());
                          return ct?.consensus
                            ? <p className="exec-brief__signal-desc">{ct.consensus}</p>
                            : consensusLoading
                              ? <div className="exec-brief__signal-skeleton" style={{ width: "80%" }} />
                              : null;
                        })()}
                      </div>
                    )}
                    {(topInsight || consensusLoading) && (
                      <div className="exec-brief__signal-item">
                        <span className="exec-brief__signal-label">Biggest Insight</span>
                        {topInsight
                          ? <p className="exec-brief__signal-desc" style={{ fontStyle: "normal", color: "#94a3b8" }}>{topInsight}</p>
                          : <div className="exec-brief__signal-skeleton" style={{ width: "85%" }} />
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Sections 2, 3 & 4: Opportunity + Risk + Most Actionable ── */}
              <div className="intel-signal-grid">
                <div className="intel-signal intel-signal--opp">
                  <p className="intel-signal__eyebrow">🚀 Biggest Opportunity</p>
                  {biggestOpportunity ? (
                    <>
                      <h3 className="intel-signal__topic">
                        {consensusData?.topOpportunity?.topic ?? biggestOpportunity.topic}
                      </h3>
                      {consensusData?.topOpportunity?.reason
                        ? <p className="intel-signal__reason">{consensusData.topOpportunity.reason}</p>
                        : consensusLoading && <p className="intel-signal__reason intel-signal__reason--loading">Generating analysis…</p>
                      }
                      <div className="intel-signal__stats">
                        <div className="intel-signal__stat">
                          <span className="intel-signal__stat-value">{consensusData?.topOpportunity?.confidence ?? "—"}%</span>
                          <span className="intel-signal__stat-label">Confidence</span>
                        </div>
                        <div className="intel-signal__stat">
                          <span className="intel-signal__stat-value">{biggestOpportunity.creators}</span>
                          <span className="intel-signal__stat-label">Creators</span>
                        </div>
                        <div className="intel-signal__stat">
                          <span className="intel-signal__stat-value">{biggestOpportunity.mentions}</span>
                          <span className="intel-signal__stat-label">Mentions</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="intel-signal__empty">No major consensus opportunities detected today.</p>
                  )}
                </div>

                <div className={`intel-signal${topRisk ? " intel-signal--risk" : " intel-signal--safe"}`}>
                  <p className="intel-signal__eyebrow">{topRisk ? "⚠️ Biggest Risk" : "✅ Risk Assessment"}</p>
                  {topRisk ? (
                    <>
                      <h3 className="intel-signal__topic">
                        {consensusData?.topRisk?.topic ?? topRisk.topic}
                      </h3>
                      {consensusData?.topRisk?.reason
                        ? <p className="intel-signal__reason">{consensusData.topRisk.reason}</p>
                        : consensusLoading && <p className="intel-signal__reason intel-signal__reason--loading">Generating analysis…</p>
                      }
                      <div className="intel-signal__stats">
                        <div className="intel-signal__stat">
                          <span className="intel-signal__stat-value">{consensusData?.topRisk?.confidence ?? "—"}%</span>
                          <span className="intel-signal__stat-label">Confidence</span>
                        </div>
                        <div className="intel-signal__stat">
                          <span className="intel-signal__stat-value">{topRisk.creators}</span>
                          <span className="intel-signal__stat-label">Creators</span>
                        </div>
                        <div className="intel-signal__stat">
                          <span className="intel-signal__stat-value">{topRisk.mentions}</span>
                          <span className="intel-signal__stat-label">Mentions</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="intel-signal__empty">No major consensus risks detected today.</p>
                  )}
                </div>

                <div className="intel-signal intel-signal--action">
                  <p className="intel-signal__eyebrow">⚡ Most Actionable Insight</p>
                  {consensusData?.actions?.[0] ? (
                    <>
                      <h3 className="intel-signal__topic" style={{ fontSize: "0.9rem" }}>Top Action for Today</h3>
                      <p className="intel-signal__reason">{consensusData.actions[0]}</p>
                      <div className="intel-signal__stats">
                        <div className="intel-signal__stat">
                          <span className="intel-signal__stat-value">{consensusData.actions.length}</span>
                          <span className="intel-signal__stat-label">Actions</span>
                        </div>
                        <div className="intel-signal__stat">
                          <span className="intel-signal__stat-value">{todaysThemes.length}</span>
                          <span className="intel-signal__stat-label">Themes</span>
                        </div>
                        <div className="intel-signal__stat">
                          <span className="intel-signal__stat-value">{filteredVideos.length}</span>
                          <span className="intel-signal__stat-label">Sources</span>
                        </div>
                      </div>
                    </>
                  ) : consensusLoading ? (
                    <p className="intel-signal__reason intel-signal__reason--loading">Generating actionable intelligence…</p>
                  ) : (
                    <p className="intel-signal__empty">No actionable insights synthesized yet.</p>
                  )}
                </div>
              </div>

              {/* ── Executive Summary Narrative ── */}
              {todaysThemes.length > 0 && (
                <div className="intel-summary">
                  <p className="intel-summary__text">
                    After analyzing <strong>{analyticsMetrics?.total ?? videos.length}</strong> videos, WatchFilter identified{" "}
                    <strong>{todaysThemes.length}</strong> major theme{todaysThemes.length !== 1 ? "s" : ""}.{" "}
                    <strong>{todaysThemes.slice(0, 2).map(t => t.topic).join(" and ")}</strong>
                    {" "}{todaysThemes.length > 1 ? "are" : "is"} the strongest signal{todaysThemes.length > 1 ? "s" : ""} today
                    {todaysThemes.length > 2
                      ? `, alongside ${todaysThemes.slice(2, 4).map(t => t.topic.toLowerCase()).join(" and ")}`
                      : ""}
                    , with <strong>{filteredVideos.length}</strong> high-signal videos approved from{" "}
                    <strong>{new Set(filteredVideos.map(v => v.channelTitle)).size}</strong> unique channels.
                  </p>
                </div>
              )}

              {/* ── Section 4: Creator Consensus Engine ── */}
              {todaysThemes.length > 0 && (
                <div className="consensus-engine">
                  <div className="consensus-engine__head">
                    <div>
                      <h3 className="consensus-engine__title">Creator Consensus Engine</h3>
                      <p className="consensus-engine__sub">What independent creators are collectively concluding today</p>
                    </div>
                  </div>
                  <div className="consensus-engine__cards">
                    {todaysThemes.map(({ topic, count, creators, channelNames }, i) => {
                      const cTheme = consensusData?.themes.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
                      const maxCount = todaysThemes[0].count;
                      const pct = Math.round((count / maxCount) * 100);
                      const confidence = cTheme?.confidence ?? Math.min(92, 40 + creators * 14);
                      const isActive = selectedConsensusTheme === topic;
                      return (
                        <div
                          key={topic}
                          className={`consensus-card${isActive ? " consensus-card--active" : ""}`}
                          onClick={() => setSelectedConsensusTheme(isActive ? null : topic)}
                        >
                          <div className="consensus-card__header">
                            <span className="consensus-card__rank">#{i + 1}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              {isActive && <span className="consensus-card__active-badge">Isolated Focus</span>}
                              <span className="consensus-card__meta">{creators} creator{creators !== 1 ? "s" : ""} · {count} video{count !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                          <h4 className="consensus-card__topic">{topic}</h4>
                          {cTheme?.consensus
                            ? <p className="consensus-card__statement">{cTheme.consensus}</p>
                            : consensusLoading && <p className="consensus-card__statement consensus-card__statement--loading">Synthesizing consensus…</p>
                          }
                          <div className="consensus-card__footer">
                            <div className="consensus-card__bar-wrap">
                              <div className="consensus-card__bar" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="consensus-card__stats">
                              <span className="consensus-card__confidence">{confidence}%</span>
                              <span className="consensus-card__confidence-label">agreement</span>
                            </div>
                          </div>
                          <div className="consensus-card__channels">
                            {channelNames.map((ch) => (
                              <span key={ch} className="consensus-card__channel">{ch}</span>
                            ))}
                            {creators > channelNames.length && (
                              <span className="consensus-card__channel consensus-card__channel--more">+{creators - channelNames.length} more</span>
                            )}
                          </div>
                          {/* Bottom progress accent track */}
                          <div className="consensus-card__progress-track">
                            <div className="consensus-card__progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Section 5: Do This Today ── */}
              {(consensusData?.actions?.length ?? 0) > 0 ? (
                <div className="intel-actions">
                  <div className="intel-actions__head">
                    <div>
                      <p className="intel-actions__eyebrow">Actionable Intelligence</p>
                      <h3 className="intel-actions__title">Do This Today</h3>
                    </div>
                    <span className="intel-actions__badge">Based on creator consensus</span>
                  </div>
                  <ol className="intel-actions__list">
                    {consensusData!.actions.map((action, i) => (
                      <li key={i} className="intel-actions__item">
                        <span className="intel-actions__num">{i + 1}</span>
                        <span className="intel-actions__text">{action}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : consensusLoading ? (
                <div className="intel-actions intel-actions--loading">
                  <div className="intel-actions__head">
                    <div>
                      <p className="intel-actions__eyebrow">Actionable Intelligence</p>
                      <h3 className="intel-actions__title">Do This Today</h3>
                    </div>
                    <span className="intel-actions__badge intel-actions__badge--loading">Generating…</span>
                  </div>
                </div>
              ) : null}

              {/* ── Section 6: Relevant To You ── */}
              {personalizedInsights && personalizedInsights.basedOn.length > 0 && (
                <div className="intel-personalized">
                  <div className="intel-personalized__head">
                    <p className="intel-personalized__eyebrow">Personalized Signals</p>
                    <h3 className="intel-personalized__title">Relevant To You</h3>
                  </div>
                  <p className="intel-personalized__basis">
                    Based on today&apos;s content patterns:
                    {personalizedInsights.basedOn.map((t) => (
                      <span key={t} className="intel-personalized__tag">{t}</span>
                    ))}
                  </p>
                  {personalizedInsights.recommended.length > 0 && (
                    <div className="intel-personalized__rows">
                      {personalizedInsights.recommended.map(({ topic, count, creators }) => (
                        <div key={topic} className="intel-personalized__row">
                          <span className="intel-personalized__arrow">→</span>
                          <span className="intel-personalized__topic">{topic}</span>
                          <span className="intel-personalized__detail">{creators} creator{creators !== 1 ? "s" : ""} · {count} video{count !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Supporting video proof streams ── */}
              <div className="dash-proof-streams">
                <div className="dash-proof-streams__hud">
                  <div>
                    <h3 className="dash-proof-streams__label">
                      🗄️ Supporting Verified Video Proof Streams
                    </h3>
                    <p className="dash-proof-streams__count">
                      Showing {displayVideos.length} of {filteredVideos.length} source assets
                      {selectedConsensusTheme ? ` · filtered by "${selectedConsensusTheme}"` : ""}
                    </p>
                  </div>
                  {selectedConsensusTheme && (
                    <button
                      onClick={() => setSelectedConsensusTheme(null)}
                      className="dash-proof-streams__clear-btn"
                    >
                      Clear filter: <strong>{selectedConsensusTheme}</strong> ✕
                    </button>
                  )}
                </div>
                {displayVideos.length === 0 ? (
                  <div className="dash-proof-streams__empty">
                    <p>No source videos mapped to this consensus theme.</p>
                  </div>
                ) : (
                  <div className="feed-grid feed-grid--4col">{displayVideos.map(renderCard)}</div>
                )}
              </div>
            </>
          ) : (
            /* flat grid while AI is still loading */
            <div className="feed-grid">{filteredVideos.map(renderCard)}</div>
          )}
        </>
      )}

      <FluffAnalyzerDrawer
        isOpen={drawerVideo !== null}
        video={drawerVideo}
        ai={drawerVideo ? aiResults[drawerVideo.videoId] : undefined}
        onClose={() => setDrawerVideo(null)}
        onFullAnalyze={() => drawerVideo && handleAnalyze(drawerVideo)}
        isAnalyzing={analyzingId === drawerVideo?.videoId}
      />
    </div>
  );
}
