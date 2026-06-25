import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  extractYouTubeVideoId,
  fetchYouTubeMetadata,
  fetchYouTubeTranscript,
  formatTranscriptForModel,
  type TranscriptFetchOverrides,
} from "./youtube";
import { TranscriptFetchError } from "./transcript/types";
import { WATCHFILTER_SYSTEM_PROMPT } from "./prompts";
import {
  videoAnalysisSchema,
  type AnalyzeVideoResult,
  type VideoAnalysis,
} from "./types";

export type AnalyzeVideoOptions = {
  /** Override OPENAI_API_KEY from the environment */
  openaiApiKey?: string;
  /** OpenAI model; only gpt-4o-mini is accepted */
  model?: "gpt-4o-mini";
  /** Proxy / external API overrides for transcript fetch */
  transcript?: TranscriptFetchOverrides;
  /** Cap transcript length before sending to the model; defaults to MAX_TRANSCRIPT_CHARS */
  maxTranscriptChars?: number;
};

export { TranscriptFetchError };

/**
 * Fetches a YouTube video's captions, then uses GPT-4o-mini to produce a structured,
 * fluff-stripped analysis (clickbait score, facts, takeaways, timestamps).
 */
export async function analyzeYouTubeVideo(
  youtubeUrl: string,
  options: AnalyzeVideoOptions = {},
): Promise<AnalyzeVideoResult> {
  const videoId = extractYouTubeVideoId(youtubeUrl);
  const apiKey = options.openaiApiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local or pass openaiApiKey.",
    );
  }

  const [metadata, transcriptResult] = await Promise.all([
    fetchYouTubeMetadata(videoId),
    fetchYouTubeTranscript(videoId, options.transcript),
  ]);

  const { title, channelName, viewCount, uploadDate, durationSeconds } = metadata;
  const timestampedTranscript = formatTranscriptForModel(
    transcriptResult.segments,
  );
  const transcriptInput = {
    apiKey,
    model: options.model ?? "gpt-4o-mini",
    title,
    timestampedTranscript,
    maxTranscriptChars: options.maxTranscriptChars,
  };

  let analysis = await summarizeTranscript(transcriptInput);

  // Safety net — schema enforces min(5) but retry if model falls short anyway.
  // Round 1: add strictly unique points from retry.
  // Round 2: if still short, add ANY retry points not already present (looser key).
  if (analysis.hard_data_points.length < 5) {
    const retry = await summarizeTranscript({ ...transcriptInput, temperature: 0.4 });
    const seen50 = new Set(analysis.hard_data_points.map(p => p.metric_title.toLowerCase().slice(0, 50)));
    const fresh = retry.hard_data_points.filter(p => !seen50.has(p.metric_title.toLowerCase().slice(0, 50)));
    analysis = { ...analysis, hard_data_points: [...analysis.hard_data_points, ...fresh] };

    // Still short — add looser matches (first 20 chars) until we hit 5.
    if (analysis.hard_data_points.length < 5) {
      const seen20 = new Set(analysis.hard_data_points.map(p => p.metric_title.toLowerCase().slice(0, 20)));
      const extra = retry.hard_data_points.filter(p => !seen20.has(p.metric_title.toLowerCase().slice(0, 20)));
      analysis = { ...analysis, hard_data_points: [...analysis.hard_data_points, ...extra] };
    }
  }

  return {
    ...analysis,
    videoId,
    title,
    channelName,
    viewCount,
    uploadDate,
    durationSeconds: durationSeconds ?? null,
    transcriptCharCount: Math.min(timestampedTranscript.length, MAX_TRANSCRIPT_CHARS),
    transcriptSource: transcriptResult.source,
  };
}

// ~60k tokens of transcript headroom — leaves ~56k tokens for system prompt, schema, and response.
// Timestamped transcripts tokenize at ~3 chars/token (worse than plain prose), so 180k chars ≈ 60k tokens.
const MAX_TRANSCRIPT_CHARS = 180_000;

function fitTranscript(transcript: string, maxChars = MAX_TRANSCRIPT_CHARS): string {
  if (transcript.length <= maxChars) return transcript;
  const boundary = transcript.lastIndexOf("\n", maxChars);
  const sliceAt = boundary > 0 ? boundary : maxChars;
  return (
    transcript.slice(0, sliceAt) +
    "\n[... transcript truncated — video continues beyond this point ...]"
  );
}

async function summarizeTranscript(input: {
  apiKey: string;
  model: string;
  title: string | null;
  timestampedTranscript: string;
  maxTranscriptChars?: number;
  temperature?: number;
}): Promise<VideoAnalysis> {
  const openai = new OpenAI({ apiKey: input.apiKey });

  const userContent = [
    input.title ? `Video title: ${JSON.stringify(input.title)}` : "Video title: (unknown)",
    "",
    "Timestamped transcript:",
    fitTranscript(input.timestampedTranscript, input.maxTranscriptChars),
  ].join("\n");

  const completion = await openai.beta.chat.completions.parse({
    model: input.model,
    temperature: input.temperature ?? 0,
    max_tokens: 12000,
    messages: [
      { role: "system", content: WATCHFILTER_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(videoAnalysisSchema, "watchfilter_analysis"),
  });

  const parsed = completion.choices[0]?.message?.parsed;

  if (!parsed) {
    const refusal = completion.choices[0]?.message?.refusal;
    throw new Error(
      refusal ?? "OpenAI returned no parsed analysis for this transcript.",
    );
  }

  return parsed;
}
