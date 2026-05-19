import type { TranscriptSegment } from "../types";

export type TranscriptSource = "external-api" | "yt-dlp" | "youtube-transcript";

export type TranscriptFetchResult = {
  segments: TranscriptSegment[];
  source: TranscriptSource;
  proxyUsed: string | null;
};

export type TranscriptAttempt = {
  strategy: TranscriptSource;
  proxy: string | null;
  error: string;
};

export class TranscriptFetchError extends Error {
  readonly attempts: TranscriptAttempt[];

  constructor(message: string, attempts: TranscriptAttempt[]) {
    super(message);
    this.name = "TranscriptFetchError";
    this.attempts = attempts;
  }
}

export type TranscriptFetchConfig = {
  /** Ordered strategy names, e.g. ["external-api", "yt-dlp", "youtube-transcript"] */
  strategies: TranscriptSource[];
  proxies: string[];
  transcriptApiUrl: string | null;
  transcriptApiKey: string | null;
  ytDlpPath: string;
  ytDlpTimeoutMs: number;
  preferredLanguages: string[];
};

export type TranscriptFetchOverrides = {
  proxy?: string;
  proxies?: string[];
  transcriptApiUrl?: string;
  transcriptApiKey?: string;
  strategies?: TranscriptSource[];
};
