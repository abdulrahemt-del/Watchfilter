import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listPredictionsFiltered } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const predictions = await listPredictionsFiltered({ status: "unresolved", limit: 200 });
  return NextResponse.json({ predictions, count: predictions.length });
}
