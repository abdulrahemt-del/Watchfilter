import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getUserPipelineCache, upsertUserPipelineCache, deleteUserPipelineCache } from "@/lib/db";

export const runtime = "nodejs";

const TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const cached = await getUserPipelineCache(session.user.email);
    if (!cached || Date.now() - cached.cachedAt > TTL_MS) {
      return NextResponse.json({ cached: false });
    }
    return NextResponse.json({ cached: true, aiScores: cached.aiScores, consensusData: cached.consensusData, cachedAt: cached.cachedAt });
  } catch {
    return NextResponse.json({ cached: false });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    await deleteUserPipelineCache(session.user.email);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to clear cache." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { aiScores, consensusData } = body as Record<string, unknown>;
  if (!aiScores || typeof aiScores !== "object") {
    return NextResponse.json({ error: "Missing aiScores." }, { status: 400 });
  }

  try {
    await upsertUserPipelineCache(session.user.email, aiScores as Record<string, unknown>, consensusData ?? null);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save cache." }, { status: 500 });
  }
}
