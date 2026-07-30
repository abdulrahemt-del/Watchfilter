import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../[...nextauth]/options";
import { getRefreshToken, deleteRefreshToken, deleteFeedCache } from "@/lib/db";

export const runtime = "nodejs";

// Revokes WatchFilter's Google OAuth grant and deletes all data tied to it
// (Developer Policy III.D.2c.i / III.A.2h — an explicit, working revoke path).
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email;
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const refreshToken = await getRefreshToken(userId);
  if (refreshToken) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
      });
    } catch (err) {
      console.error("[auth/disconnect] failed to revoke token with Google:", err);
    }
  }

  await deleteRefreshToken(userId);
  await deleteFeedCache(userId);

  return NextResponse.json({ ok: true });
}
