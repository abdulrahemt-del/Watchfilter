import {
  fetchYouTubeTranscriptResilient,
  type TranscriptFetchOverrides,
} from "./transcript/fetchTranscript";
import { loadTranscriptConfigFromEnv } from "./transcript/config";
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

export async function fetchYouTubeTitle(videoId: string): Promise<string | null> {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const proxy = loadTranscriptConfigFromEnv().proxies[0] ?? null;

  try {
    const response = await fetchWithOptionalProxy(oembedUrl, {
      proxy,
      headers: { "User-Agent": "WatchFilter/1.0" },
      next: { revalidate: 3600 },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
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
