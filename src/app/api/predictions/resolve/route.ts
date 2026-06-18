import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolvePrediction, type ResolutionStatus } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "abdulrahemt@gmail.com";
const VALID_STATUS = new Set<ResolutionStatus>(["correct", "incorrect", "mixed"]);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { prediction_id?: string; status?: string; resolver_notes?: string | null; resolver_confidence?: number | null };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prediction_id, status, resolver_notes = null, resolver_confidence = null } = body;

  if (!prediction_id || !status || !VALID_STATUS.has(status as ResolutionStatus)) {
    return NextResponse.json(
      { error: "prediction_id and status (correct|incorrect|mixed) are required" },
      { status: 400 },
    );
  }

  try {
    await resolvePrediction(prediction_id, {
      status: status as ResolutionStatus,
      resolver_notes: resolver_notes ?? null,
      resolver_confidence: typeof resolver_confidence === "number" ? resolver_confidence : null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status_code = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status: status_code });
  }
}
