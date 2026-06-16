import {
  fetchYouTubeTranscriptResilient,
  type TranscriptFetchOverrides,
} from "./transcript/fetchTranscript";
import { fetchWithOptionalProxy } from "./transcript/proxy";
import type { TranscriptSegment } from "./types";
import type { TranscriptFetchResult } from "./transcript/types";

export type { TranscriptFetchOverrides, TranscriptFetchResult };
export { TranscriptFetchError } from "./transcript/types";

const YOUTUBE_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=|youtube\.com\/watch\?.*&v=)([a-zA-Z0-9_-]{11})/,
  /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
];

export function extractYouTubeVideoId(url: string): string {
  const trimmed = url.trim();

  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  throw new Error(`Could not parse YouTube video ID from URL: ${url}`);
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export type YouTubeMetadata = {
  title: string | null;
  channelName: string | null;
  viewCount: number | null;
  uploadDate: string | null;
  durationSeconds: number | null;
};

const SCRAPE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadata> {
  // Metadata fetches always go direct — no proxy. ScraperAPI causes TLS errors
  // with undici and metadata endpoints are not transcript-blocked on home/datacenter IPs.
  const [oembed, page] = await Promise.allSettled([
    fetchOEmbed(videoId),
    fetchWatchPageData(videoId, null),
  ]);

  const oembedData =
    oembed.status === "fulfilled"
      ? oembed.value
      : { title: null, channelName: null };
  const pageData =
    page.status === "fulfilled"
      ? (page.value as typeof page.value & { durationSeconds?: number | null })
      : { title: null, channelName: null, viewCount: null, uploadDate: null, durationSeconds: null };

  return {
    title: oembedData.title ?? pageData.title,
    channelName: oembedData.channelName ?? pageData.channelName,
    viewCount: pageData.viewCount,
    uploadDate: pageData.uploadDate,
    durationSeconds: pageData.durationSeconds ?? null,
  };
}

// oEmbed never needs a proxy — it's a simple public JSON API.
async function fetchOEmbed(
  videoId: string,
): Promise<{ title: string | null; channelName: string | null }> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "WatchFilter/1.0" },
      signal: AbortSignal.timeout(10_000),
    } as RequestInit);
    if (!response.ok) return { title: null, channelName: null };
    const data = (await response.json()) as { title?: string; author_name?: string };
    return { title: data.title ?? null, channelName: data.author_name ?? null };
  } catch {
    return { title: null, channelName: null };
  }
}

// Watch page scrape: views, upload date, and title/channel as fallback.
async function fetchWatchPageData(
  videoId: string,
  proxy: string | null,
): Promise<{ title: string | null; channelName: string | null; viewCount: number | null; uploadDate: string | null; durationSeconds: number | null }> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const response = await fetchWithOptionalProxy(url, {
      proxy,
      headers: SCRAPE_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { title: null, channelName: null, viewCount: null, uploadDate: null, durationSeconds: null };

    const html = await response.text();

    const titleMatch =
      html.match(/<meta property="og:title" content="([^"]+)"/) ??
      html.match(/<meta name="title" content="([^"]+)"/) ??
      html.match(/"title":"((?:[^"\\]|\\.)+?)","lengthSeconds"/) ??
      html.match(/<title>([^<]+)<\/title>/);
    const rawTitle = titleMatch ? titleMatch[1] : null;
    const title = rawTitle
      ? rawTitle
          .replace(/ - YouTube$/, "")
          .replace(/\\u([\dA-F]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
          .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
          .slice(0, 500)
      : null;

    const channelMatch = html.match(/"ownerChannelName":"([^"]+)"/);
    const channelName = channelMatch ? channelMatch[1].slice(0, 200) : null;

    const viewMatch = html.match(/"viewCount":"(\d+)"/);
    const viewCount = viewMatch ? parseInt(viewMatch[1], 10) : null;

    const dateMatch =
      html.match(/<meta itemprop="uploadDate" content="([^"]+)"/) ??
      html.match(/<meta itemprop="datePublished" content="([^"]+)"/) ??
      html.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/) ??
      html.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/) ??
      html.match(/"publishDate":"([^"T]+)/) ??
      html.match(/"uploadDate":"([^"T]+)/);
    const uploadDate = dateMatch ? dateMatch[1].split("T")[0] : null;

    const durationMatch = html.match(/"lengthSeconds":"(\d+)"/);
    const durationSeconds = durationMatch ? parseInt(durationMatch[1], 10) : null;

    return { title, channelName, viewCount, uploadDate, durationSeconds };
  } catch {
    return { title: null, channelName: null, viewCount: null, uploadDate: null, durationSeconds: null };
  }
}

export async function fetchYouTubeTitle(videoId: string): Promise<string | null> {
  const { title } = await fetchYouTubeMetadata(videoId);
  return title;
}

/**
 * Fetches captions using configured strategies (external API → yt-dlp → library)
 * with optional proxy rotation. Safe for production datacenter deploys.
 */
export async function fetchYouTubeTranscript(
  videoId: string,
  overrides?: TranscriptFetchOverrides,
): Promise<TranscriptFetchResult> {
  return fetchYouTubeTranscriptResilient(videoId, overrides);
}

export function formatTranscriptForModel(segments: TranscriptSegment[]): string {
  return segments
    .filter((s) => s.text.length > 0)
    .map((s) => `[${formatTimestamp(s.offsetMs)}] ${s.text}`)
    .join("\n");
}
