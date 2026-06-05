import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getAnalysesByIds } from "@/lib/db";
import { buildSynthesis } from "@/lib/synthesis";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const ids = (body as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || ids.length < 2) {
    return NextResponse.json({ error: "Provide 2–5 analysis IDs." }, { status: 400 });
  }

  const safeIds = (ids as unknown[])
    .filter((id): id is string => typeof id === "string")
    .slice(0, 5);

  if (safeIds.length < 2) {
    return NextResponse.json({ error: "At least 2 valid IDs required." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured." }, { status: 500 });

  const analyses = await getAnalysesByIds(safeIds);
  if (analyses.length < 2) {
    return NextResponse.json({ error: "Could not find enough analyses." }, { status: 404 });
  }

  try {
    const result = await buildSynthesis(analyses, apiKey);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Synthesis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
