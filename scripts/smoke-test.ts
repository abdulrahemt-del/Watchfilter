/**
 * WatchFilter smoke test — runs against a live deployment.
 * Usage:  BASE_URL=https://watchfilter.vercel.app npx tsx scripts/smoke-test.ts
 * Or for local dev: npx tsx scripts/smoke-test.ts  (defaults to localhost:3000)
 */
export {};

const BASE = process.env.BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

interface Result { name: string; ok: boolean; detail: string }
const results: Result[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true, detail: "✓" });
  } catch (e) {
    results.push({ name, ok: false, detail: String(e) });
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

await check("health endpoint", async () => {
  const res = await fetch(`${BASE}/api/health`);
  const body = await res.json() as { status: string; checks: { name: string; ok: boolean; detail?: string }[] };
  if (!res.ok) throw new Error(`Status ${res.status} — ${JSON.stringify(body)}`);
  const failed = body.checks.filter(c => !c.ok);
  if (failed.length) throw new Error(`Failed checks: ${failed.map(c => `${c.name}: ${c.detail}`).join(", ")}`);
});

await check("landing page loads", async () => {
  const res = await fetch(`${BASE}/landing`);
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const html = await res.text();
  if (!html.includes("WatchFilter")) throw new Error("Page content missing expected text");
});

await check("home page loads (redirects to sign-in when unauth)", async () => {
  // Without a session, the app should load (may redirect, but not 500)
  const res = await fetch(`${BASE}/`, { redirect: "manual" });
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
});

await check("auth endpoint reachable", async () => {
  const res = await fetch(`${BASE}/api/auth/providers`);
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  if (!body.google) throw new Error("Google provider not configured in NextAuth");
});

await check("unauthenticated analysis API returns 401", async () => {
  const res = await fetch(`${BASE}/api/analyses/test-id-that-does-not-exist`);
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

await check("unauthenticated audio regen returns 401", async () => {
  const res = await fetch(`${BASE}/api/regenerate-audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId: "fake" }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

await check("intelligence page loads", async () => {
  const res = await fetch(`${BASE}/intelligence`, { redirect: "manual" });
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
});

// ── Report ─────────────────────────────────────────────────────────────────────

console.log("\n── WatchFilter Smoke Tests ──────────────────────────────");
console.log(`   Target: ${BASE}\n`);

let passed = 0;
for (const r of results) {
  const icon = r.ok ? "✅" : "❌";
  console.log(`  ${icon}  ${r.name.padEnd(46)} ${r.detail}`);
  if (r.ok) passed++;
}

console.log(`\n   ${passed}/${results.length} passed`);
if (passed < results.length) {
  console.log("\n   NOTE: Google OAuth sign-in, video analysis, audio playback,");
  console.log("   and Compare flows require manual verification in a browser.\n");
  process.exit(1);
}
console.log("\n   ✓ All automated checks passed. Run the 4 manual browser");
console.log("   checks from LAUNCH_CHECKLIST.md § 6 to complete sign-off.\n");
