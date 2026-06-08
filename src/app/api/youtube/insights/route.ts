import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { YoutubeTranscript } from "youtube-transcript";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

export type InsightCategory =
  | "Strategy" | "Investing" | "AI" | "Marketing" | "Leadership"
  | "Startup" | "Productivity" | "Technology" | "Content Creation" | "Business";

export type VideoType =
  | "Advice / Self-Improvement"
  | "Educational"
  | "Interview"
  | "News / Industry Analysis"
  | "Opinion / Commentary";

export type Confidence = "High" | "Medium" | "Low";

export interface InsightAction {
  task:        string;
  description: string;
}

export interface Insight {
  title:          string;
  what_was_said:  string;
  why_it_matters: string;
  confidence:     Confidence;
  category:       InsightCategory;
  importance:     number;
  actionability:  "informational_only" | InsightAction;
}

const SYSTEM_PROMPT = `You are an insight extractor for WatchFilter. Your job: summarize what was actually said in a video so users can decide whether it deserves their attention.

PRIMARY RULE: Stay faithful to what the speaker said. Never invent recommendations they did not make.

━━━━━━━━━━━━━━━━━
STEP 1 — CLASSIFY
━━━━━━━━━━━━━━━━━
Identify the video type:
- "Advice / Self-Improvement" — productivity, business tips, career guidance, health advice
- "Educational" — lectures, tutorials, explainers, TED-style talks
- "Interview" — founder/CEO/expert conversations, podcasts
- "News / Industry Analysis" — market updates, AI news, technology commentary
- "Opinion / Commentary" — predictions, reactions, creator analysis

━━━━━━━━━━━━━━━━━━━━
STEP 2 — INSIGHTS
━━━━━━━━━━━━━━━━━━━━
For each important point extract:
- what_was_said: a faithful summary of what the speaker actually said
- why_it_matters: the significance of this point — NO added recommendations
- confidence: High (speaker stated it directly) / Medium (implied or nuanced) / Low (speculative)
- importance: 1-10 signal strength

━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — ACTIONABILITY TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ask: "Did the speaker DIRECTLY tell the audience to do something?"

YES → include the suggested action
NO  → set actionability to "informational_only"

NEVER convert these into actions:
- Market observations: "AI is driving semiconductor demand" → NOT actionable
- Performance data: "Revenue grew 40%" → NOT actionable
- Predictions: "Interest rates may fall" → NOT actionable
- Historical facts, statistics, expert opinions — unless framed as explicit advice

BAD: Speaker says "NVIDIA revenue grew" → Action: "Buy NVIDIA stock"
BAD: Speaker says "AI demand is increasing" → Action: "Invest in AI"
BAD: Speaker says "Sleep affects performance" → Action: "Sleep 8 hours"
GOOD: Speaker says "Schedule 90-minute deep work blocks" → Action: "Schedule two 90-min focus blocks this week"
GOOD: Speaker says "Write down your goals every morning" → Action: "Start a daily goal-writing habit tomorrow"

━━━━━━━━━━━━━━━
RETURN ONLY JSON
━━━━━━━━━━━━━━━
{
  "video_type": "Advice / Self-Improvement | Educational | Interview | News / Industry Analysis | Opinion / Commentary",
  "insights": [
    {
      "title": "Short, specific title — a claim, not a topic",
      "what_was_said": "Faithful summary of what the speaker actually said. Quote where possible.",
      "why_it_matters": "Why this is significant — no added prescriptions or recommendations.",
      "confidence": "High | Medium | Low",
      "category": "Strategy | Investing | AI | Marketing | Leadership | Startup | Productivity | Technology | Content Creation | Business",
      "importance": 8,
      "actionability": "informational_only"
    },
    {
      "title": "...",
      "what_was_said": "...",
      "why_it_matters": "...",
      "confidence": "High",
      "category": "Productivity",
      "importance": 9,
      "actionability": {
        "task": "Specific action directly supported by what the speaker said",
        "description": "Why this action follows from the speaker's recommendation"
      }
    }
  ]
}

Rules:
- 2–5 insights based on substance. Do not pad with weak observations.
- Every insight must be traceable back to something said in the video.
- Never generate: investment, medical, legal, financial, or career recommendations — unless the speaker explicitly made them.
- Prefer "What the speaker said" over "What the AI thinks the user should do."
- Never write: "This video discusses..." / "The speaker mentions..." / "According to the video..."`;

interface ParsedResponse {
  video_type?: VideoType;
  insights?:   Insight[];
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, title, channelTitle, description } =
    (await req.json()) as { videoId?: string; title?: string; channelTitle?: string; description?: string };

  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  let context = "";
  let usedFallback = false;
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    context = segments.map(s => s.text).join(" ").slice(0, 12000);
  } catch {
    if (!title) return NextResponse.json({ error: "Transcript unavailable and no metadata provided" }, { status: 422 });
    context = [
      `Video: "${title}"`,
      channelTitle ? `Channel: ${channelTitle}` : "",
      description  ? `Description: ${description.slice(0, 800)}` : "",
    ].filter(Boolean).join("\n");
    usedFallback = true;
  }

  const userMessage = usedFallback
    ? `Classify and extract insights from this video metadata (no transcript available):\n\n${context}`
    : `Classify and extract insights from this video:\n\nTitle: ${title ?? ""}\nChannel: ${channelTitle ?? ""}\n\nTranscript:\n${context}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature:  0.3,
    max_tokens:   2500,
  });

  const parsed = JSON.parse(
    completion.choices[0].message.content ?? '{"insights":[]}'
  ) as ParsedResponse;

  return NextResponse.json({
    video_type:  parsed.video_type ?? null,
    insights:    (parsed.insights ?? []).slice(0, 5),
    usedFallback,
  });
}
