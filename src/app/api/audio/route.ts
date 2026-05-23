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
      console.error("[audio] blob fetch failed:", upstream.status, blobUrl);
      return NextResponse.json({ error: `Blob ${upstream.status}` }, { status: upstream.status });
    }

    const headers = new Headers({
      "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    });
    const cl = upstream.headers.get("Content-Length");
    if (cl) headers.set("Content-Length", cl);

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[audio] error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
