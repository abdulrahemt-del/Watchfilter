/**
 * Core intelligence pipeline engine.
 *
 * executeIntelligenceUpdate(userId) is the public entry point:
 *   1. Retrieves the stored refresh token for the user
 *   2. Exchanges it for a fresh access token via Google OAuth
 *   3. Runs the full YouTube → score → consensus → DB pipeline
 *
 * This is the function called by the cron route.
 * The snapshot API route bypasses this and calls runIntelligencePipeline
 * directly (it already has the access token from the user's session).
 */

import { getRefreshToken } from "./db";
import { runIntelligencePipeline } from "./worker";

async function getNewAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(data.error ?? "Failed to refresh access token");
  return data.access_token;
}

export async function executeIntelligenceUpdate(userId: string): Promise<{ success: boolean }> {
  const refreshToken = await getRefreshToken(userId);
  if (!refreshToken) throw new Error(`No stored refresh token for user: ${userId}. User must sign in first.`);

  const accessToken = await getNewAccessToken(refreshToken);
  await runIntelligencePipeline(userId, accessToken);
  return { success: true };
}
