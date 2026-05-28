import OpenAI from "openai";
import { getIntelligenceSnapshot, upsertIntelligenceSnapshot } from "./db";
import { SCORER_SYSTEM_PROMPT, CONSENSUS_SYSTEM_PROMPT } from "./prompts";
import type { AIScore } from "@/app/api/youtube/filter/route";
import type { ConsensusResult } from "@/app/api/youtube/consensus/route";
import type { FeedVideo } from "@/app/api/youtube/feed/route";

const openai = new OpenAI();

// ── YouTube helpers ───────────────────────────────────────────────────────────

async function ytGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  return res.json() as Promise<T>;
}

function isoToSecs(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
}

// ── Feed fetch ────────────────────────────────────────────────────────────────

type RawSub = { snippet: { resourceId: { channelId: string } } };
type RawChan = { id: string; contentDetails: { relatedPlaylists: { uploads: string } } };
type RawPlaylistItem = { snippet: { title: string; resourceId: { videoId: string }; channelTitle: string; publishedAt: string; thumbnails: { medium?: { url: string }; default?: { url: string } } } };
type RawVideoMeta = { id: string; contentDetails: { duration: string }; snippet: { description: string } };

async function fetchFeed(accessToken: string): Promise<FeedVideo[]> {
  const subData = await ytGet<{ items?: RawSub[] }>(
    `subscriptions?part=snippet&mine=true&maxResults=50&order=relevance`,
    accessToken,
  );
  const channelIds = (subData.items ?? []).map(s => s.snippet.resourceId.channelId);
  if (!channelIds.length) return [];

  const chanData = await ytGet<{ items?: RawChan[] }>(
    `channels?part=contentDetails&id=${channelIds.join(",")}&maxResults=50`,
    accessToken,
  );
  const playlists = (chanData.items ?? []).map(c => c.contentDetails.relatedPlaylists.uploads).filter(Boolean);

  const playlistResults = await Promise.allSettled(
    playlists.map(pid =>
      ytGet<{ items?: RawPlaylistItem[] }>(
        `playlistItems?part=snippet&playlistId=${pid}&maxResults=10`,
        accessToken,
      )
    )
  );

  type RawV = { videoId: string; title: string; channelTitle: string; thumbnail: string; publishedAt: string };
  const rawVideos: RawV[] = playlistResults
    .flatMap(r =>
      r.status === "fulfilled"
        ? (r.value.items ?? []).map(item => ({
            videoId: item.snippet.resourceId.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? "",
            publishedAt: item.snippet.publishedAt,
          }))
        : []
    )
    .filter(v => v.videoId)
    .slice(0, 1000);

  if (!rawVideos.length) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < rawVideos.length; i += 50)
    chunks.push(rawVideos.slice(i, i + 50).map(v => v.videoId));

  const metaResults = await Promise.allSettled(
    chunks.map(chunk =>
      ytGet<{ items?: RawVideoMeta[] }>(
        `videos?part=contentDetails,snippet&id=${chunk.join(",")}&maxResults=50`,
        accessToken,
      )
    )
  );

  const metaMap = new Map<string, { duration: string; description: string }>();
  metaResults.forEach(r => {
    if (r.status === "fulfilled") {
      (r.value.items ?? []).forEach(item => {
        metaMap.set(item.id, {
          duration: item.contentDetails.duration,
          description: (item.snippet.description ?? "").slice(0, 600),
        });
      });
    }
  });

  return rawVideos
    .map(v => ({
      ...v,
      duration: metaMap.get(v.videoId)?.duration ?? "",
      description: metaMap.get(v.videoId)?.description ?? "",
    }))
    .filter(v => v.duration && isoToSecs(v.duration) >= 600);
}

// ── AI scoring ────────────────────────────────────────────────────────────────

