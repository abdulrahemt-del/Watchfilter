import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { indexAnalysis } from "@/lib/research/indexer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { analysisId } = await req.json() as { analysisId?: string };
  if (!analysisId) return NextResponse.json({ error: "analysisId required" }, { status: 400 });

  try {
    const result = await indexAnalysis(analysisId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Index failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
