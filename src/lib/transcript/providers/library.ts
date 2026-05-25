import { YoutubeTranscript } from "youtube-transcript";
import { fetchWithOptionalProxy } from "../proxy";
import type { TranscriptSegment } from "../../types";
import type { TranscriptFetchConfig } from "../types";

// ---- Proxy-aware custom fetcher ------------------------------------------------
// Used when a scraping proxy (e.g. ScraperAPI, ZenRows) is configured.
// Manually scrapes the YouTube watch page and fetches the timedtext JSON API,
// routing both requests through the proxy to avoid datacenter IP blocks.

function extractCaptionTracks(
  html: string,
): Array<{ baseUrl: string; languageCode: string }> {
  const marker = '"captionTracks":';
  const idx = html.indexOf(marker);
  if (idx === -1) {
    throw new Error(
      "No captionTracks found. Captions may be disabled for this video.",
    );
  }

  // Walk forward past the marker to find the JSON array boundaries
  let depth = 0;
  let start = idx + marker.length;
  let i = start;
  while (i < html.length) {
    if (html[i] === "[") depth++;
    else if (html[i] === "]") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
    i++;
  }

  try {
    return JSON.parse(html.slice(start, i)) as Array<{
      baseUrl: string;
      languageCode: string;
    }>;
  } catch {
    throw new Error("Failed to parse captionTracks JSON from YouTube page.");
  }
}

async function fetchTranscriptWithProxy(
  videoId: string,
  proxy: string,
  langs: string[],
): Promise<TranscriptSegment[]> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const pageRes = await fetchWithOptionalProxy(watchUrl, {
    proxy,
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!pageRes.ok) {
    throw new Error(
      `YouTube page returned ${pageRes.status} ${pageRes.statusText}`,
    );
  }

  const html = await pageRes.text();
  const tracks = extractCaptionTracks(html);

  // Pick the best available language track
  const track =
    tracks.find((t) => langs.some((l) => t.languageCode === l)) ??
    tracks.find((t) => t.languageCode.startsWith("en")) ??
    tracks[0];

  if (!track) {
    throw new Error("No usable caption track found in YouTube response.");
  }

  const transcriptUrl = `${track.baseUrl}&fmt=json3`;
  const transcriptRes = await fetchWithOptionalProxy(transcriptUrl, {
    proxy,
    headers,
    signal: AbortSignal.timeout(20_000),
  });

  if (!transcriptRes.ok) {
    throw new Error(`Timedtext API returned ${transcriptRes.status}`);
  }

  type TimedtextEvent = {
    tStartMs?: number;
    dDurationMs?: number;
    segs?: Array<{ utf8?: string }>;
  };
  const data = (await transcriptRes.json()) as { events?: TimedtextEvent[] };

  const segments: TranscriptSegment[] = [];
  for (const event of data.events ?? []) {
    const text = (event.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    segments.push({
      text,
      offsetMs: event.tStartMs ?? 0,
      durationMs: event.dDurationMs ?? 2_000,
    });
  }

  if (!segments.length) {
    throw new Error("Transcript had zero usable segments after parsing.");
  }

  return segments;
}

// ---- Main export ---------------------------------------------------------------

/**
 * Fetches a YouTube transcript via the youtube-transcript library (direct),
 * or via a scraping proxy when one is configured in YOUTUBE_PROXY.
 */
export async function fetchTranscriptViaLibrary(
  videoId: string,
  config: TranscriptFetchConfig,
  proxy: string | null = null,
): Promise<TranscriptSegment[]> {
  if (proxy) {
    return fetchTranscriptWithProxy(videoId, proxy, config.preferredLanguages);
  }

  let raw: Awaited<ReturnType<typeof YoutubeTranscript.fetchTranscript>>;
  try {
    raw = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
  } catch {
    raw = await YoutubeTranscript.fetchTranscript(videoId);
  }

  if (!raw.length) {
    throw new Error(
      "No transcript available via direct fetch. Captions may be disabled or the IP may be blocked.",
    );
  }

  return raw.map((line) => ({
    text: line.text.trim(),
    offsetMs: Math.round(line.offset),
    durationMs: Math.round(line.duration),
  }));
}
