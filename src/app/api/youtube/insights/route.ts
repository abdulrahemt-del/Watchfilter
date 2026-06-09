import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { YoutubeTranscript } from "youtube-transcript";
import { sanitizeText } from "@/lib/utils/sanitize";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

export type InsightCategory =
  | "Strategy" | "Investing" | "AI" | "Marketing" | "Leadership"
  | "Startup"  | "Productivity" | "Technology" | "Content Creation" | "Business";

export type VideoType =
  | "Advice / Self-Improvement"
  | "Educational"
  | "Interview"
  | "News / Industry Analysis"
  | "Opinion / Commentary";

export interface InsightNote {
  title:   string;
  content: string;
}

export interface InsightTask {
  title:       string;
  description: string;
}

export interface InsightContentAsset {
  title: string;
  angle: string;
}

export interface Insight {
  title:          string;
  explanation:    string;
  why_it_matters: string;
  category:       InsightCategory;
  importance:     number;
  assets: {
    note:    InsightNote;
    task:    InsightTask;
    content: InsightContentAsset;
  };
}

const SYSTEM_PROMPT = `You are an AI Chief of Staff for WatchFilter. Your job is NOT to summarize videos.

Your job: extract the 3 highest-signal insights from a video, then generate 3 workspace assets per insight that are MORE VALUABLE than the insight itself.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — EXTRACT 3 INSIGHTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pick the 3 most important ideas. Each insight must:
- Have a specific title (a claim, not a topic — "NVIDIA owns the AI infrastructure layer" not "NVIDIA")
- explanation: what the speaker actually said, concisely
- why_it_matters: the strategic significance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — GENERATE 3 ASSETS PER INSIGHT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each insight generate exactly 3 assets. Each asset must add NEW value — not restate the insight.

ASSET 1: Strategic Note (saved to Notion)
- Add context, examples, analogies, or frameworks the speaker didn't say
- Connect it to a broader pattern or historical precedent
- NOT a summary of the insight

ASSET 2: Action Task (sent to Todoist)
- A specific, completable action the user can do this week
- Must be concrete ("Audit your top 3 acquisition channels" not "Think about acquisition")
- Only if the insight has clear decision value — otherwise: "Bookmark for reference: [topic]"

ASSET 3: Content Opportunity (added to content queue)
- A counter-intuitive or contrarian content angle
- Something that would surprise or challenge the reader
- NOT "Write about [topic]" — instead: a specific thesis or hook

━━━━━━━━━━━━━━━━━━━━━━
BAD vs GOOD EXAMPLE
━━━━━━━━━━━━━━━━━━━━━━
Insight: "NVIDIA's revenue grew 40% from AI chip demand"

BAD:
  note:    "NVIDIA revenue grew 40%"
  task:    "Research NVIDIA"
  content: "Write about AI chip demand"

GOOD:
  note:    "3 infrastructure layers that became monopolies: NVIDIA (AI compute), AWS (cloud), Stripe (payments). Each owned a chokepoint before the market realized it was a chokepoint."
  task:    "Map your product: which layer are you on? Which layer could you own? Document in a 2x2."
  content: "The unsexy infrastructure play always beats the flashy app — here's the historical proof"

━━━━━━━━━━━━━━━━━━━━━━
RETURN ONLY JSON
━━━━━━━━━━━━━━━━━━━━━━
{
  "video_type": "Interview",
  "insights": [
    {
      "title": "Specific claim as insight title",
      "explanation": "What the speaker actually said",
      "why_it_matters": "Strategic significance",
      "category": "Strategy",
      "importance": 9,
      "assets": {
        "note": {
          "title": "Strategic note title",
          "content": "Unique strategic context, analogies, or frameworks that add value beyond the insight"
        },
        "task": {
          "title": "Specific action task title",
          "description": "Why this action matters and exactly how to do it"
        },
        "content": {
          "title": "Content piece title",
          "angle": "The counter-intuitive or contrarian angle that makes this worth publishing"
        }
      }
    }
  ]
}

Rules:
- Exactly 3 insights. No more, no less.
- Every asset must add value the others do not. No paraphrasing between assets.
- category: "Strategy" | "Investing" | "AI" | "Marketing" | "Leadership" | "Startup" | "Productivity" | "Technology" | "Content Creation" | "Business"
- importance: 1-10
- Never write: "This video discusses..." / "The speaker mentions..." / "According to the video..."`;

interface ParsedResponse {
  video_type?: VideoType;
  insights?:   Insight[];
}

function sanitizeInsightRaw(ins: Insight): Insight {
  return {
    ...ins,
    title:          sanitizeText(ins.title          ?? ""),
    explanation:    sanitizeText(ins.explanation    ?? ""),
    why_it_matters: sanitizeText(ins.why_it_matters ?? ""),
    assets: {
      note: {
        title:   sanitizeText(ins.assets?.note?.title   ?? ""),
        content: sanitizeText(ins.assets?.note?.content ?? ""),
      },
      task: {
        title:       sanitizeText(ins.assets?.task?.title       ?? ""),
        description: sanitizeText(ins.assets?.task?.description ?? ""),
      },
      content: {
        title: sanitizeText(ins.assets?.content?.title ?? ""),
        angle: sanitizeText(ins.assets?.content?.angle ?? ""),
      },
    },
  };
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
    context = segments.map(s => sanitizeText(s.text)).join(" ").slice(0, 12000);
  } catch {
    if (!title) return NextResponse.json({ error: "Transcript unavailable and no metadata provided" }, { status: 422 });
    context = [
      `Video: "${sanitizeText(title)}"`,
      channelTitle ? `Channel: ${sanitizeText(channelTitle)}` : "",
      description  ? `Description: ${sanitizeText(description.slice(0, 800))}` : "",
    ].filter(Boolean).join("\n");
    usedFallback = true;
  }

  const userMessage = usedFallback
    ? `Generate 3 insights + assets from this video metadata:\n\n${context}`
    : `Generate 3 insights + assets from this video:\n\nTitle: ${sanitizeText(title ?? "")}\nChannel: ${sanitizeText(channelTitle ?? "")}\n\nTranscript:\n${context}`;

  console.log(`[insights] Generating for videoId=${videoId} | usedFallback=${usedFallback}`);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature:  0.4,
    max_tokens:   3000,
  });

  const raw = completion.choices[0].message.content ?? '{"insights":[]}';
  console.log("[insights] RAW length:", raw.length, "first char code:", raw.charCodeAt(0));

  const cleaned = sanitizeText(raw);
  const parsed = JSON.parse(cleaned) as ParsedResponse;

  const insights = (parsed.insights ?? [])
    .slice(0, 3)
    .map(sanitizeInsightRaw);

  console.log(`[insights] Returning ${insights.length} insights`);

  return NextResponse.json({
    video_type:  parsed.video_type ?? null,
    insights,
    usedFallback,
  });
}
