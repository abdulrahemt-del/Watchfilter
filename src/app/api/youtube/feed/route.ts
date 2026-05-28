import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";
import { getFeedCache, setFeedCache } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── YouTube API types ────────────────────────────────────────────────────────

type YTSubscriptionItem = {
  snippet: { resourceId: { channelId: string }; title: string };
};

type YTSubscriptionPage = {
  items?: YTSubscriptionItem[];
  nextPageToken?: string;
};

type YTChannelItem = {
  id: string;
  contentDetails: { relatedPlaylists: { uploads: string } };
};

type YTVideoItem = {
  id: string;
  contentDetails: { duration: string };
  snippet: { description: string };
};

type YTPlaylistItem = {
  snippet: {
    title: string;
    resourceId: { videoId: string };
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      medium?: { url: string };
      high?: { url: string };
      default?: { url: string };
    };
  };
};

export type FeedVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
  duration: string;    // ISO 8601 e.g. PT1H23M45S
  description: string; // first 600 chars of video description
};

// ── Server-side feed cache (2-hour TTL per user) ─────────────────────────────
// Prevents repeated YouTube API calls within the same server instance.
// Sits on top of the client 24-hour localStorage cache.
const SERVER_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const serverFeedCache = new Map<string, { ts: number; videos: FeedVideo[] }>();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ytGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `YouTube API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function isoSecs(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const accessToken = session?.accessToken;

    if (!session || !accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (session.error === "RefreshAccessTokenError") {
      return NextResponse.json(
        { error: "Your Google session expired. Please sign out and sign in again." },
        { status: 401 },
      );
    }

    const DB_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
    const cacheKey = session.user?.email ?? accessToken.slice(0, 16);

    // Tier 1 — in-memory (fastest, survives within same server process)
    const memCached = serverFeedCache.get(cacheKey);
    if (memCached && Date.now() - memCached.ts < SERVER_CACHE_TTL_MS) {
      console.log(`[feed] mem-cache HIT (age ${Math.round((Date.now() - memCached.ts) / 60000)}min)`);
      return NextResponse.json({ videos: memCached.videos });
    }

    // Tier 2 — DB cache (survives server restarts and deploys)
    try {
      const dbCached = await getFeedCache(cacheKey);
      if (dbCached && Date.now() - dbCached.cachedAt.getTime() < DB_CACHE_TTL_MS) {
        console.log(`[feed] db-cache HIT (age ${Math.round((Date.now() - dbCached.cachedAt.getTime()) / 60000)}min)`);
        const videos = dbCached.videos as FeedVideo[];
        serverFeedCache.set(cacheKey, { ts: dbCached.cachedAt.getTime(), videos });
        return NextResponse.json({ videos });
      }
    } catch (dbErr) {
      console.warn("[feed] db-cache lookup failed (non-fatal):", dbErr);
    }

    // 1 — Fetch subscriptions: 1 page = 50 channels (order=relevance picks most-watched)
    const subData = await ytGet<YTSubscriptionPage>(
      `subscriptions?part=snippet&mine=true&maxResults=50&order=relevance`,
      accessToken,
    );
    const channelIds = (subData.items ?? []).map((s) => s.snippet.resourceId.channelId);
    console.log(`[feed] subscriptions: ${channelIds.length}`);
    if (!channelIds.length) return NextResponse.json({ videos: [] });

    // 2 — Batch-fetch uploads playlist IDs
    const channelChunks: string[][] = [];
    for (let i = 0; i < channelIds.length; i += 50)
      channelChunks.push(channelIds.slice(i, i + 50));

    const channelResults = await Promise.all(
      channelChunks.map((chunk) =>
        ytGet<{ items?: YTChannelItem[] }>(
          `channels?part=contentDetails&id=${chunk.join(",")}&maxResults=50`,
          accessToken,
        ),
      ),
    );
    const playlists = channelResults
      .flatMap((r) => r.items ?? [])
      .map((c) => c.contentDetails.relatedPlaylists.uploads)
      .filter(Boolean);
    console.log(`[feed] playlists: ${playlists.length}`);

    // 3 — Fetch 50 most-recent videos per channel (1 page)
    async function fetchPlaylistVideos(playlistId: string, token: string): Promise<YTPlaylistItem[]> {
      const page1 = await ytGet<{ items?: YTPlaylistItem[] }>(
        `playlistItems?part=snippet&playlistId=${playlistId}&maxResults=25`,
        token,
      );
      return page1.items ?? [];
    }

    const playlistResults = await Promise.allSettled(
      playlists.map((playlistId) => fetchPlaylistVideos(playlistId, accessToken)),
    );

    type RawVideo = {
      videoId: string; title: string; channelTitle: string;
      thumbnail: string; publishedAt: string; duration: string; description: string;
    };

    const failedPlaylists = playlistResults.filter((r) => r.status === "rejected").length;
    if (failedPlaylists > 0) {
      console.warn(`[feed] ${failedPlaylists}/${playlists.length} playlist fetches failed`);
    }

    const allVideos: RawVideo[] = playlistResults
      .flatMap((r) =>
        r.status === "fulfilled"
          ? r.value.map((item): RawVideo => ({
              videoId:      item.snippet.resourceId.videoId,
              title:        item.snippet.title,
              channelTitle: item.snippet.channelTitle,
              thumbnail:
                item.snippet.thumbnails.medium?.url ??
                item.snippet.thumbnails.high?.url ??
                item.snippet.thumbnails.default?.url ??
                "",
              publishedAt: item.snippet.publishedAt,
              duration:    "",
              description: "",
            }))
          : [],
      )
      .filter((v) => v.videoId);

    // Round-robin interleave by channel so every subscribed channel contributes
    // its full history equally — prevents prolific recent posters from crowding
    // out older content from less-active channels.
    // Each channel's videos are already newest-first from the API.
    const channelBuckets = new Map<string, RawVideo[]>();
    for (const v of allVideos) {
      if (!channelBuckets.has(v.channelTitle)) channelBuckets.set(v.channelTitle, []);
      channelBuckets.get(v.channelTitle)!.push(v);
    }
    const buckets = [...channelBuckets.values()];
    const rawVideos: RawVideo[] = [];
    const maxDepth = Math.max(0, ...buckets.map((b) => b.length));
    outer: for (let depth = 0; depth < maxDepth; depth++) {
      for (const bucket of buckets) {
        if (bucket[depth]) {
          rawVideos.push(bucket[depth]);
          if (rawVideos.length >= 2500) break outer;
        }
      }
    }

    console.log(`[feed] raw videos (pre-duration): ${rawVideos.length}`);

    // 4 — Batch-fetch durations + descriptions (50 per call)
    const videoIds = rawVideos.map((v) => v.videoId);
    const videoChunks: string[][] = [];
    for (let i = 0; i < videoIds.length; i += 50)
      videoChunks.push(videoIds.slice(i, i + 50));

    const durationResults = await Promise.allSettled(
      videoChunks.map((chunk) =>
        ytGet<{ items?: YTVideoItem[] }>(
          `videos?part=contentDetails,snippet&id=${chunk.join(",")}&maxResults=50`,
          accessToken,
        ),
      ),
    );

    const failedDurations = durationResults.filter((r) => r.status === "rejected").length;
    if (failedDurations > 0) {
      console.warn(`[feed] ${failedDurations}/${videoChunks.length} duration batch fetches failed`);
    }

    const metaMap = new Map<string, { duration: string; description: string }>();
    durationResults.forEach((r) => {
      if (r.status === "fulfilled") {
        (r.value.items ?? []).forEach((item) => {
          metaMap.set(item.id, {
            duration: item.contentDetails.duration,
            description: (item.snippet.description ?? "").slice(0, 600),
          });
        });
      }
    });

    // 5 — Server-side hard exclusions + duration filter
    //     Hard blocks run HERE so bad content is never transmitted to the client
    //     and never consumes AI scoring tokens.

    const HARD_BLOCKED_CHANNELS = [
      // General news
      "firstpost", "cgtn", "al jazeera", "sky news", "bbc news", "bbc world",
      "cnn", "fox news", "msnbc", "france 24", "dw news", "euronews",
      "abc news", "nbc news", "cbs news", "pbs newshour", "wion", "trt world",
      "9 news", "associated press", "ap news", "reuters tv", "bloomberg quicktake",
      "al arabiya", "times now", "ndtv", "india today", "republic world",
      "news18", "channel 4 news", "itv news", "gb news", "the young turks",
      "aaj tak", "zee news", "ani news", "msnbc",
      // Religion
      "huda tv", "ali dawah", "alnaqwi", "al naqwi", "naqwi",
      "joel osteen", "joyce meyer", "td jakes", "joseph prince",
      "bible project", "merciful servant", "one islam", "ummah network",
      "arabicfluency", "arabic fluency", "learn arabic", "quran weekly",
      "nouman ali khan", "mufti menk", "omar suleiman",
      // Conspiracy / fringe
      "london real",
      // History / documentary / automotive
      "history channel", "national geographic", "discovery channel",
      "smithsonian channel", "top gear", "jay leno", "motortrend", "carwow",
      // Sports
      "espn", "bleacher report", "sky sports", "five reasons sports",
      "the ringer", "barstool sports",
      // Chess
      "gotham chess", "chess.com", "chessbase", "agadmator",
      // Entertainment
      "tmz", "entertainment tonight", "e! news",
    ];

    // Matched against title.toLowerCase() — substring check
    const HARD_BLOCKED_TITLE_WORDS = [
      // Politics
      "trump", "iran", "geopolit",
      // War / conflict
      "war in ", "war rages", "war update", "war with ", "war crime",
      "drone strike", "air strike", "missile strike", "military operation",
      "invasion of ", "frontline",
      // Religion
      "quran", "allah", "islamic", "supplications", "barakah",
      "sheikh", "dawah", "imam", "bible study", "sermon",
      "church service", "prayer meeting", "spiritual awakening",
      "guided reading", "al-fawaid", "ibn al-qayyim", "ibn taymiyyah",
      "surah", "hadith", "sunnah", "ramadan", "hijrah",
      // Generic tutorials (non-business)
      "wordpress tutorial", "hostinger", "setup your site",
      "web hosting tutorial", "cpanel", "domain setup",
      // Sports / celebrities
      "messi", "ronaldo", "chess tournament", "chess game", "chess opening",
      "playoffs", "match highlights", "game recap", "mic'd up",
      "offseason ep", "sports highlights",
      // UFO / conspiracy
      "ufo", "conspiracy", "flat earth", "david icke", "they lied about",
      // Breaking news
      "breaking news", "live news", "news update",
      // War / geopolitics slipping through
      "world war", "ww3", "ww2 explained", "is about to begin", "what's next for",
      "nuclear war", "global conflict",
      // Relationships
      "marriage", "relationship advice", "dating tips",
    ];

    const MIN_SERVER_SECS = 600; // 10 min — client modes apply their own gates
    const videos: FeedVideo[] = rawVideos
      .map((v) => ({
        ...v,
        duration: metaMap.get(v.videoId)?.duration ?? "",
        description: metaMap.get(v.videoId)?.description ?? "",
      }))
      .filter((v) => {
        if (!v.duration || isoSecs(v.duration) < MIN_SERVER_SECS) return false;
        const ch = v.channelTitle.toLowerCase();
        const ti = v.title.toLowerCase();
        if (HARD_BLOCKED_CHANNELS.some((p) => ch.includes(p))) return false;
        if (HARD_BLOCKED_TITLE_WORDS.some((p) => ti.includes(p))) return false;
        return true;
      });

    console.log(
      `[feed] metadata resolved: ${metaMap.size}/${rawVideos.length}` +
      ` | after_hard_block+40min: ${videos.length}`,
    );

    // Store in both cache tiers
    serverFeedCache.set(cacheKey, { ts: Date.now(), videos });
    setFeedCache(cacheKey, videos).catch((e) => console.warn("[feed] db-cache write failed (non-fatal):", e));

    return NextResponse.json({ videos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load feed";
    console.error("[youtube/feed]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
