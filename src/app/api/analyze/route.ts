import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { analyzeYouTubeVideo, TranscriptFetchError } from "@/lib/analyzeVideo";
import { saveAnalysis, getLatestAnalysisByVideoId } from "@/lib/db";
import { buildPodcastScript, generateSpeechFile } from "@/lib/tts";
import { extractYouTubeVideoId } from "@/lib/youtube";
import type { TranscriptFetchOverrides } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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

  // Return the cached analysis if this video was already analyzed — no OpenAI call.
  let videoId: string;
  try {
    videoId = extractYouTubeVideoId(url);
  } catch {
    return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
  }

  const existing = await getLatestAnalysisByVideoId(videoId);
  if (existing) {
    return NextResponse.json(existing);
  }

  try {
    const result = await analyzeYouTubeVideo(url, {
      transcript: buildTranscriptOverrides(body),
    });

    const analysisId = crypto.randomUUID();

    // Generate audio synchronously so audioPath is included in the response.
    let audioPath: string | null = null;
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      const rawVoice = readStringField(body, "voice") ?? "onyx";
      const voice = (["onyx", "nova", "echo", "fable", "shimmer", "alloy"].includes(rawVoice)
        ? rawVoice
        : "onyx") as "onyx" | "nova" | "echo" | "fable" | "shimmer" | "alloy";
      try {
        const script = buildPodcastScript({ ...result, title: result.title });
        audioPath = await generateSpeechFile(script, `${analysisId}.mp3`, apiKey, voice);
      } catch (ttsErr) {
        console.error("[TTS] Failed (non-fatal):", ttsErr);
      }
    }

    const saved = await saveAnalysis(url, result, { id: analysisId, audioPath });
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
