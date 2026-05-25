import {
  loadTranscriptConfigFromEnv,
  mergeTranscriptConfig,
} from "./config";
import { fetchTranscriptViaExternalApi } from "./providers/externalApi";
import { fetchTranscriptViaLibrary } from "./providers/library";
import { fetchTranscriptViaYtDlp } from "./providers/ytdlp";
import { proxyAttempts } from "./proxy";
import type {
  TranscriptAttempt,
  TranscriptFetchConfig,
  TranscriptFetchOverrides,
  TranscriptFetchResult,
  TranscriptSource,
} from "./types";

export type { TranscriptFetchOverrides };
import { TranscriptFetchError } from "./types";

async function runStrategy(
  strategy: TranscriptSource,
  videoId: string,
  config: TranscriptFetchConfig,
  proxy: string | null,
): Promise<TranscriptFetchResult> {
  switch (strategy) {
    case "external-api": {
      // external-api is a bypass service (e.g. Supadata); it doesn't need a proxy
      const segments = await fetchTranscriptViaExternalApi(
        videoId,
        config,
        null,
      );
      return { segments, source: strategy, proxyUsed: null };
    }
    case "yt-dlp": {
      const segments = await fetchTranscriptViaYtDlp(videoId, config, proxy);
      return { segments, source: strategy, proxyUsed: proxy };
    }
    case "youtube-transcript": {
      const segments = await fetchTranscriptViaLibrary(videoId, config, proxy);
      return { segments, source: strategy, proxyUsed: proxy };
    }
    default:
      throw new Error(`Unknown transcript strategy: ${strategy}`);
  }
}

function shouldSkipStrategy(
  strategy: TranscriptSource,
  config: TranscriptFetchConfig,
): string | null {
  if (strategy === "external-api" && !config.transcriptApiUrl) {
    return "TRANSCRIPT_API_URL not set";
  }
  return null;
}

function strategiesForConfig(config: TranscriptFetchConfig): TranscriptSource[] {
  const configured = config.strategies.filter((strategy) => {
    if (strategy === "external-api" && !config.transcriptApiUrl) return false;
    return true;
  });

  if (configured.length > 0) return configured;
  return ["yt-dlp", "youtube-transcript"];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Resilient transcript fetch with strategy fallbacks and optional proxy rotation.
 * Never throws raw network errors without context — surfaces TranscriptFetchError
 * with per-attempt details for production logging.
 */
export async function fetchYouTubeTranscriptResilient(
  videoId: string,
  overrides?: TranscriptFetchOverrides,
): Promise<TranscriptFetchResult> {
  const config = mergeTranscriptConfig(
    loadTranscriptConfigFromEnv(),
    overrides,
  );

  const strategies = strategiesForConfig(config);
  const attempts: TranscriptAttempt[] = [];

  for (const strategy of strategies) {
    const skipReason = shouldSkipStrategy(strategy, config);
    if (skipReason) continue;

    const proxiesToTry = [...proxyAttempts(config.proxies)];

    for (const proxy of proxiesToTry) {
      try {
        return await runStrategy(strategy, videoId, config, proxy);
      } catch (error) {
        attempts.push({
          strategy,
          proxy,
          error: errorMessage(error),
        });
      }
    }
  }

  throw new TranscriptFetchError(
    "Could not fetch a YouTube transcript. Configure TRANSCRIPT_API_URL and/or YOUTUBE_PROXY for production, or install yt-dlp on the server.",
    attempts,
  );
}