async function scoreVideos(videos: FeedVideo[]): Promise<Record<string, AIScore>> {
  const eligible = videos.slice(0, 100);
  const scores: Record<string, AIScore> = {};

  for (let i = 0; i < eligible.length; i += 25) {
    const batch = eligible.slice(i, i + 25);
    const list = batch
      .map((v, j) =>
        `${j + 1}. ID:${v.videoId}\nTitle: "${v.title}"\nChannel: "${v.channelTitle}"\nDescription: "${v.description}"`
      )
      .join("\n\n");

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SCORER_SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Classify and score each video. Return JSON: {"results":[{"videoId":"...","score":87,"topicCategory":"high_priority","topicScore":90,` +
              `"contentType":"Interview","categories":["Venture Capital"],"explanation":"...","whyItMatters":"Reveals how...","subScores":{"businessRelevance":90,"educationalValue":80,"actionability":75,"informationDensity":85}}]}\n\n` +
              list,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });
      const parsed = JSON.parse(completion.choices[0].message.content ?? '{"results":[]}') as { results?: AIScore[] };
      (parsed.results ?? []).forEach(r => { scores[r.videoId] = r; });
    } catch (err) {
      console.error("[worker] scoring batch error:", err);
    }
  }

  return scores;
}

// ── Theme building ────────────────────────────────────────────────────────────

interface Theme {
  topic: string;
  count: number;
  creators: number;
  channelNames: string[];
  insights: string[];
}

// Semantic deduplication: merge categories that share a dominant keyword.
// E.g. "AI Agencies", "AI Automation", "AI Business", "AI Employees" → "AI"
// Returns a canonical label → set of raw labels that belong to it.
function deduplicateCategories(
  raw: Map<string, { count: number; channels: Set<string>; insights: string[] }>,
): Map<string, { count: number; channels: Set<string>; insights: string[] }> {
  // Extract the most common leading keyword (first word or two) from each category.
  function leadingKey(label: string): string {
    const words = label.trim().split(/\s+/);
    // Use first two words if second word is short, otherwise first word.
    if (words.length >= 2 && words[1]!.length <= 4) return `${words[0]} ${words[1]}`.toLowerCase();
    return words[0]!.toLowerCase();
  }

  const groups = new Map<string, string[]>(); // leadingKey → raw labels
  for (const label of raw.keys()) {
    const key = leadingKey(label);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(label);
  }

  const merged = new Map<string, { count: number; channels: Set<string>; insights: string[] }>();

  for (const [, labels] of groups) {
    if (labels.length === 1) {
      // No merge needed
      merged.set(labels[0]!, raw.get(labels[0]!)!);
    } else {
      // Find the label with the highest count to use as canonical
      const canonical = labels.reduce((best, l) =>
        (raw.get(l)?.count ?? 0) > (raw.get(best)?.count ?? 0) ? l : best
      );
      const agg = { count: 0, channels: new Set<string>(), insights: [] as string[] };
      for (const l of labels) {
        const e = raw.get(l)!;
        agg.count += e.count;
        e.channels.forEach(ch => agg.channels.add(ch));
        for (const ins of e.insights) {
          if (agg.insights.length < 4 && !agg.insights.includes(ins)) agg.insights.push(ins);
        }
      }
      merged.set(canonical, agg);
    }
  }

  return merged;
}

function buildThemes(videos: FeedVideo[], scores: Record<string, AIScore>): Theme[] {
  const raw = new Map<string, { count: number; channels: Set<string>; insights: string[] }>();

  videos.forEach(v => {
    const ai = scores[v.videoId];
    if (!ai || ai.topicCategory === "excluded") return;
    ai.categories.forEach(cat => {
      if (!cat) return;
      if (!raw.has(cat)) raw.set(cat, { count: 0, channels: new Set(), insights: [] });
      const e = raw.get(cat)!;
      e.count++;
      e.channels.add(v.channelTitle);
      if (ai.whyItMatters && e.insights.length < 4) e.insights.push(ai.whyItMatters);
    });
  });

  const map = deduplicateCategories(raw);

  const usedChannels = new Set<string>();
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([topic, { count, channels, insights }]) => {
      const pills = [...channels].filter(ch => !usedChannels.has(ch)).slice(0, 3);
      pills.forEach(ch => usedChannels.add(ch));
      return { topic, count, creators: channels.size, channelNames: pills, insights };
    });
}

// ── Consensus ─────────────────────────────────────────────────────────────────

interface ThemeInput { topic: string; count: number; creators: string[]; insights: string[] }

async function runConsensus(themes: Theme[]): Promise<ConsensusResult | null> {
  if (!themes.length) return null;

  const topOpp  = themes[0];
  const topRisk = themes.find(t => /risk|crash|warning|decline|crisis/i.test(t.topic)) ?? null;

  const themeList = themes.slice(0, 6).map((t, i) =>
    `Theme ${i + 1}: "${t.topic}"\nCreators (${t.creators}): ${t.channelNames.join(", ")}\nVideos: ${t.count}\nKey insights:\n${
      t.insights.slice(0, 3).map(s => `  - ${s}`).join("\n") || "  - (no insights extracted)"
    }`
  ).join("\n\n");

  const oppSection = `\n\nTop Opportunity: "${topOpp.topic}"\nCreators: ${topOpp.channelNames.join(", ")}\nInsights:\n${
    topOpp.insights.slice(0, 3).map(s => `  - ${s}`).join("\n") || "  - (no insights)"
  }`;

  const riskSection = topRisk
    ? `\n\nTop Risk: "${topRisk.topic}"\nCreators: ${topRisk.channelNames.join(", ")}\nInsights:\n${
        topRisk.insights.slice(0, 3).map(s => `  - ${s}`).join("\n") || "  - (no insights)"
      }`
    : "\n\nTop Risk: none identified";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CONSENSUS_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Generate the intelligence briefing. Return JSON:\n` +
            `{"executiveBrief":["..."],"themes":[{"topic":"...","consensus":"...","confidence":80,"trendDirection":"growing","opportunitySignal":"High","opportunityTopics":["AI Agencies"],"whyItMatters":"Signals that...","recommendedActions":["Audit...","Build...","Test..."],"contrarianView":""}],` +
            `"topOpportunity":{"topic":"...","reason":"...","confidence":80},"topRisk":null,"actions":["..."]}\n\n` +
            themeList + oppSection + riskSection,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    return JSON.parse(completion.choices[0].message.content ?? "{}") as ConsensusResult;
  } catch (err) {
    console.error("[worker] consensus error:", err);
    return null;
  }
}

