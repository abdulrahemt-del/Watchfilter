import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { Resend } from "resend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, message } = body as Record<string, unknown>;

  if (typeof type !== "string" || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Missing type or message" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Fallback: log to console so feedback isn't lost even without Resend configured
    console.log("[Feedback]", { type, message, at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "WatchFilter Feedback <onboarding@resend.dev>",
      to: [process.env.FEEDBACK_EMAIL ?? "hello@watchfilter.app"],
      subject: `[WatchFilter] ${type}`,
      text: `Feedback type: ${type}\n\n${message.trim()}\n\nSent: ${new Date().toLocaleString()}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Feedback] Resend error:", err);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
