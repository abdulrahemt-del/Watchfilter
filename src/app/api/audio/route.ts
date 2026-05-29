import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_BLOB_HOST = /^https:\/\/[a-z0-9]+\.(?:public\.)?blob\.vercel-storage\.com\//;

export async function GET(req: NextRequest) {
  const blobUrl = req.nextUrl.searchParams.get("url");
  if (!blobUrl) {
    return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
  }

  if (!ALLOWED_BLOB_HOST.test(blobUrl)) {
    return NextResponse.json({ error: "Invalid blob URL." }, { status: 400 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Blob not configured." }, { status: 503 });
  }

  try {
    const upstream = await fetch(blobUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      console.error("[audio] blob fetch failed:", upstream.status, blobUrl, body.slice(0, 200));
      return NextResponse.json({ error: `Blob ${upstream.status}` }, { status: upstream.status });
    }

    // Buffer fully — avoids streaming issues with chunked audio in Next.js App Router
    const buffer = await upstream.arrayBuffer();

    const headers = new Headers({
      "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    });

    return new NextResponse(buffer, { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[audio] error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