// ── Widget data derivations ───────────────────────────────────────────────────

function buildMetaData(
  allVideos: FeedVideo[],
  filtered: FeedVideo[],
  scores: Record<string, AIScore>,
  themes: Theme[],
) {
  const hp = filtered.filter(v => scores[v.videoId]?.topicCategory === "high_priority").length;
  const uniqueChannels = new Set(filtered.map(v => v.channelTitle)).size;
  const totalSecs = filtered.reduce((a, v) => a + isoToSecs(v.duration), 0);
  return {
    totalAnalyzed: allVideos.length,
    vettedCount: filtered.length,
    themesFound: themes.length,
    highPriorityCount: hp,
    uniqueChannels,
    timeSavedHours: Math.round(totalSecs * 0.6 / 3600),
    themes: themes.map(t => ({ topic: t.topic, count: t.count })),
  };
}

function buildAlerts(
  themes: Theme[],
  prevThemes: Array<{ topic: string; count: number }>,
  consensus: ConsensusResult | null,
): Record<string, unknown>[] {
  const prevMap = new Map(prevThemes.map(t => [t.topic.toLowerCase(), t.count]));
  const alerts: Record<string, unknown>[] = [];

  themes.slice(0, 3).forEach((t, i) => {
    const isRisk = /risk|crash|warning|decline|crisis/i.test(t.topic);
    if (isRisk) return;
    const isNew = !prevMap.has(t.topic.toLowerCase());
    const type = isNew ? "Emerging" : i === 0 ? "Critical" : "Stable";
    const prevCount = prevMap.get(t.topic.toLowerCase());
    const delta = prevCount !== undefined
      ? t.count > prevCount ? `+${t.count - prevCount} videos` : prevCount > t.count ? `-${prevCount - t.count} videos` : "Steady"
      : isNew ? "New Track" : "Steady";

    // Find the matching consensus theme for whyItMatters
    const cTheme = consensus?.themes?.find(ct => ct.topic.toLowerCase() === t.topic.toLowerCase());
    const whyItMatters = cTheme?.whyItMatters ?? t.insights[0] ?? undefined;

    alerts.push({
      id: i + 1,
      type,
      label: t.topic,
      delta,
      creators: t.creators,
      videos: t.count,
      evidenceCount: t.insights.length,
      whyItMatters,
    });
  });

  if (consensus?.topOpportunity && alerts.length < 3) {
    const already = alerts.some(a => (a.label as string).toLowerCase() === consensus.topOpportunity!.topic.toLowerCase());
    if (!already) {
      const matchTheme = themes.find(t => t.topic.toLowerCase() === consensus.topOpportunity!.topic.toLowerCase());
      alerts.push({
        id: alerts.length + 1,
        type: "Emerging",
        label: consensus.topOpportunity.topic,
        delta: `${consensus.topOpportunity.confidence}% conf`,
        creators: matchTheme?.creators,
        videos: matchTheme?.count,
        evidenceCount: matchTheme?.insights.length,
        whyItMatters: consensus.topOpportunity.reason,
      });
    }
  }

  return alerts.slice(0, 4);
}

