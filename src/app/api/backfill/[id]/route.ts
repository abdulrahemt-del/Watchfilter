import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getAnalysisById, updateBackfilledFields } from "@/lib/db";
import { fetchYouTubeMetadata } from "@/lib/youtube";
import type { SavedAnalysis } from "@/lib/client-types";

export const runtime = "nodejs";
export const maxDuration = 60;

const backfillSchema = z.object({
  illustrations: z.array(z.string()),
  nuggets: z.array(z.string()).min(5),
});

async function generateEnhancements(apiKey: string, analysis: SavedAnalysis) {
  const openai = new OpenAI({ apiKey });

  const pointSummaries = analysis.hard_data_points
    .map((point, i) => {
      if (typeof point === "string") return `${i + 1}. ${point}`;
      const p = point as Record<string, unknown>;
      const thesis = typeof p.speaker_thesis === "string"
        ? p.speaker_thesis.slice(0, 220)
        : "";
      return `${i + 1}. ${p.metric_title as string}${thesis ? `\n   ${thesis}` : ""}`;
    })
    .join("\n");

  const takeawaySummaries = analysis.actionable_takeaways
    .map((t, i) => `${i + 1}. ${typeof t === "string" ? t : t.strategy}`)
    .join("\n");

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content:
          "You enhance structured video analysis with two new fields. Be vivid, specific, and concise.",
      },
      {
        role: "user",
        content: `Video: "${analysis.title ?? "Unknown"}"
Subject: ${analysis.primary_subject}

DATA POINTS (${analysis.hard_data_points.length} total — respond with exactly this many illustrations):
${pointSummaries}

ACTIONABLE TAKEAWAYS:
${takeawaySummaries}

Generate:
1. illustrations — exactly ${analysis.hard_data_points.length} strings in the same order as the data points. Each is a concrete real-world analogy or comparison that makes the statistic visceral: 1–2 sentences, vivid and memorable. Examples of the style: "That's larger than the GDP of Iceland" or "Equivalent to working every waking hour for 8 years without a day off."
2. nuggets — 5–7 standalone golden insights from this video's themes: unexpected wisdom, counterintuitive truths, or memorable mental models that go beyond the structured data. Each must stand alone as a complete sentence someone could immediately act on or share.`,
      },
    ],
    response_format: zodResponseFormat(backfillSchema, "backfill"),
  });

  return completion.choices[0]?.message?.parsed ?? null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const analysis = await getAnalysisById(id);
  if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const [metadataResult, enhancementsResult] = await Promise.allSettled([
    fetchYouTubeMetadata(analysis.videoId),
    generateEnhancements(apiKey, analysis),
  ]);

  const durationSeconds =
    metadataResult.status === "fulfilled"
      ? (metadataResult.value.durationSeconds ?? null)
      : null;

  const enhancements =
    enhancementsResult.status === "fulfilled" ? enhancementsResult.value : null;

  const updatedPoints = analysis.hard_data_points.map((point, i) => {
    if (typeof point === "string") return point;
    return {
      ...point,
      metric_context_example:
        enhancements?.illustrations[i] ??
        (point as Record<string, unknown>).metric_context_example ??
        "",
    };
  });

  await updateBackfilledFields(id, {
    durationSeconds,
    hardDataPoints: JSON.stringify(updatedPoints),
    offScriptNuggets: JSON.stringify(enhancements?.nuggets ?? []),
  });

  const updated = await getAnalysisById(id);
  return NextResponse.json(updated);
}
