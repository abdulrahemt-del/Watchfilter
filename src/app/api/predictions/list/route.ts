import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listPredictions, getCreatorPredictionStats } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [predictions, stats] = await Promise.all([
    listPredictions(200),
    getCreatorPredictionStats(),
  ]);

  return NextResponse.json({ predictions, stats });
}
