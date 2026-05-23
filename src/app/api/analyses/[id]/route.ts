import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { deleteAnalysis, getAnalysisById } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const analysis = await getAnalysisById(id);
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    }
    return NextResponse.json(analysis);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load analysis.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const removed = await deleteAnalysis(id);
    if (!removed) {
      return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete analysis.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
