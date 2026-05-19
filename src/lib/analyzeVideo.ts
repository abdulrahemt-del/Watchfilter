import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  extractYouTubeVideoId,
  fetchYouTubeTitle,
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

  const [title, transcriptResult] = await Promise.all([
    fetchYouTubeTitle(videoId),
    fetchYouTubeTranscript(videoId, options.transcript),
  ]);

  const timestampedTranscript = formatTranscriptForModel(
    transcriptResult.segments,
  );
  const analysis = await summarizeTranscript({
    apiKey,
    model: options.model ?? "gpt-4o-mini",
    title,
    timestampedTranscript,
  });

  return {
    ...analysis,
    videoId,
    title,
    transcriptCharCount: timestampedTranscript.length,
    transcriptSource: transcriptResult.source,
  };
}

async function summarizeTranscript(input: {
  apiKey: string;
  model: string;
  title: string | null;
  timestampedTranscript: string;
}): Promise<VideoAnalysis> {
  const openai = new OpenAI({ apiKey: input.apiKey });

  const userContent = [
    input.title ? `Video title: ${input.title}` : "Video title: (unknown)",
    "",
    "Timestamped transcript:",
    input.timestampedTranscript,
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
