import { normalizeSegments } from "../normalize";
import { fetchWithOptionalProxy } from "../proxy";
import type { TranscriptFetchConfig } from "../types";

function buildTranscriptApiUrl(base: string, videoId: string): string {
  if (base.includes("{videoId}")) {
    return base.replaceAll("{videoId}", videoId);
  }

  if (base.includes("{id}")) {
    return base.replaceAll("{id}", videoId);
  }

  try {
    const url = new URL(base);
    if (!url.searchParams.has("videoId") && !url.searchParams.has("id")) {
      url.searchParams.set("videoId", videoId);
    }
    return url.toString();
  } catch {
    const separator = base.endsWith("/") ? "" : "/";
    return `${base}${separator}${videoId}`;
  }
}

export async function fetchTranscriptViaExternalApi(
  videoId: string,
  config: TranscriptFetchConfig,
  proxy: string | null,
): Promise<ReturnType<typeof normalizeSegments>> {
  const baseUrl = config.transcriptApiUrl;
  if (!baseUrl) {
    throw new Error("TRANSCRIPT_API_URL is not configured.");
  }

  const url = buildTranscriptApiUrl(baseUrl, videoId);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "WatchFilter/1.0",
  };

  if (config.transcriptApiKey) {
    headers["x-api-key"] = config.transcriptApiKey;
  }

  const response = await fetchWithOptionalProxy(url, {
    proxy,
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Transcript API responded with ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const segmentsRaw =
    payload.segments ??
    payload.transcript ??
    payload.captions ??
    payload.content ??   // Supadata response shape
    payload.data;

  // Supadata (and similar APIs) send offset/duration in ms already.
  // normalizeSegments treats bare `offset`/`duration` as seconds and multiplies
  // by 1000, so remap to explicit `offsetMs`/`durationMs` to skip that step.
  const mapped = Array.isArray(segmentsRaw)
    ? (segmentsRaw as Record<string, unknown>[]).map((s) => ({
        text: s.text,
        offsetMs: (s.offsetMs as number | undefined) ?? (s.offset as number | undefined),
        durationMs: (s.durationMs as number | undefined) ?? (s.duration as number | undefined),
      }))
    : segmentsRaw;

  return normalizeSegments(mapped);
}
