import { NextResponse } from "next/server";
import { after } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getIntelligenceSnapshot } from "@/lib/db";
import { runIntelligencePipeline } from "@/lib/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 401 });
  }

  const userId      = session.user.email;
  const accessToken = session.accessToken as string;

  try {
    const cached = await getIntelligenceSnapshot(userId);
    const isFresh = cached && Date.now() - cached.computedAt.getTime() < TTL_MS;

    if (isFresh) {
      return NextResponse.json({
        meta:              cached.metaData,
        intelligenceBrief: cached.brief,
        opportunityAlerts: cached.alerts,
        consensusShifts:   cached.shifts,
        shareOfVoice:      cached.voiceShare,
        isCached:          true,
        computedAt:        cached.computedAt.toISOString(),
      });
    }

    // Trigger background recompute — returns immediately
    after(async () => {
      await runIntelligencePipeline(userId, accessToken);
    });

    // Return stale data while recomputing so the UI never blocks
    if (cached) {
      return NextResponse.json({
        meta:              cached.metaData,
        intelligenceBrief: cached.brief,
        opportunityAlerts: cached.alerts,
        consensusShifts:   cached.shifts,
        shareOfVoice:      cached.voiceShare,
        isCached:          true,
        stale:             true,
        computedAt:        cached.computedAt.toISOString(),
      });
    }

    // First-ever request — nothing cached yet
    return NextResponse.json(
      { status: "processing", message: "Your intelligence terminal is compiling. Check back in 2 minutes." },
      { status: 202 },
    );
  } catch (error) {
    console.error("[intelligence/snapshot]", error);
    return NextResponse.json({ error: "Failed to fetch intelligence snapshot." }, { status: 500 });
  }
}
