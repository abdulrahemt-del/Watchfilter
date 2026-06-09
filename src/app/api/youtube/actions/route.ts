import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { YoutubeTranscript } from "youtube-transcript";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

const SYSTEM_PROMPT = `You are an Insight-to-Action Engine for founders and operators.
Convert video transcripts into executable action cards. Max 6 actions. No fluff.

Return JSON: { "actions": [...] }

Each action:
{
  "insight": "1-2 sentence key insight from the video",
  "action_type": "TASK" | "NOTE" | "CONTENT" | "REMINDER" | "LEARNING",
  "action_title": "Imperative verb phrase e.g. 'Audit your pricing model'",
  "rationale": "One sentence on why this matters for a founder/operator",
  "confidence": "low" | "medium" | "high"
}

action_type rules:
- TASK: something concrete to do
- NOTE: information to capture for reference
- CONTENT: something to create or publish
- REMINDER: time-sensitive follow-up
- LEARNING: skill or concept to study

Only high-signal insights. No summaries. No observations without a clear action.`;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, title, channelTitle, description } =
    (await req.json()) as { videoId?: string; title?: string; channelTitle?: string; description?: string };
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  // Try transcript first, fall back to title + description if unavailable
  let context = "";
  let usedFallback = false;
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    context = segments.map((s) => s.text).join(" ").slice(0, 8000);
  } catch {
    if (!title) return NextResponse.json({ error: "Transcript unavailable for this video" }, { status: 422 });
    context = [
      `Video: ${title}`,
      channelTitle ? `Channel: ${channelTitle}` : "",
      description ? `Description: ${description}` : "",
    ].filter(Boolean).join("\n");
    usedFallback = true;
  }

  const userPrompt = usedFallback
    ? `Extract action cards from this video metadata (no transcript available):\n\n${context}`
    : `Extract action cards from this transcript:\n\n${context}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 2000,
  });

  const parsed = JSON.parse(
    completion.choices[0].message.content ?? '{"actions":[]}'
  ) as { actions?: unknown[] };

  return NextResponse.json({
    actions: (parsed.actions ?? []).slice(0, 6),
    usedFallback,
  });
}
