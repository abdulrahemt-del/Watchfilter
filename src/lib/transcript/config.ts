import type { TranscriptFetchConfig, TranscriptSource } from "./types";

const DEFAULT_STRATEGIES: TranscriptSource[] = [
  "external-api",
  "yt-dlp",
  "youtube-transcript",
];

const VALID_STRATEGIES = new Set<TranscriptSource>(DEFAULT_STRATEGIES);

function parseProxyList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseStrategies(raw: string | undefined): TranscriptSource[] {
  if (!raw?.trim()) return DEFAULT_STRATEGIES;

  const parsed = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is TranscriptSource => VALID_STRATEGIES.has(s as TranscriptSource));

  return parsed.length > 0 ? parsed : DEFAULT_STRATEGIES;
}

export function loadTranscriptConfigFromEnv(): TranscriptFetchConfig {
  const proxies = parseProxyList(
    process.env.YOUTUBE_PROXY_LIST ?? process.env.YOUTUBE_PROXY,
  );

  return {
    strategies: parseStrategies(process.env.TRANSCRIPT_STRATEGIES),
    proxies,
    transcriptApiUrl: process.env.TRANSCRIPT_API_URL?.trim() || null,
    transcriptApiKey: process.env.TRANSCRIPT_API_KEY?.trim() || null,
    ytDlpPath: process.env.YT_DLP_PATH?.trim() || "yt-dlp",
    ytDlpTimeoutMs: Number(process.env.YT_DLP_TIMEOUT_MS ?? 90_000),
    preferredLanguages: (process.env.TRANSCRIPT_LANGS ?? "en,en-US,en-GB")
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean),
  };
}

export function mergeTranscriptConfig(
  base: TranscriptFetchConfig,
  overrides?: {
    proxy?: string;
    proxies?: string[];
    transcriptApiUrl?: string;
    transcriptApiKey?: string;
    strategies?: TranscriptSource[];
  },
): TranscriptFetchConfig {
  if (!overrides) return base;

  const proxies = overrides.proxies?.length
    ? overrides.proxies
    : overrides.proxy
      ? [overrides.proxy, ...base.proxies]
      : base.proxies;

  return {
    ...base,
    proxies: [...new Set(proxies)],
    transcriptApiUrl: overrides.transcriptApiUrl ?? base.transcriptApiUrl,
    transcriptApiKey: overrides.transcriptApiKey ?? base.transcriptApiKey,
    strategies: overrides.strategies ?? base.strategies,
  };
}
