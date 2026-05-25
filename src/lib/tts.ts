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

// Split a long script into chunks ≤ CHUNK_MAX chars at natural boundaries
function chunkScript(text: string): string[] {
  if (text.length <= CHUNK_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > CHUNK_MAX) {
    const slice = remaining.slice(0, CHUNK_MAX);
    // Prefer cutting at a blank line, then a sentence end, then hard limit
    const lastBlank = slice.lastIndexOf("\n\n");
    const lastNewline = slice.lastIndexOf("\n");
    const lastSentence = Math.max(
      slice.lastIndexOf(". "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("? "),
    );
    const cut =
      lastBlank > CHUNK_MAX * 0.5
        ? lastBlank
        : lastNewline > CHUNK_MAX * 0.55
          ? lastNewline
          : lastSentence > CHUNK_MAX * 0.45
            ? lastSentence + 1
            : CHUNK_MAX;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Build the full podcast script with NO budget cap.
 * All data points are included. Chunking in generateSpeechFile handles the 4096-char API limit.
 */
export function buildPodcastScript(
  analysis: VideoAnalysis & { title: string | null; channelName?: string | null }
): string {
  const title = analysis.title ?? "Untitled Video";
  const speakerName = analysis.speaker_name ?? analysis.channelName ?? "the speaker";
  const scoreLabel =
    analysis.clickbait_score <= 3 ? "Accurate" :
    analysis.clickbait_score <= 6 ? "Sensationalized" :
    "High Clickbait";

  const lines: string[] = [
    "WatchFilter Audio Briefing.", "",
    `${title}.`, "",
    `Clickbait rating: ${analysis.clickbait_score} out of 10. ${scoreLabel}.`,
    `Core subject: ${analysis.primary_subject}.`, "",
  ];

  // ── All data points — no truncation ──────────────────────────────
  if (analysis.hard_data_points.length > 0) {
    lines.push("Key Data Points.", "");

    for (let i = 0; i < analysis.hard_data_points.length; i++) {
      const point = analysis.hard_data_points[i];

      let pointTitle = "";
      let pointThesis: string | null = null;
      let pointStrategicIntent: string | null = null;
      let pointCausalChain: string | null = null;
      let pointDirectQuote: string | null = null;
      let pointContextExample: string | null = null;
      let pointCredibility: string | null = null;

      if (typeof point === "string") {
        pointTitle = point;
      } else if ("metric_title" in point) {
        const p = point as Record<string, unknown>;
        pointTitle = p.metric_title as string;
        pointThesis = "speaker_thesis" in p ? (p.speaker_thesis as string) : null;
        pointStrategicIntent = "strategic_intent" in p ? (p.strategic_intent as string) : null;
        pointCausalChain = "causal_chain" in p ? (p.causal_chain as string) : null;
        pointDirectQuote = "direct_quote" in p ? (p.direct_quote as string) : null;
        pointContextExample = "metric_context_example" in p ? (p.metric_context_example as string) : null;
        pointCredibility = "credibility_check" in p ? (p.credibility_check as string) : null;
      } else if ("metric_context" in point) {
        const p = point as Record<string, unknown>;
        pointTitle = `${p.metric_context as string}: ${p.metric_value as string}`;
      } else {
        pointTitle = (point as Record<string, unknown>).metric as string;
      }

      lines.push(`${i + 1}. ${pointTitle}.`);
      const quote = firstSentence(pointDirectQuote);
      if (quote) lines.push(`Direct quote: ${quote}`);
      const thesis = capAtWord(pointThesis ?? "", 380);
      if (thesis) lines.push(`${speakerName}: ${thesis}`);
      const intent = capAtWord(pointStrategicIntent ?? "", 340);
      if (intent) lines.push(`Strategic intent: ${intent}`);
      const chain = pointCausalChain ? pointCausalChain.trim() : "";
      if (chain) lines.push(`Causal chain: ${chain}`);
      const context = firstSentence(pointContextExample);
      if (context) lines.push(`Real-world illustration: ${context}`);
      const cred = credibilityLabel(pointCredibility);
      if (cred) lines.push(`Credibility: ${cred}.`);
      lines.push("");
    }
  }

  // ── Off-Script Golden Nuggets ─────────────────────────────────────
  // Placed before tactical playbook so it is never cut off in long scripts.
  const nuggets = analysis.off_script_nuggets ?? [];
  if (nuggets.length > 0) {
    lines.push("Off-Script Golden Nuggets. These are the unexpected moments most viewers miss.", "");
    nuggets.forEach((nugget, i) => {
      lines.push(`Nugget ${i + 1}: ${nugget}`);
      lines.push("");
    });
  }

  // ── Tactical Playbook ─────────────────────────────────────────────
  lines.push("Tactical Playbook.", "");
  analysis.actionable_takeaways.forEach((takeaway, i) => {
    const strategy = typeof takeaway === "string" ? takeaway : takeaway.strategy;
    const steps = typeof takeaway === "string" ? [] : (takeaway.execution_steps ?? []);
    lines.push(`Priority ${i + 1}: ${capAtWord(strategy, 220)}.`);
    steps.forEach((step, si) => lines.push(`Step ${si + 1}: ${capAtWord(step, 160)}`));
    lines.push("");
  });

  lines.push("End of WatchFilter briefing.");

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

  const buffer = Buffer.concat(audioBuffers);

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`audio/${filename}`, buffer, {
      access: "private",
      contentType: "audio/mpeg",
      token: blobToken,
    });
    // Wrap in our proxy route so clients can stream without a public blob store
    return `/api/audio?url=${encodeURIComponent(blob.url)}`;
  }

  const outputPath = join(process.cwd(), "public", "audio", filename);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buffer);
  return `/audio/${filename}`;
}
