import OpenAI from "openai";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { VideoAnalysis } from "./types";

const CHUNK_MAX = 4000; // safe margin below the 4096 API hard limit per call

function capAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const trimmed = s.slice(0, max);
  const lastSpace = trimmed.lastIndexOf(" ");
  return lastSpace > max * 0.6 ? trimmed.slice(0, lastSpace) : trimmed;
}

function firstSentence(s: string | null, maxLen = 280): string {
  if (!s) return "";
  const first = (s.split(/(?<=[.!?])\s/)[0] ?? "").trim();
  return first.length <= maxLen ? first : capAtWord(first, maxLen);
}

// Extract just the verdict label from a credibility check sentence.
// "This is a verified fact in the investment community, supported by..." → "a verified fact in the investment community"
// "This appears to be a credible assertion." → "a credible assertion"
function credibilityLabel(s: string | null): string {
  if (!s) return "";
  // Match the noun phrase immediately after "is a/an" or "appears to be a/an"
  const m = s.match(/(?:is|appears to be|represents|constitutes)\s+(an?\s+[^.,;]{4,80})/i);
  if (m?.[1]) return m[1].trim().replace(/[.!?;,]+$/, "");
  // Fallback: last sentence of the string, capped short
  const sentences = s.split(/(?<=[.!?])\s+/);
  const last = (sentences[sentences.length - 1] ?? "").trim().replace(/[.!?]+$/, "");
  return last.length > 5 ? capAtWord(last, 100) : capAtWord(firstSentence(s), 100);
}

// Extract complete sentences up to maxChars. Falls back to capAtWord if no boundary found.
function takeCompleteSentences(s: string, maxChars: number): string {
  const sentences = s.match(/[^.!?]+[.!?]+/g)?.map(x => x.trim()).filter(Boolean) ?? [];
  if (sentences.length === 0) return capAtWord(s, maxChars);
  const result: string[] = [];
  let len = 0;
  for (const sentence of sentences) {
    const cost = len === 0 ? sentence.length : 1 + sentence.length;
    if (len + cost > maxChars) break;
    result.push(sentence);
    len += cost;
  }
  return result.length > 0 ? result.join(" ") : capAtWord(s, maxChars);
}

// Strip ID3v2 header from MP3 buffer so multi-chunk files can be cleanly concatenated.
function stripId3Header(buffer: Buffer): Buffer {
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString("ascii") === "ID3") {
    const size =
      ((buffer[6]! & 0x7f) << 21) |
      ((buffer[7]! & 0x7f) << 14) |
      ((buffer[8]! & 0x7f) << 7) |
       (buffer[9]! & 0x7f);
    return buffer.subarray(10 + size);
  }
  return buffer;
}

