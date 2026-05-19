import type { TranscriptSegment } from "../types";

type RawSegment = {
  text?: string;
  offset?: number;
  duration?: number;
  offsetMs?: number;
  durationMs?: number;
  start?: number;
  startMs?: number;
};

/**
 * Accepts common external-API / library shapes (seconds or ms).
 */
export function normalizeSegments(raw: unknown): TranscriptSegment[] {
  if (!Array.isArray(raw)) {
    throw new Error("Transcript payload must include a segments array.");
  }

  const segments: TranscriptSegment[] = [];

  for (const item of raw as RawSegment[]) {
    const text = item.text?.trim();
    if (!text) continue;

    let offsetMs: number;
    if (typeof item.offsetMs === "number") offsetMs = item.offsetMs;
    else if (typeof item.startMs === "number") offsetMs = item.startMs;
    else if (typeof item.offset === "number") offsetMs = Math.round(item.offset * 1000);
    else if (typeof item.start === "number") offsetMs = Math.round(item.start * 1000);
    else offsetMs = 0;

    let durationMs: number;
    if (typeof item.durationMs === "number") durationMs = item.durationMs;
    else if (typeof item.duration === "number")
      durationMs = Math.round(item.duration * 1000);
    else durationMs = 2000;

    segments.push({ text, offsetMs, durationMs });
  }

  if (segments.length === 0) {
    throw new Error("Transcript payload contained no usable segments.");
  }

  return segments;
}
