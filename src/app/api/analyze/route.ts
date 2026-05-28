import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { analyzeYouTubeVideo, TranscriptFetchError } from "@/lib/analyzeVideo";
import { saveAnalysis, getLatestAnalysisByVideoId } from "@/lib/db";
import { extractYouTubeVideoId } from "@/lib/youtube";
import type { TranscriptFetchOverrides } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 300;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

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

  const ip =
    (request as unknown as { headers: Headers }).headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    (session.user?.email ?? "unknown");
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before analyzing another video." },
      { status: 429 },
    );
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

    // Save immediately — no audio yet — so the client gets the analysis fast.
    // Audio is generated after backfill (EnhanceButton) so nuggets are always included.
    const saved = await saveAnalysis(url, result, { id: analysisId });

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
