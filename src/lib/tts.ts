import OpenAI from "openai";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
      let title: string, thesis: string | null, quote: string | null;
      if (typeof point === "string") {
        title = point; thesis = null; quote = null;
      } else if ("metric_title" in point) {
        title = point.metric_title; thesis = point.speaker_thesis; quote = point.direct_quote;
      } else if ("metric_context" in point) {
        title = `${point.metric_context}: ${point.metric_value}`; thesis = point.root_cause; quote = null;
      } else {
        title = point.metric; thesis = point.root_cause; quote = null;
      }
      lines.push(`${i + 1}. ${title}.`);
      if (thesis) lines.push(`Analysis: ${thesis}`);
      if (quote) lines.push(`Quote: "${quote}"`);
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

export async function generateSpeechFile(
  script: string,
  outputPath: string,
  apiKey: string
): Promise<void> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "onyx",
    input: script,
    response_format: "mp3",
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buffer);
}
