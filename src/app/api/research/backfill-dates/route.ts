import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getAnalysesWithNullUploadDate, setAnalysisUploadDate } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tries to extract publishDate / uploadDate from YouTube watch page HTML.
// We try several JSON field names YouTube has used over the years.
async function scrapeUploadDate(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/<meta itemprop="uploadDate" content="([^"]+)"/) ??
      html.match(/<meta itemprop="datePublished" content="([^"]+)"/) ??
      html.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/) ??
      html.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/) ??
      html.match(/"publishDate":"([^"T]+)/) ??
      html.match(/"uploadDate":"([^"T]+)/);
    return m ? m[1].split("T")[0] : null;
  } catch {
    return null;
  }
}

// POST /api/research/backfill-dates
// Fetches upload_date for all analyses where it is NULL.
// Safe to call multiple times — only processes null rows.

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pending = await getAnalysesWithNullUploadDate();
  if (!pending.length) return NextResponse.json({ ok: true, updated: 0, message: "All dates already populated." });

  let updated = 0;
  let failed = 0;

  for (const { id, video_id } of pending) {
    const date = await scrapeUploadDate(video_id);
    if (date) {
      await setAnalysisUploadDate(id, date);
      updated++;
    } else {
      failed++;
    }
    // Gentle rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  return NextResponse.json({ ok: true, updated, failed, total: pending.length });
}

// GET — returns count of analyses missing upload_date
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pending = await getAnalysesWithNullUploadDate();
  return NextResponse.json({ missing: pending.length });
}
