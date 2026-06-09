import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { createClient } from "@libsql/client";

const ADMIN_EMAIL = "abdulrahemt@gmail.com";

function db() {
  return createClient({
    url:       process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const c = db();
  const [waitlist, team, beta] = await Promise.all([
    c.execute(`SELECT email, created_at FROM waitlist ORDER BY created_at DESC`),
    c.execute(`SELECT email, company, team_size, created_at FROM team_workspace_waitlist ORDER BY created_at DESC`),
    c.execute(`SELECT event, COUNT(*) as n FROM beta_events GROUP BY event`),
  ]);

  return NextResponse.json({
    waitlist: {
      total: waitlist.rows.length,
      emails: waitlist.rows.map(r => ({ email: r.email, joined: r.created_at })),
    },
    team_waitlist: {
      total: team.rows.length,
      entries: team.rows.map(r => ({ email: r.email, company: r.company, team_size: r.team_size, joined: r.created_at })),
    },
    beta_events: Object.fromEntries(beta.rows.map(r => [r.event, Number(r.n)])),
  });
}
