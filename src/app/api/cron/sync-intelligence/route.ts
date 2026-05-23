import { NextResponse } from "next/server";
import { executeIntelligenceUpdate } from "@/lib/intelligenceEngine";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const userId = process.env.ADMIN_USER_EMAIL;
  if (!userId) {
    return NextResponse.json({ error: "ADMIN_USER_EMAIL env var not set" }, { status: 500 });
  }

  try {
    await executeIntelligenceUpdate(userId);
    return NextResponse.json({ success: true, userId, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/sync-intelligence]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
