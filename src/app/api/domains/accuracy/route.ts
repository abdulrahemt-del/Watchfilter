import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getDomainAccuracyLeaderboard } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leaderboard = await getDomainAccuracyLeaderboard(30);
  return NextResponse.json({ leaderboard, count: leaderboard.length });
}
