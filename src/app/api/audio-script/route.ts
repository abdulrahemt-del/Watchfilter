import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getAnalysisById } from "@/lib/db";
import { buildPodcastScript } from "@/lib/tts";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const analysisId = searchParams.get("analysisId");

  if (!analysisId) {
    return NextResponse.json({ error: "analysisId required" }, { status: 400 });
  }

  const analysis = await getAnalysisById(analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }
  if (!analysis.worth_watching) {
    return NextResponse.json({ error: "Analysis incomplete" }, { status: 422 });
  }

  const script = buildPodcastScript(analysis as Parameters<typeof buildPodcastScript>[0]);
  return NextResponse.json({ script });
}
