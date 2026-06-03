"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  INTEL_CATEGORY_BLOCKS,
  type FeedMode,
} from "@/hooks/useFilteredSubscriptionFeed";
import { FluffAnalyzerDrawer, categoryChipClass } from "@/components/FluffAnalyzerDrawer";

const DEBUG_BADGES = false;

// ── Consensus types ───────────────────────────────────────────────────────────

interface ConsensusTheme {
  topic: string;
  consensus: string;
  confidence: number;
  trendDirection?: 'growing' | 'stable' | 'declining';
  opportunitySignal?: 'High' | 'Medium' | 'Low';
  whyItMatters?: string;
  recommendedActions?: string[];
  contrarianView?: string;
}
interface MostImportantInsight {
  insight: string;
  whyItMatters: string;
  creatorCount: number;
  videoCount: number;
  referenceCount: number;
  topCreators: string[];
}
interface ConsensusResult {
  mostImportantInsight: MostImportantInsight | null;
  executiveBrief: string[];
  themes:         ConsensusTheme[];
  topOpportunity: { topic: string; reason: string; confidence: number } | null;
  topRisk:        { topic: string; reason: string; confidence: number } | null;
  actions:        string[];
}

function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  console.debug('[WF Analytics]', name, props ?? {});
  // Wire to posthog/mixpanel/gtag here when ready
}

interface Props {
  onAnalyze: (youtubeUrl: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Topic matching: exact (case-insensitive) first, then substring fallback for
// cases where the AI slightly renames the topic despite being told not to.
function findConsensusTheme<T extends { topic: string }>(themes: T[] | undefined, topic: string): T | undefined {
  if (!themes?.length) return undefined;
  const t = topic.toLowerCase();
  return (
    themes.find(ct => ct.topic.toLowerCase() === t) ??
    themes.find(ct => { const c = ct.topic.toLowerCase(); return c.includes(t) || t.includes(c); })
  );
}

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
    banner: "🎙 Founder & Investing — Premium: founder interviews, podcasts & market analysis",
    empty: "No founder/investing content found. Try Business Intelligence mode.",
  },
  finance: {
    label: "💰 Finance",
    banner: "💰 Finance — Personal finance, wealth management & market intelligence",
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
  const [mode, setMode]               = useState<FeedMode>(() => {
    try {
      const saved = sessionStorage.getItem("wf_feed_mode");
      if (saved && ["off", "longform", "business", "founder", "finance"].includes(saved))
        return saved as FeedMode;
    } catch { /* ignore */ }
    return "off";
  });
  const [aiResults, setAiResults]     = useState<Record<string, AIScore>>({});
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiScanEnabled, setAiScanEnabled] = useState(false);
  const [cacheAge, setCacheAge]           = useState<Date | null>(null);
  const [consensusData, setConsensusData]         = useState<ConsensusResult | null>(null);
  const [consensusLoading, setConsensusLoading]   = useState(false);
  const [selectedConsensusTheme, setSelectedConsensusTheme] = useState<string | null>(null);
  const [showAllSources, setShowAllSources] = useState(false);

  // ── Structural filter ──────────────────────────────────────────────────────
  // business/founder: all 40-min+ videos with ≥1 business keyword in title,
  //                   after hard channel/title blocks. Shows immediately.
  // longform:         all 40-min+ after hard blocks (no topic gate).
  // off:              all after hard blocks only.
  const structuralFilter = useFilteredFeed(videos, mode);

