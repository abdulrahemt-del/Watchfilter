import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listAnalyses } from "@/lib/db";
import { indexAnalysis } from "@/lib/research/indexer";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const analyses = await listAnalyses(500);
  let indexed = 0;
  let failed = 0;

  for (const a of analyses) {
    try {
      const result = await indexAnalysis(a.id);
      indexed += result.indexed;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ analyses: analyses.length, indexed, failed });
}
