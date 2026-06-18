import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listPredictionsFiltered } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status   = url.searchParams.get("status")   ?? undefined;
  const creator  = url.searchParams.get("creator")  ?? undefined;
  const domain   = url.searchParams.get("domain")   ?? undefined;
  const priority = url.searchParams.get("priority") ?? undefined;
  const limit    = Number(url.searchParams.get("limit") ?? 200);

  const predictions = await listPredictionsFiltered({ status, creator, domain, priority, limit });
  return NextResponse.json({ predictions, count: predictions.length });
}
