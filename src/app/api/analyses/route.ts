import { NextResponse } from "next/server";
import { listAnalyses } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit") ?? 50) || 50),
  );

  try {
    const analyses = listAnalyses(limit);
    return NextResponse.json({ analyses });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
