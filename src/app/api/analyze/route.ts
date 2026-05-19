import { join } from "node:path";
import { NextResponse } from "next/server";
import { analyzeYouTubeVideo, TranscriptFetchError } from "@/lib/analyzeVideo";
import { saveAnalysis } from "@/lib/db";
import { buildPodcastScript, generateSpeechFile } from "@/lib/tts";
import type { TranscriptFetchOverrides } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 120;

function readStringField(body: object, key: string): string | undefined {
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildTranscriptOverrides(body: object): TranscriptFetchOverrides | undefined {
  const proxy = readStringField(body, "proxy");
  const transcriptApiUrl = readStringField(body, "transcriptApiUrl");
  if (!proxy && !transcriptApiUrl) return undefined;
  return { proxy, transcriptApiUrl };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const url = readStringField(body, "url");

  if (!url) {
    return NextResponse.json(
      { error: 'Missing required field "url" (YouTube video URL).' },
      { status: 400 },
    );
  }

  try {
    const result = await analyzeYouTubeVideo(url, {
      transcript: buildTranscriptOverrides(body),
    });

    // Generate a stable ID upfront so the audio filename matches the DB row.
    const analysisId = crypto.randomUUID();

    let audioPath: string | null = null;
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        const script = buildPodcastScript(result);
        const filename = `${analysisId}.mp3`;
        const outputPath = join(process.cwd(), "public", "audio", filename);
        await generateSpeechFile(script, outputPath, apiKey);
        audioPath = `/audio/${filename}`;
      } catch (ttsErr) {
        // TTS failure must not block the analysis response.
        console.error("TTS generation failed (non-fatal):", ttsErr);
      }
    }

    const saved = saveAnalysis(url, result, { id: analysisId, audioPath });
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof TranscriptFetchError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "TRANSCRIPT_UNAVAILABLE",
          attempts: error.attempts,
        },
        { status: 503 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to analyze video.";

    const status = message.includes("Could not parse")
      ? 400
      : message.includes("No transcript")
        ? 422
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
