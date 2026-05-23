import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getAnalysisById, updateAudioPath } from "@/lib/db";
import { buildPodcastScript, generateSpeechFile } from "@/lib/tts";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_VOICES = ["onyx", "nova", "echo", "fable", "shimmer", "alloy"] as const;

const inProgress = new Set<string>();
type Voice = (typeof VALID_VOICES)[number];

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { analysisId, voice } = body as Record<string, unknown>;

  if (typeof analysisId !== "string" || !analysisId) {
    return NextResponse.json({ error: "Missing analysisId" }, { status: 400 });
  }

  const safeVoice: Voice = VALID_VOICES.includes(voice as Voice) ? (voice as Voice) : "onyx";

  const analysis = await getAnalysisById(analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }
  if (!analysis.worth_watching) {
    return NextResponse.json({ error: "Analysis incomplete" }, { status: 422 });
  }

  if (inProgress.has(analysisId)) {
    return NextResponse.json({ error: "Audio generation already in progress for this analysis." }, { status: 409 });
  }

  inProgress.add(analysisId);
  try {
    const script = buildPodcastScript(analysis as Parameters<typeof buildPodcastScript>[0]);
    const filename = `${analysisId}-${safeVoice}.mp3`;
    const audioPath = await generateSpeechFile(script, filename, apiKey, safeVoice);
    await updateAudioPath(analysisId, audioPath);
    return NextResponse.json({ audioPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    inProgress.delete(analysisId);
  }
}
