import { NextResponse } from "next/server";
import { saveWaitlistEmail } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email || !email.includes("@") || email.length > 320) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    await saveWaitlistEmail(email.toLowerCase().trim());
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[waitlist]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