// Split a long script into chunks ≤ CHUNK_MAX chars, always cutting at sentence boundaries.
function chunkScript(text: string): string[] {
  if (text.length <= CHUNK_MAX) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= CHUNK_MAX) {
      current += " " + sentence;
    } else {
      chunks.push(current.trim());
      current = sentence;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/**
 * Synthesize one data point word-for-word, matching exactly what the MetricCard shows by default.
 * Order mirrors the card layout: Title → Signal badge → Direct Quote → Core Insight →
 *   Second-Order Implications → Contrarian View → Actionable Takeaway → Confidence.
 * why_it_matters is excluded — it lives in the hidden "Deep Analysis" drawer, not visible by default.
 */
function synthesizeDataPointParagraph(
  title: string,
  signalStrength: string | null,
  quote: string | null,
  speakerThesis: string | null,
  secondOrderImplications: string | null,
  contrarianView: string | null,
  actionableTakeaway: string | null,
): string {
  const parts: string[] = [];

  parts.push(title.replace(/\.$/, "") + ".");

  if (signalStrength) parts.push(`Signal: ${signalStrength}.`);

  if (quote) parts.push(`Direct quote: "${quote}"`);

  if (speakerThesis) parts.push(`Core insight: ${speakerThesis}`);

  if (secondOrderImplications) parts.push(`Second-order implications: ${secondOrderImplications}`);

  // contrarian_view values already start with "Alternative view:" per schema convention
  if (contrarianView) parts.push(contrarianView);

  if (actionableTakeaway) parts.push(`Takeaway: ${actionableTakeaway}`);

  return parts.filter(Boolean).join(" ");
}

/**
 * Build a compressed intelligence briefing script.
 * Structure: all data points ranked by signal strength (min 5), up to 5 nuggets.
 * Tactical Playbook is excluded — audio covers intelligence only, not execution steps.
 */
export function buildPodcastScript(
  analysis: VideoAnalysis & { title: string | null; channelName?: string | null }
): string {
  const title = analysis.title ?? "Untitled Video";
  const scoreLabel =
    analysis.clickbait_score <= 3 ? "Accurate" :
    analysis.clickbait_score <= 6 ? "Sensationalized" :
    "High Clickbait";

  const lines: string[] = [
    "WatchFilter briefing.", "",
    `${title}.`, "",
    `Clickbait rating: ${analysis.clickbait_score} out of 10 — ${scoreLabel}.`,
    `Subject: ${analysis.primary_subject}.`, "",
  ];

  if (analysis.worth_watching) {
    const ww = analysis.worth_watching;
    const worthIt = ww.score >= 6;
    lines.push(
      `${worthIt ? "Worth watching" : "Not recommended"}. Score: ${ww.score.toFixed(1)} out of 10.`,
      ww.verdict,
      ""
    );
  }

  // ── Top 3 data points by signal strength ──────────────────────────
  const SIGNAL_RANK: Record<string, number> = {
    "Very High": 4, "High": 3, "Medium": 2, "Low": 1,
  };

  const ranked = [...analysis.hard_data_points]
    .map(point => {
      const rank = typeof point === "string" ? 0
        : SIGNAL_RANK[((point as Record<string, unknown>).signal_strength as string) ?? ""] ?? 1;
      return { point, rank };
    })
    .sort((a, b) => b.rank - a.rank);

  for (const { point } of ranked) {
    if (typeof point === "string") { lines.push(point, ""); continue; }
    const p = point as Record<string, unknown>;
    const para = "metric_title" in p
      ? synthesizeDataPointParagraph(
          String(p.metric_title ?? ""),
          (p.signal_strength as string) ?? null,
          (p.direct_quote as string) ?? null,
          (p.speaker_thesis as string) ?? null,
          (p.second_order_implications as string) ?? null,
          (p.contrarian_view as string) ?? null,
          (p.actionable_takeaway as string) ?? null,
        )
      : "metric_context" in p
        ? `${(p.metric_context as string)}: ${(p.metric_value as string)}.`
        : String((p as Record<string, unknown>).metric ?? "");
    if (para) lines.push(para, "");
  }

  // ── Off-script golden nuggets — capped at 5 ──────────────────────
  const nuggets = (analysis.off_script_nuggets ?? []).slice(0, 5);
  if (nuggets.length > 0) {
    lines.push("Off-Script Golden Nuggets.", "");
    nuggets.forEach(n => { lines.push(n); lines.push(""); });
  }

  lines.push("", "End of WatchFilter briefing.");

  return lines.join("\n");
}

/**
 * Generates a single MP3 from the full script.
 * Scripts longer than 4000 chars are split into chunks; each chunk is sent to the TTS API
 * in parallel and the resulting MP3 buffers are concatenated into one file.
 */
export async function generateSpeechFile(
  script: string,
  filename: string,
  apiKey: string,
  voice: "onyx" | "nova" | "echo" | "fable" | "shimmer" | "alloy" = "onyx"
): Promise<string> {
  const openai = new OpenAI({ apiKey });
  const chunks = chunkScript(script);

  // Parallel TTS calls — OpenAI TTS rate limits are generous (500 RPM on tier 1)
  const audioBuffers = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await openai.audio.speech.create({
        model: "tts-1",
        voice,
        input: chunk,
        response_format: "mp3",
      });
      return Buffer.from(await response.arrayBuffer());
    })
  );

  // Strip ID3 headers from all chunks after the first — raw concatenation of full MP3 files
  // embeds metadata frames mid-stream, causing pops and choppiness during playback.
  const buffer = Buffer.concat(audioBuffers.map((buf, i) => i === 0 ? buf : stripId3Header(buf)));

  const storeId = process.env.BLOB_READ_WRITE_TOKEN_STORE_ID;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (storeId || blobToken) {
    const { put } = await import("@vercel/blob");
    // In production: use OIDC via storeId (new public store, no static token needed).
    // In local dev: fall back to static token.
    const blob = await put(`audio/${filename}`, buffer, {
      access: "public",
      contentType: "audio/mpeg",
      addRandomSuffix: false,
      ...(storeId ? { storeId } : { token: blobToken! }),
    });
    return blob.url;
  }

  const outputPath = join(process.cwd(), "public", "audio", filename);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buffer);
  return `/audio/${filename}`;
}