  // ── Scan target: unscored videos only (capped at 100) ───────────────────────
  const scanTarget = useMemo<FeedVideo[]>(() => {
    if (mode === "off" || mode === "longform") return [];
    return structuralFilter.filter(v => !aiResults[v.videoId]).slice(0, 100);
  }, [structuralFilter, mode, aiResults]);

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
          if (!ai) {
            // Unscored: only trusted channels show while AI runs.
            // Unknown channels default-hide — never show before AI verdict.
            return getChannelAffinity(v.channelTitle) >= AFFINITY_PASS_THRESHOLD;
          }
          return ai.topicCategory !== "excluded";
        })
      // Before AI is ready: show only trusted channels to prevent junk flash
      : structuralFilter.filter(v => getChannelAffinity(v.channelTitle) >= AFFINITY_PASS_THRESHOLD);

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

  // AI score cache — 24h TTL. Reused across sessions so already-scored videos skip the API.
  function loadAiCache(): Record<string, AIScore> {
    try {
      const aiKey = `wf_ai_${session?.user?.email ?? "anon"}`;
      const raw = localStorage.getItem(aiKey);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; scores: Record<string, AIScore> };
        if (Date.now() - cached.ts < 24 * 60 * 60 * 1000 && cached.scores) return cached.scores;
      }
    } catch { /* corrupt */ }
    return {};
  }

  function loadFeed(forceRefresh = false) {
    if (!forceRefresh) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as { ts: number; videos: FeedVideo[] };
          if (Date.now() - cached.ts < CACHE_TTL_MS && cached.videos?.length) {
            setVideos(cached.videos);
            setCacheAge(new Date(cached.ts));
            setAiResults(loadAiCache());
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
        setAiResults(forceRefresh ? {} : loadAiCache());
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

  // Restore AI scores from localStorage when email becomes available (skips re-scan on nav back)
  const aiRestoredRef = useRef(false);
  useEffect(() => {
    if (!session?.user?.email || aiRestoredRef.current) return;
    aiRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(`wf_ai_${session.user.email}`);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; scores: Record<string, AIScore> };
        if (Date.now() - cached.ts < 24 * 60 * 60 * 1000 && Object.keys(cached.scores).length > 0) {
          setAiResults(cached.scores);
        }
      }
    } catch { /* ignore */ }
  }, [session?.user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

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
            description:  smartTruncateDescription(v.description, 200),
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

    // Progressive: update state as each batch completes so videos appear immediately
    const batchPromises = batches.map(batch =>
      scanBatch(batch).then(results => {
        if (!results.length) return;
        const batchScores: Record<string, AIScore> = {};
        results.forEach(r => { batchScores[r.videoId] = r; });
        console.log(`[AI-scan] batch done: ${results.length} videos`);
        setAiResults(prev => ({ ...prev, ...batchScores }));
      })
    );

    // After all batches: persist the full merged set to localStorage
    Promise.allSettled(batchPromises)
      .then(() => {
        setAiResults(prev => {
          try {
            const aiKey = `wf_ai_${session?.user?.email ?? "anon"}`;
            localStorage.setItem(aiKey, JSON.stringify({ ts: Date.now(), scores: prev }));
          } catch { /* storage full */ }
          return prev;
        });
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
    const next = mode === clicked ? "off" : clicked;
    setMode(next);
    setSelectedConsensusTheme(null);
    try { sessionStorage.setItem("wf_feed_mode", next); } catch { /* ignore */ }
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
    const blocked = (mode === "founder" || mode === "finance" || mode === "business")
      ? (INTEL_CATEGORY_BLOCKS[mode] ?? [])
      : [];
    const map = new Map<string, { count: number; channels: Set<string> }>();
    for (const [videoId, ai] of Object.entries(aiResults)) {
      if (ai.topicCategory === "excluded") continue;
      const video = filteredVideos.find((v) => v.videoId === videoId);
      if (!video) continue;
      for (const cat of ai.categories ?? []) {
        if (cat.length <= 3) continue;
        // Skip categories that don't belong in this mode's intelligence brief
        const catLower = cat.toLowerCase();
        if (blocked.some(b => catLower === b || catLower.startsWith(b))) continue;
        if (!map.has(cat)) map.set(cat, { count: 0, channels: new Set() });
        const e = map.get(cat)!;
        e.count++;
        e.channels.add(video.channelTitle);
      }
    }
    const sorted = [...map.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4);

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
    if (!aiReady) return new Map<string, { creators: string[]; insights: { creator: string; text: string }[]; totalMentions: number }>();
    const map = new Map<string, { creators: Set<string>; insights: { creator: string; text: string }[]; totalMentions: number }>();
    for (const video of filteredVideos) {
      const ai = aiResults[video.videoId];
      if (!ai || ai.topicCategory === "excluded") continue;
      const insight = ai.whyItMatters || ai.explanation;
      for (const cat of ai.categories ?? []) {
        if (cat.length <= 3) continue;
        if (!map.has(cat)) map.set(cat, { creators: new Set(), insights: [], totalMentions: 0 });
        const e = map.get(cat)!;
        e.creators.add(video.channelTitle);
        e.totalMentions++;
        if (insight && e.insights.length < 5) e.insights.push({ creator: video.channelTitle, text: insight });
      }
    }
    const out = new Map<string, { creators: string[]; insights: { creator: string; text: string }[]; totalMentions: number }>();
    for (const [k, v] of map) out.set(k, { creators: [...v.creators], insights: v.insights, totalMentions: v.totalMentions });
    return out;
  }, [filteredVideos, aiResults, aiReady]);

  // Per-theme video list (for Emerging card thumbnails)
  const themeVideoMap = useMemo(() => {
    if (!aiReady) return new Map<string, FeedVideo[]>();
    const map = new Map<string, FeedVideo[]>();
    for (const video of filteredVideos) {
      const cats = aiResults[video.videoId]?.categories ?? [];
      for (const cat of cats) {
        if (cat.length <= 3) continue;
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat)!.push(video);
      }
    }
    return map;
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
        return {
          topic,
          count,
          creators: (d?.creators ?? []).slice(0, 4),
          insights: (d?.insights ?? []).slice(0, 3).map(i => i.text),
          referenceCount: d?.totalMentions ?? count,
        };
      }),
      topOpportunity: biggestOpportunity
        ? { topic: biggestOpportunity.topic, count: biggestOpportunity.mentions,
            creators: sectionedVideos.opportunities.slice(0, 4).map((v) => v.channelTitle),
            insights: sectionInsights(sectionedVideos.opportunities),
            referenceCount: themeDataMap.get(biggestOpportunity.topic)?.totalMentions ?? biggestOpportunity.mentions }
        : null,
      topRisk: topRisk
        ? { topic: topRisk.topic, count: topRisk.mentions,
            creators: sectionedVideos.risks.slice(0, 4).map((v) => v.channelTitle),
            insights: sectionInsights(sectionedVideos.risks),
            referenceCount: themeDataMap.get(topRisk.topic)?.totalMentions ?? topRisk.mentions }
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
        const ct = findConsensusTheme(consensusData?.themes, t.topic);
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

  // Creator influence: top creators ranked by topic breadth × video contribution
  const creatorInfluence = useMemo(() => {
    if (!aiReady) return [];
    const map = new Map<string, { topics: Set<string>; videos: number; topInsight: string | null }>();
    for (const video of filteredVideos) {
      const ai = aiResults[video.videoId];
      if (!ai || ai.topicCategory === 'excluded') continue;
      const ch = video.channelTitle;
      if (!map.has(ch)) map.set(ch, { topics: new Set(), videos: 0, topInsight: null });
      const e = map.get(ch)!;
      e.videos++;
      for (const cat of ai.categories ?? []) { if (cat.length > 3) e.topics.add(cat); }
      if (!e.topInsight) e.topInsight = ai.whyItMatters || ai.explanation || null;
    }
    return [...map.entries()]
      .map(([name, d]) => ({ name, topics: [...d.topics].slice(0, 3), videos: d.videos, topInsight: d.topInsight, score: d.topics.size * 15 + d.videos * 8 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
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
    const pool = showAllSources ? structuralFilter : filteredVideos;
    if (!selectedConsensusTheme || !aiReady) return pool;
    return pool.filter((v) =>
      aiResults[v.videoId]?.categories?.some(
        (c) => c.toLowerCase() === selectedConsensusTheme.toLowerCase()
      )
    );
  }, [filteredVideos, structuralFilter, showAllSources, selectedConsensusTheme, aiResults, aiReady]);

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

              {/* ── Hero Insight: Most Important Insight Today ── */}
              {todaysThemes.length > 0 && (() => {
                const hero = todaysThemes[0];
                const ct = findConsensusTheme(consensusData?.themes, hero.topic);
                const mii = consensusData?.mostImportantInsight;
                const creatorCount = mii?.creatorCount ?? hero.creators;
                const videoCount   = mii?.videoCount   ?? hero.count;
                const confidence = ct?.confidence ?? Math.min(92, 40 + hero.creators * 14);
                const confidenceLabel = confidence >= 80 ? 'High' : confidence >= 60 ? 'Medium' : 'Low';
                const confidenceColor = confidence >= 80
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                  : confidence >= 60
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
                    : 'text-slate-400 bg-slate-800/60 border-slate-700/40';
                const heroAction = ct?.recommendedActions?.[0] ?? consensusData?.actions?.[0];
                const insightText = mii?.insight ?? ct?.consensus;
                const whyText = mii?.whyItMatters ?? ct?.whyItMatters;
                return (
                  <div className="border border-[#1e2d45] rounded-xl p-6 space-y-4" style={{ background: 'linear-gradient(140deg,#0f2535 0%,#166088 55%,#0e3154 100%)', boxShadow: '0 4px 32px #0000002e,inset 0 1px #ffffff08' }}>
                    <p className="text-[9px] font-mono font-black text-[#38bdf8] uppercase tracking-widest">🔥 Most Important Insight Today</p>

                    {insightText ? (
                      <p className="text-base text-white font-semibold leading-relaxed">{insightText}</p>
                    ) : consensusLoading ? (
                      <div className="space-y-2">
                        <div className="h-4 bg-slate-800/60 animate-pulse rounded" style={{ width: '90%' }} />
                        <div className="h-4 bg-slate-800/60 animate-pulse rounded" style={{ width: '70%' }} />
                      </div>
                    ) : (
                      <p className="text-base text-white font-semibold leading-relaxed">{hero.topic}</p>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`text-[10px] font-mono font-black px-2.5 py-1 rounded border uppercase tracking-wider ${confidenceColor}`}>
                        Confidence: {confidenceLabel}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Sources: <span className="text-white font-bold">{creatorCount}</span> creator{creatorCount !== 1 ? 's' : ''} · <span className="text-white font-bold">{videoCount}</span> video{videoCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {(whyText || heroAction) && (
                      <div className="space-y-3 pt-3 border-t border-slate-800/50">
                        {whyText && (
                          <div className="space-y-1">
                            <span className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-widest block">Why It Matters</span>
                            <p className="text-xs text-slate-300 leading-relaxed">{whyText}</p>
                          </div>
                        )}
                        {heroAction && (
                          <div className="space-y-1">
                            <span className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-widest block">Recommended Action</span>
                            <p className="text-xs text-emerald-300 leading-relaxed font-medium">✓ {heroAction}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {ct?.contrarianView && (
                      <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2 flex items-start gap-2">
                        <span className="text-amber-400 text-xs shrink-0 mt-0.5">⚡</span>
                        <div>
                          <span className="text-[9px] font-mono font-black text-amber-400 uppercase tracking-widest block">Contrarian View</span>
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5 leading-relaxed">{ct.contrarianView}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

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

                {/* ── What Changed Today ── */}
                {todaysThemes.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-[#1e2d45] space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-mono font-black text-[#38bdf8] uppercase tracking-widest">Live Intelligence Feed · What Changed Today</p>
                      <span className="text-[9px] font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                        {filteredVideos.length} sources
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {todaysThemes.map((t, idx) => {
                        const ct = findConsensusTheme(consensusData?.themes, t.topic);
                        const trend = ct?.trendDirection ?? (t.creators >= 3 ? 'growing' : 'stable');
                        const icon = trend === 'growing' ? '↑' : trend === 'declining' ? '↓' : '→';
                        const trendColor = trend === 'growing' ? 'text-emerald-400' : trend === 'declining' ? 'text-red-400' : 'text-slate-400';
                        const rowBg = trend === 'growing' ? 'bg-emerald-500/5 border-emerald-500/15' : trend === 'declining' ? 'bg-red-500/5 border-red-500/15' : 'bg-slate-900/40 border-slate-800/40';
                        return (
                          <div key={t.topic} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border ${rowBg}`}>
                            <span className={`text-base font-black shrink-0 mt-0.5 ${trendColor}`}>{icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-mono text-slate-600">#{idx + 1}</span>
                                <p className="text-xs font-black text-white font-mono uppercase tracking-tight">{t.topic}</p>
                              </div>
                              <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                                <span className="text-slate-300 font-bold">{t.creators}</span> creator{t.creators !== 1 ? 's' : ''} · <span className="text-slate-300 font-bold">{t.count}</span> video{t.count !== 1 ? 's' : ''}
                                {trend === 'growing' && <span className={`${trendColor} font-bold`}> · gaining momentum</span>}
                                {trend === 'declining' && <span className={`${trendColor} font-bold`}> · declining</span>}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      {biggestOpportunity && !todaysThemes.some(t => t.topic.toLowerCase() === biggestOpportunity.topic.toLowerCase()) && (
                        <div className="flex items-start gap-3 bg-emerald-500/5 rounded-lg px-3 py-2.5 border border-emerald-500/15">
                          <span className="text-base font-black shrink-0 mt-0.5 text-emerald-400">↑</span>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-white font-mono uppercase tracking-tight">{biggestOpportunity.topic}</p>
                            <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                              <span className="text-emerald-400 font-bold">Opportunity signal</span> · {biggestOpportunity.creators} creator{biggestOpportunity.creators !== 1 ? 's' : ''} · {biggestOpportunity.mentions} signals
                            </p>
                          </div>
                        </div>
                      )}
                      {topRisk && !todaysThemes.some(t => t.topic.toLowerCase() === topRisk.topic.toLowerCase()) && (
                        <div className="flex items-start gap-3 bg-red-500/5 rounded-lg px-3 py-2.5 border border-red-500/15">
                          <span className="text-base font-black shrink-0 mt-0.5 text-red-400">↓</span>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-white font-mono uppercase tracking-tight">{topRisk.topic}</p>
                            <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                              <span className="text-red-400 font-bold">Risk signal</span> · {topRisk.creators} creator{topRisk.creators !== 1 ? 's' : ''} · {topRisk.mentions} signals
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Opportunity Alerts ── */}
                {topRisk && (
                  <div className="mt-5 pt-4 border-t border-[#1e2d45] space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-mono font-black text-[#38bdf8] uppercase tracking-widest">AI-Detected · Risk Alert</p>
                      <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        1 Active
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {topRisk && (() => {
                        const reason = consensusData?.topRisk?.reason || themeDataMap.get(topRisk.topic)?.insights[0]?.text;
                        const riskTheme = findConsensusTheme(consensusData?.themes, topRisk.topic);
                        const riskActions = riskTheme?.recommendedActions?.slice(0, 2) ?? (consensusData?.actions ? [consensusData.actions[consensusData.actions.length - 1]] : []);
                        const creators = themeDataMap.get(topRisk.topic)?.creators ?? [];
                        return (
                          <div className="bg-[#120b0b] border border-red-500/20 rounded-xl p-5 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <span className="text-[9px] font-mono font-black text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded uppercase tracking-wider">Risk Alert</span>
                                <h4 className="text-base font-black text-white font-mono uppercase tracking-tight mt-2">{topRisk.topic}</h4>
                              </div>
                              <span className="text-red-400 text-xl font-black shrink-0">⚠</span>
                            </div>
                            {reason && (
                              <div className="space-y-1">
                                <span className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-wider block">Why Now</span>
                                <p className="text-xs text-slate-300 leading-relaxed border-l-2 border-red-500/40 pl-3">{reason}</p>
                              </div>
                            )}
                            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-red-500/10">
                              <div>
                                <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Creators</p>
                                <p className="text-sm font-black text-white">{topRisk.creators}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Videos</p>
                                <p className="text-sm font-black text-white">{sectionedVideos.risks.length}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Signals</p>
                                <p className="text-sm font-black text-red-400">{topRisk.mentions}</p>
                              </div>
                            </div>
                            {riskActions.filter(Boolean).length > 0 && (
                              <div className="pt-3 border-t border-red-500/15 space-y-2.5">
                                <span className="text-[9px] font-mono font-black text-white uppercase tracking-widest block">Recommended Action</span>
                                <div className="space-y-2">
                                  {riskActions.filter(Boolean).map((a, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                      <span className="text-emerald-400 shrink-0 font-bold text-sm leading-none mt-0.5">✓</span>
                                      <p className="text-xs text-slate-200 leading-snug font-medium">{a}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {creators.slice(0, 4).length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {creators.slice(0, 4).map((c, i) => (
                                  <span key={i} className="text-[9px] font-mono text-slate-300 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded">{c}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Section 4: Emerging Signals Grid ── */}
              {todaysThemes.length > 0 && (() => {
                const row1 = todaysThemes.slice(0, 2);
                const row2 = todaysThemes.slice(2, 4);

                const renderCard = (t: typeof todaysThemes[0], globalIdx: number) => {
                  const cTheme = findConsensusTheme(consensusData?.themes, t.topic);
                  const confidence = cTheme?.confidence ?? Math.min(92, 40 + t.creators * 14);
                  const isStrong = t.creators >= 3;
                  const isActive = selectedConsensusTheme === t.topic;
                  const strengthLabel =
                    t.creators >= 4 || confidence >= 80 ? "Very Strong" :
                    t.creators >= 3 || confidence >= 70 ? "Strong" :
                    t.creators >= 2 || confidence >= 60 ? "Moderate" : "Weak";
                  const strengthColor =
                    strengthLabel === "Very Strong" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                    strengthLabel === "Strong"      ? "text-blue-400 bg-blue-500/10 border-blue-500/20" :
                    strengthLabel === "Moderate"    ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                                                     "text-slate-400 bg-slate-800/60 border-slate-700/40";
                  const isTopOpp = biggestOpportunity?.topic.toLowerCase() === t.topic.toLowerCase();
                  const signals = themeDataMap.get(t.topic)?.insights.length ?? 0;
                  const allCreators = themeDataMap.get(t.topic)?.creators ?? t.channelNames;
                  const topVideos = themeVideoMap.get(t.topic) ?? [];
                  const MEDALS = ["🥇", "🥈", "🥉"];

                  return (
                    <div
                      key={t.topic}
                      onClick={() => {
                        const next = isActive ? null : t.topic;
                        setSelectedConsensusTheme(next);
                        trackEvent(next ? 'consensus_card_opened' : 'consensus_card_closed', { topic: t.topic, isStrong });
                      }}
                      className={`group border rounded-xl p-5 flex flex-col cursor-pointer transition-all duration-200 select-none ${
                        isActive
                          ? "border-blue-500 ring-1 ring-blue-500/20 shadow-[0_0_28px_rgba(59,130,246,0.12)]"
                          : "border-[#1e2d45] hover:border-blue-500/40 hover:shadow-[0_0_18px_rgba(59,130,246,0.07)]"
                      }`}
                      style={{ background: 'linear-gradient(140deg,#0f2535 0%,#166088 55%,#0e3154 100%)', boxShadow: '0 4px 32px #0000002e,inset 0 1px #ffffff08' }}
                    >
                      {/* Top meta row */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-mono font-black text-blue-400 bg-blue-950/60 border border-blue-900/40 px-2 py-0.5 rounded">
                          #{globalIdx + 1}
                        </span>
                        <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border ${strengthColor}`}>
                          {strengthLabel}
                        </span>
                      </div>

                      {/* Title */}
                      <h4 className="text-sm font-black text-white tracking-tight font-mono uppercase leading-tight mb-1">
                        {t.topic}
                      </h4>

                      {/* AI consensus — primary message */}
                      <div className="flex-1 mb-2 space-y-1">
                        {cTheme?.consensus ? (
                          <>
                            <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest block">Key Consensus</span>
                            <p className="text-xs text-white leading-relaxed font-medium">
                              {cTheme.consensus}
                            </p>
                          </>
                        ) : consensusLoading ? (
                          <>
                            <span className="text-[9px] font-mono font-black text-slate-600 uppercase tracking-widest block">Key Consensus</span>
                            <p className="text-xs text-slate-600 italic animate-pulse">Synthesizing consensus…</p>
                          </>
                        ) : null}
                      </div>

                      {/* Stats */}
                      <p className="text-[10px] font-mono text-white mb-3">
                        {t.creators} creator{t.creators !== 1 ? "s" : ""} · {t.count} video{t.count !== 1 ? "s" : ""}
                        {signals > 0 && ` · ${signals} signal${signals !== 1 ? "s" : ""}`}
                      </p>

                      {/* Cross-Creator Validation — compact in-card view */}
                      {(() => {
                        const cardInsights = themeDataMap.get(t.topic)?.insights ?? [];
                        if (cardInsights.length === 0) return null;
                        return (
                          <div className="space-y-1 mb-3">
                            <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest block">Cross-Creator Validation</span>
                            <div className="space-y-1">
                              {cardInsights.slice(0, 2).map((ins, ii) => (
                                <div key={ii} className="flex items-start gap-1.5">
                                  <span className="text-[10px] font-mono font-black text-blue-400 shrink-0 mt-0.5 truncate max-w-[80px]">{ins.creator}:</span>
                                  <p className="text-xs text-white leading-relaxed line-clamp-2">{ins.text}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Why It Matters */}
                      {cTheme?.whyItMatters ? (
                        <div className="space-y-0.5 mb-3">
                          <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest block">Why It Matters</span>
                          <p className="text-xs text-white leading-relaxed">{cTheme.whyItMatters}</p>
                        </div>
                      ) : consensusLoading ? (
                        <div className="h-3 bg-slate-800/50 animate-pulse rounded mb-3" style={{ width: '85%' }} />
                      ) : null}

                      {/* Recommended Action */}
                      {cTheme?.recommendedActions?.[0] ? (
                        <div className="space-y-0.5 mb-3">
                          <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest block">Recommended Action</span>
                          <div className="flex items-start gap-1.5">
                            <span className="text-emerald-400 text-xs shrink-0 leading-none mt-0.5">✓</span>
                            <p className="text-xs text-white leading-snug">{cTheme.recommendedActions[0]}</p>
                          </div>
                        </div>
                      ) : null}

                      {/* Trend + top contributors — shown for all cards */}
                      {allCreators.length > 0 && (
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[9px] font-mono font-black ${strengthColor}`}>
                              {strengthLabel === "Very Strong" ? "↑↑ Very Strong Consensus" : strengthLabel === "Strong" ? "↑ Strong Consensus" : strengthLabel === "Moderate" ? "→ Moderate Consensus" : "↓ Weak Consensus"}
                            </span>
                            {isTopOpp && (
                              <span className="text-[9px] font-mono font-black text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">
                                Opportunity: High
                              </span>
                            )}
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest block">Top Contributors</span>
                            {allCreators.slice(0, 3).map((ch, ci) => (
                              <div key={ci} className="flex items-center gap-2">
                                <span className="text-sm leading-none">{MEDALS[ci]}</span>
                                <span className="text-xs font-bold text-white">{ch}</span>
                              </div>
                            ))}
                            {t.creators > Math.min(allCreators.length, 3) && (
                              <span className="text-[10px] font-mono text-blue-400 pl-6 block">
                                +{t.creators - Math.min(allCreators.length, 3)} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}


                      {/* Footer: progress bar + Verify Sources pill */}
                      <div className="space-y-2 pt-2.5 border-t border-slate-800/60 mt-auto">
                        <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-indigo-500 h-1 rounded-full transition-all duration-300"
                            style={{ width: `${confidence}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-white">{confidence}% consensus</span>
                          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[9px] font-mono font-bold uppercase tracking-wider transition-all duration-200 ${
                            isActive
                              ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                              : "bg-slate-900 text-slate-500 border-slate-800 group-hover:text-slate-300 group-hover:border-slate-700"
                          }`}>
                            <span>{isActive ? "Collapse" : "Verify Sources"}</span>
                            <span
                              className={`transition-transform duration-200 ${isActive ? "rotate-180" : "rotate-0"}`}
                              style={{ display: 'inline-block' }}
                            >▼</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                };

                const renderDrawer = (rowThemes: typeof todaysThemes) => {
                  if (!selectedConsensusTheme) return null;
                  const activeT = rowThemes.find(t => t.topic === selectedConsensusTheme);
                  if (!activeT) return null;

                  const cTheme = consensusData?.themes.find(ct => ct.topic.toLowerCase() === activeT.topic.toLowerCase());
                  const topVideos = themeVideoMap.get(activeT.topic) ?? [];
                  const allCreators = themeDataMap.get(activeT.topic)?.creators ?? activeT.channelNames;
                  const insights = themeDataMap.get(activeT.topic)?.insights ?? [];
                  const reportSlug = activeT.topic.toLowerCase().replace(/\s+/g, '-');
                  const MEDALS = ["🥇", "🥈", "🥉"];

                  return (
                    <div className="w-full border border-[#1e2d45] border-t-2 border-t-blue-500/40 rounded-xl p-5 space-y-4" style={{ background: 'linear-gradient(140deg,#0f2535 0%,#166088 55%,#0e3154 100%)', boxShadow: '0 4px 32px #0000002e,inset 0 1px #ffffff08' }}>
                      {/* Drawer header */}
                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 gap-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                          <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest truncate">
                            Verified Audit Trail —{" "}
                            <span className="text-blue-400 normal-case font-sans tracking-normal font-medium">{activeT.topic}</span>
                          </span>
                        </div>
                        <a
                          href={`/reports/${reportSlug}`}
                          onClick={e => { e.stopPropagation(); trackEvent('full_report_clicked', { topic: activeT.topic }); }}
                          className="text-[9px] font-mono text-slate-500 hover:text-blue-400 transition-colors shrink-0"
                        >
                          Full Transcript Logs →
                        </a>
                      </div>

                      {/* Horizontal video evidence grid */}
                      {topVideos.length === 0 ? (
                        <p className="text-center text-xs font-mono text-slate-600 py-4 italic">
                          No source citations indexed for this topic yet.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {topVideos.slice(0, 4).map(v => (
                            <div
                              key={v.videoId}
                              className="border border-[#1e2d45] rounded-xl p-4 flex gap-4 items-start hover:border-blue-500/40 transition-all group/card"
                              style={{ background: 'linear-gradient(140deg,#0f2535 0%,#166088 55%,#0e3154 100%)', boxShadow: '0 4px 32px #0000002e,inset 0 1px #ffffff08' }}
                              onClick={e => e.stopPropagation()}
                            >
                              {/* Thumbnail */}
                              <div className="w-28 h-16 bg-slate-950 rounded-lg overflow-hidden relative border border-slate-800 shrink-0">
                                {v.thumbnail && (
                                  <img
                                    src={v.thumbnail}
                                    alt={v.title}
                                    className="w-full h-full object-cover opacity-40 group-hover/card:opacity-70 transition-opacity"
                                    loading="lazy"
                                  />
                                )}
                              </div>
                              {/* Metadata */}
                              <div className="flex-1 space-y-1.5 min-w-0">
                                <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                                  <span className="font-black text-slate-300 uppercase truncate">{v.channelTitle}</span>
                                  {estimateSavings(v.duration) && (
                                    <span className="shrink-0 text-emerald-400 font-bold bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap">
                                      {estimateSavings(v.duration)}
                                    </span>
                                  )}
                                </div>
                                <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                  <p className="text-xs font-bold text-slate-200 line-clamp-2 group-hover/card:text-blue-400 transition-colors leading-snug tracking-tight">
                                    {v.title}
                                  </p>
                                </a>
                                <div className="flex justify-end">
                                  <a
                                    href={`https://www.youtube.com/watch?v=${v.videoId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="text-[8px] font-mono font-bold bg-blue-500/10 hover:bg-blue-500/20 text-white border border-blue-500/20 px-2 py-0.5 rounded transition-colors uppercase tracking-wider"
                                  >
                                    Analyze Fluff ↗
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Bottom intel row: Why It Matters · Contrarian · Actions */}
                      {(cTheme?.whyItMatters || cTheme?.contrarianView || (cTheme?.recommendedActions?.length ?? 0) > 0 || insights.length > 0 || allCreators.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-800/50">
                          <div className="space-y-3">
                            {cTheme?.whyItMatters && (
                              <div className="space-y-1">
                                <span className="text-xs font-mono font-black text-white uppercase tracking-widest block">Why It Matters</span>
                                <p className="text-xs text-slate-200 leading-relaxed pl-3 border-l-2 border-blue-500/50">{cTheme.whyItMatters}</p>
                              </div>
                            )}
                            {allCreators.length > 0 && (
                              <div className="space-y-1.5">
                                <span className="text-xs font-mono font-black text-white uppercase tracking-widest block">Supporting Creators</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {allCreators.map((ch, ci) => (
                                    <span key={ci} className="text-[9px] font-mono text-slate-300 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded">
                                      {MEDALS[ci] ?? "·"} {ch}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          {insights.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-xs font-mono font-black text-white uppercase tracking-widest block">Creator Findings</span>
                              <div className="space-y-2">
                                {insights.slice(0, 3).map((item, ii) => (
                                  <div key={ii} className="bg-slate-900/60 border-l-2 border-purple-500/40 rounded-r-lg px-3 py-2 space-y-1">
                                    <p className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-wider">{item.creator}</p>
                                    <p className="text-[10px] font-mono text-slate-300 italic leading-relaxed">&ldquo;{item.text}&rdquo;</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="space-y-3">
                            {cTheme?.contrarianView && (
                              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-amber-400 text-xs">⚡</span>
                                  <span className="text-xs font-mono font-black text-amber-400 uppercase tracking-widest">Contrarian View</span>
                                </div>
                                <p className="text-[10px] font-mono text-slate-400 leading-relaxed italic">{cTheme.contrarianView}</p>
                              </div>
                            )}
                            {(cTheme?.recommendedActions?.length ?? 0) > 0 && (
                              <div className="space-y-1.5">
                                <span className="text-xs font-mono font-black text-white uppercase tracking-widest block">Recommended Actions</span>
                                {cTheme!.recommendedActions!.map((action, ai) => (
                                  <div key={ai} className="flex items-start gap-2">
                                    <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600/70 text-white font-black text-[8px] flex items-center justify-center mt-0.5">{ai + 1}</span>
                                    <p className="text-xs text-slate-300 leading-snug">{action}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-mono font-black text-amber-400 uppercase tracking-widest">
                        Emerging Signals{" "}
                        <span className="font-normal normal-case text-slate-600">· Needs 3+ creators to qualify</span>
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        {todaysThemes.filter(t => t.creators >= 3).length} topic{todaysThemes.filter(t => t.creators >= 3).length !== 1 ? "s" : ""} with 3+ creators
                      </span>
                    </div>

                    {/* Row 1 */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {row1.map((t, i) => renderCard(t, i))}
                      </div>
                      {renderDrawer(row1)}
                    </div>

                    {/* Row 2 */}
                    {row2.length > 0 && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {row2.map((t, i) => renderCard(t, i + 2))}
                        </div>
                        {renderDrawer(row2)}
                      </div>
                    )}
                  </div>
                );
              })()}

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

              {/* ── Supporting video proof streams ── */}
              <div className="dash-proof-streams">
                <div className="dash-proof-streams__hud">
                  <div>
                    <h3 className="dash-proof-streams__label">
                      🗄️ Supporting Verified Video Proof Streams
                    </h3>
                    <p className="dash-proof-streams__count">
                      Showing {displayVideos.length} of {showAllSources ? structuralFilter.length : filteredVideos.length} source assets
                      {showAllSources ? " · extended view" : ""}
                      {selectedConsensusTheme ? ` · filtered by "${selectedConsensusTheme}"` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedConsensusTheme && (
                      <button
                        onClick={() => setSelectedConsensusTheme(null)}
                        className="dash-proof-streams__clear-btn"
                      >
                        Clear filter: <strong>{selectedConsensusTheme}</strong> ✕
                      </button>
                    )}
                    {structuralFilter.length > filteredVideos.length && (
                      <button
                        onClick={() => setShowAllSources(v => !v)}
                        className="text-[10px] font-mono font-bold px-3 py-1.5 rounded-lg border transition-colors"
                        style={showAllSources
                          ? { background: 'rgba(59,130,246,0.1)', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.3)' }
                          : { background: 'rgba(30,41,59,0.6)', color: '#ffffff', borderColor: 'rgba(51,65,85,0.6)' }}
                      >
                        {showAllSources
                          ? `↑ Show approved only (${filteredVideos.length})`
                          : `↓ Show all sources (+${structuralFilter.length - filteredVideos.length} more)`}
                      </button>
                    )}
                  </div>
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