function buildShifts(
  themes: Theme[],
  prevThemes: Array<{ topic: string; count: number }>,
): Record<string, unknown>[] {
  const prevMap = new Map(prevThemes.map(t => [t.topic.toLowerCase(), t.count]));

  return themes.slice(0, 6).map(t => {
    const prev = prevMap.get(t.topic.toLowerCase());
    if (prev === undefined) return { topic: t.topic, direction: "NEW", change: "New Entry" };
    const delta = t.count - prev;
    if (delta > 1)  return { topic: t.topic, direction: "SURGING",   change: `Up ${delta} slot${delta !== 1 ? "s" : ""}` };
    if (delta < -1) return { topic: t.topic, direction: "DEFLATING", change: `Down ${Math.abs(delta)} slot${Math.abs(delta) !== 1 ? "s" : ""}` };
    return { topic: t.topic, direction: "STABLE", change: "No Delta" };
  });
}

function buildVoiceShare(filtered: FeedVideo[]): Record<string, unknown>[] {
  const map = new Map<string, number>();
  filtered.forEach(v => { map.set(v.channelTitle, (map.get(v.channelTitle) ?? 0) + 1); });
  const total = filtered.length || 1;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count, share: Math.round((count / total) * 100) }));
}

// ── Public entrypoint ─────────────────────────────────────────────────────────

export async function runIntelligencePipeline(userId: string, accessToken: string): Promise<void> {
  console.log(`[intelligence-worker] starting pipeline for ${userId}`);
  try {
    const prevSnap = await getIntelligenceSnapshot(userId);
    const prevThemes = (prevSnap?.metaData?.themes ?? []) as Array<{ topic: string; count: number }>;

    const videos = await fetchFeed(accessToken);
    console.log(`[intelligence-worker] feed: ${videos.length} videos`);
    if (!videos.length) return;

    const scores = await scoreVideos(videos);
    console.log(`[intelligence-worker] scored: ${Object.keys(scores).length} videos`);

    const themes = buildThemes(videos, scores);
    const consensus = await runConsensus(themes);

    const filtered = videos.filter(v => scores[v.videoId]?.topicCategory !== "excluded");
    const metaData = buildMetaData(videos, filtered, scores, themes);
    const alerts   = buildAlerts(themes, prevThemes, consensus);
    const shifts   = buildShifts(themes, prevThemes);
    const voiceShare = buildVoiceShare(filtered);

    await upsertIntelligenceSnapshot({
      userId,
      metaData,
      brief: consensus?.executiveBrief ?? [],
      alerts,
      shifts,
      voiceShare,
    });
    console.log(`[intelligence-worker] snapshot saved for ${userId}`);
  } catch (err) {
    console.error("[intelligence-worker] pipeline error:", err);
  }
}
