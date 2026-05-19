import OpenAI from "openai";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { VideoAnalysis } from "./types";

const TTS_CHAR_LIMIT = 4096;

export function buildPodcastScript(
  analysis: VideoAnalysis & { title: string | null }
): string {
  const title = analysis.title ?? "Untitled Video";
  const scoreLabel =
    analysis.clickbait_score <= 3 ? "Accurate" :
    analysis.clickbait_score <= 6 ? "Sensationalized" :
    "High Clickbait";

  const lines: string[] = [];

  lines.push("WatchFilter Audio Briefing.", "");
  lines.push(`${title}.`, "");
  lines.push(`Clickbait rating: ${analysis.clickbait_score} out of 10. ${scoreLabel}.`);
  lines.push(`Core subject: ${analysis.primary_subject}.`, "");

  if (analysis.hard_data_points.length > 0) {
    lines.push("Key Data Points.", "");
    analysis.hard_data_points.forEach((point, i) => {
      let title: string, causalChain: string | null, quote: string | null, credibility: string | null;
      if (typeof point === "string") {
        title = point; causalChain = null; quote = null; credibility = null;
      } else if ("causal_chain" in point) {
        title = point.metric_title; causalChain = point.causal_chain; quote = point.direct_quote; credibility = point.credibility_check;
      } else if ("speaker_thesis" in point) {
        title = point.metric_title; causalChain = point.speaker_thesis; quote = point.direct_quote; credibility = null;
      } else if ("metric_context" in point) {
        title = `${point.metric_context}: ${point.metric_value}`; causalChain = point.root_cause; quote = null; credibility = null;
      } else {
        title = point.metric; causalChain = point.root_cause; quote = null; credibility = null;
      }
      lines.push(`${i + 1}. ${title}.`);
      if (causalChain) lines.push(`Causal chain: ${causalChain}`);
      if (quote) lines.push(`Quote: "${quote}"`);
      if (credibility) lines.push(`Credibility: ${credibility}`);
      lines.push("");
    });
  }

  lines.push("Tactical Playbook.", "");
  analysis.actionable_takeaways.forEach((takeaway, i) => {
    const strategy = typeof takeaway === "string" ? takeaway : takeaway.strategy;
    const steps =
      typeof takeaway === "string" ? [] : (takeaway.execution_steps ?? []);
    lines.push(`Priority ${i + 1}: ${strategy}.`);
    steps.forEach((step, si) => lines.push(`Step ${si + 1}: ${step}`));
    lines.push("");
  });

  lines.push("End of WatchFilter briefing.");

  const script = lines.join("\n");
  // OpenAI TTS hard limit is 4096 chars
  return script.length > TTS_CHAR_LIMIT
    ? script.slice(0, TTS_CHAR_LIMIT - 3) + "..."
    : script;
}

/**
 * Generates an MP3 from the script and returns a public URL.
 * - On Vercel (BLOB_READ_WRITE_TOKEN set): uploads to Vercel Blob, returns blob URL.
 * - Locally (no token): writes to public/audio/, returns /audio/{filename}.
 */
export async function generateSpeechFile(
  script: string,
  filename: string,
  apiKey: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "onyx",
    input: script,
    response_format: "mp3",
  });

  const buffer = Buffer.from(await response.arrayBuffer());

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`audio/${filename}`, buffer, {
      access: "public",
      contentType: "audio/mpeg",
      token: blobToken,
    });
    return blob.url;
  }

  // Local fallback: write to public/audio/
  const outputPath = join(process.cwd(), "public", "audio", filename);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buffer);
  return `/audio/${filename}`;
}
