import type { TranscriptSegment } from "../types";

function parseVttTimestamp(value: string): number {
  const parts = value.trim().split(":");
  if (parts.length === 2) {
    const [mm, ss] = parts;
    return (Number(mm) * 60 + Number(ss.replace(",", "."))) * 1000;
  }
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    return (
      (Number(hh) * 3600 + Number(mm) * 60 + Number(ss.replace(",", "."))) *
      1000
    );
  }
  return 0;
}

function stripTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Parses WebVTT (including auto-generated YouTube captions from yt-dlp).
 */
export function parseVtt(vtt: string): TranscriptSegment[] {
  const lines = vtt.replace(/\r\n/g, "\n").split("\n");
  const segments: TranscriptSegment[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]?.trim() ?? "";

    if (line.includes("-->")) {
      const [startRaw, endRaw] = line.split("-->").map((s) => s.trim());
      const offsetMs = parseVttTimestamp(startRaw ?? "0");
      const endMs = parseVttTimestamp((endRaw ?? "").split(" ")[0] ?? "0");
      const durationMs = Math.max(0, endMs - offsetMs);

      i += 1;
      const textLines: string[] = [];
      while (i < lines.length) {
        const textLine = lines[i] ?? "";
        if (!textLine.trim()) break;
        if (textLine.includes("-->")) break;
        textLines.push(stripTags(textLine));
        i += 1;
      }

      const text = textLines.join(" ").replace(/\s+/g, " ").trim();
      if (text) {
        segments.push({ text, offsetMs, durationMs });
      }
      continue;
    }

    i += 1;
  }

  return mergeAdjacentSegments(segments);
}

function mergeAdjacentSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  if (segments.length === 0) return segments;

  const merged: TranscriptSegment[] = [{ ...segments[0]! }];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1]!;
    const curr = segments[i]!;

    if (prev.text === curr.text) {
      prev.durationMs = curr.offsetMs + curr.durationMs - prev.offsetMs;
      continue;
    }

    merged.push({ ...curr });
  }

  return merged;
}
