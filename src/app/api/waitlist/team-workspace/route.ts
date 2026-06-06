import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { joinTeamWorkspaceWaitlist, getTeamWorkspaceWaitlistCount } from "@/lib/db";

const TEAM_SIZES = ["Just me", "2–5 people", "6–20 people", "21–50 people", "50+"];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const body = (await req.json()) as { email?: string; company?: string; teamSize?: string };

  const email = body.email?.trim().toLowerCase();
  const company = body.company?.trim() || null;
  const teamSize = body.teamSize?.trim();

  if (!email || !email.includes("@") || email.length > 320) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!teamSize || !TEAM_SIZES.includes(teamSize)) {
    return NextResponse.json({ error: "Team size required" }, { status: 400 });
  }

  const userId = session?.user?.email ?? null;
  const { alreadyJoined } = await joinTeamWorkspaceWaitlist(email, teamSize, company, userId);
  const count = await getTeamWorkspaceWaitlistCount();

  return NextResponse.json({ success: true, alreadyJoined, count });
}

export async function GET() {
  const count = await getTeamWorkspaceWaitlistCount();
  return NextResponse.json({ count });
}
