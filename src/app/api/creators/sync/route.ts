import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { syncCreatorAuthority } from "@/lib/creatorAuthority";
import { getAllCreatorProfiles } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/creators/sync
// Rebuilds creator_profiles and creator_positions from the current research_index.
// Idempotent — safe to call repeatedly.

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await syncCreatorAuthority();
    console.log(`[creators/sync] ${result.creators} creators, ${result.positions} positions`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[creators/sync]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/creators/sync
// Returns current creator profiles ranked by authority score.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const profiles = await getAllCreatorProfiles();
    return NextResponse.json({ profiles });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
