import { NextResponse } from "next/server";

interface Check { name: string; ok: boolean; detail?: string }

export async function GET() {
  const checks: Check[] = [];

  // 1. DB connectivity
  try {
    const { createClient } = await import("@libsql/client");
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL ?? "file:./data/watchfilter.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    await client.execute("SELECT 1");
    checks.push({ name: "database", ok: true });
  } catch (e) {
    checks.push({ name: "database", ok: false, detail: String(e) });
  }

  // 2. OpenAI key present (we don't make a live call to avoid cost)
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  checks.push({ name: "openai_key", ok: hasOpenAI, detail: hasOpenAI ? undefined : "OPENAI_API_KEY missing" });

  // 3. Vercel Blob configured
  const hasBlob = !!(process.env.BLOB_READ_WRITE_TOKEN_STORE_ID ?? process.env.BLOB_READ_WRITE_TOKEN);
  checks.push({ name: "blob_store", ok: hasBlob, detail: hasBlob ? undefined : "No blob token or store ID" });

  // 4. Auth secrets present
  const hasAuth = !!(process.env.NEXTAUTH_SECRET && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  checks.push({ name: "auth_config", ok: hasAuth, detail: hasAuth ? undefined : "Missing NEXTAUTH_SECRET / GOOGLE credentials" });

  // 5. YouTube proxy (optional — warn but don't fail)
  const hasProxy = !!process.env.YOUTUBE_PROXY;
  checks.push({ name: "youtube_proxy", ok: true, detail: hasProxy ? "configured" : "not set (transcript fetches may be rate-limited)" });

  const allOk = checks.every(c => c.ok);
  return NextResponse.json({ status: allOk ? "ok" : "degraded", checks }, { status: allOk ? 200 : 500 });
}
