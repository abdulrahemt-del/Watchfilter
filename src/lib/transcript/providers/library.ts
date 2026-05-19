import { YoutubeTranscript } from "youtube-transcript";
import type { TranscriptSegment } from "../../types";
import type { TranscriptFetchConfig } from "../types";

/**
 * Direct YouTube caption scrape. Often blocked on datacenter IPs;
 * kept as last-resort fallback when yt-dlp / external API are unavailable.
 */
export async function fetchTranscriptViaLibrary(
  videoId: string,
  config: TranscriptFetchConfig,
): Promise<TranscriptSegment[]> {
  void config;

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
