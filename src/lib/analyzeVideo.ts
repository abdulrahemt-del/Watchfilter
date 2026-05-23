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
  /** OpenAI model; defaults to gpt-4o-mini */
  model?: string;
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
  const analysis = await summarizeTranscript({
    apiKey,
    model: options.model ?? "gpt-4o-mini",
    title,
    timestampedTranscript,
    maxTranscriptChars: options.maxTranscriptChars,
  });

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

// ~90k tokens of transcript headroom — leaves ~38k tokens for system prompt, schema, and response.
const MAX_TRANSCRIPT_CHARS = 360_000;

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
}): Promise<VideoAnalysis> {
  const openai = new OpenAI({ apiKey: input.apiKey });

  const userContent = [
    input.title ? `Video title: ${input.title}` : "Video title: (unknown)",
    "",
    "Timestamped transcript:",
    fitTranscript(input.timestampedTranscript, input.maxTranscriptChars),
  ].join("\n");

  const completion = await openai.beta.chat.completions.parse({
    model: input.model,
    temperature: 0,
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
