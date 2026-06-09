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
  | "Advice / Self Improvement"
  | "Educational"
  | "Interview"
  | "News / Industry Analysis"
  | "Market Commentary"
  | "Opinion / Discussion"
  | "Tutorial";

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

export interface InsightDecision {
  title:   string;
  context: string;
}

export interface Insight {
  title:               string;
  what_was_discussed:  string;
  why_it_matters:      string;
  category:            InsightCategory;
  importance_score:    number;
  actionability_score: number;
  actionability_reason: string;
  supporting_points:   string[];
  key_quote:           string | null;
  assets: {
    note:     InsightNote;
    task:     InsightTask | null;
    content:  InsightContentAsset;
    decision: InsightDecision | null;
  };
}

const SYSTEM_PROMPT = [
  "You are an Execution Intelligence Engine for WatchFilter.",
  "",
  "Your goal: transform long-form content into useful work.",
  "Information → Understanding → Decision → Action → Execution.",
  "",
  "Users should feel: 'I pasted a 2-hour podcast and my workspace was intelligently updated.'",
  "NOT: 'I got another summary.'",
  "",
  "## STEP 1: Extract 3 High-Signal Insights",
  "",
  "Think like an analyst preparing an executive briefing.",
  "Only include ideas that could influence decisions, strategy, investments, operations, growth, or product direction.",
  "",
  "Each insight must have:",
  "- title: a specific, actionable claim (not a topic)",
  "- what_was_discussed: what the speaker actually said, grounded in the content",
  "- why_it_matters: strategic significance without advice or recommendations",
  "- category: Strategy | Investing | AI | Marketing | Leadership | Startup | Productivity | Technology | Content Creation | Business",
  "- importance_score: 1-10",
  "- supporting_points: 3-5 bullet strings from the video",
  "- key_quote: verbatim quote from the speaker, or null",
  "",
  "## STEP 2: Actionability Analysis (for each insight)",
  "",
  "Score 0-10:",
  "0 = informational only",
  "1 = observation",
  "2 = interesting fact",
  "3 = strategic implication",
  "4 = decision recommended",
  "5 = decision strongly recommended",
  "6 = action implied",
  "7 = action recommended",
  "8 = high-value task exists",
  "9 = high-priority task exists",
  "10 = immediate action required",
  "",
  "Evaluate:",
  "1. Is there an explicit action the speaker recommends?",
  "2. Is there an implied action a founder/investor/operator/creator should take?",
  "3. Does this insight require a decision?",
  "4. Is this purely informational?",
  "",
  "Implied actions count. Example: 'NVIDIA invested years before demand appeared' → implied action: 'Review roadmap for long-term infrastructure investments.'",
  "",
  "## STEP 3: Generate Assets (each must be DISTINCT — no paraphrasing between assets)",
  "",
  "note (always): Strategic context the speaker did NOT say. Historical examples, analogies, frameworks. NOT a restatement.",
  "",
  "task (only when actionability_score >= 6): A specific, completable action. Use the implied or explicit action from the content.",
  "If score < 6, set task to null.",
  "",
  "content (always): A counter-intuitive or contrarian content angle. A specific thesis or hook, not 'Write about [topic]'.",
  "",
  "decision (when actionability_score >= 4): Frame the strategic decision this insight creates.",
  "Example: 'Decide whether to prioritize ecosystem advantages over feature development.'",
  "If score < 4, set decision to null.",
  "",
  "## RULES",
  "",
  "- Never create three versions of the same sentence across assets",
  "- Never generate financial, legal, medical advice",
  "- Never write 'This video discusses...' or 'The speaker mentions...'",
  "- Every asset must contribute something the others do not",
  "",
  "## Return Only JSON",
  "",
  JSON.stringify({
    video_type: "Interview",
    insights: [{
      title: "Specific actionable claim",
      what_was_discussed: "What the speaker actually said",
      why_it_matters: "Strategic significance without advice",
      category: "Strategy",
      importance_score: 9,
      actionability_score: 7,
      actionability_reason: "Clear implied action for operators to audit their competitive positioning",
      supporting_points: ["Evidence point 1", "Evidence point 2", "Evidence point 3"],
      key_quote: "Direct quote from speaker or null",
      assets: {
        note: { title: "Distinct strategic context", content: "Historical examples, analogies, frameworks not mentioned by speaker" },
        task: { title: "Specific action title", description: "How to execute this action concretely" },
        content: { title: "Counter-intuitive angle", angle: "Specific contrarian thesis that would surprise the audience" },
        decision: { title: "Decision framing", context: "What strategic choice this insight creates and why it matters now" },
      },
    }],
  }, null, 2),
].join("\n");

interface ParsedResponse {
  video_type?: VideoType;
  insights?:   Insight[];
}

function sanitizeInsightRaw(ins: Insight): Insight {
  return {
    ...ins,
    title:               sanitizeText(ins.title               ?? ""),
    what_was_discussed:  sanitizeText(ins.what_was_discussed  ?? ""),
    why_it_matters:      sanitizeText(ins.why_it_matters      ?? ""),
    actionability_reason: sanitizeText(ins.actionability_reason ?? ""),
    importance_score:    ins.importance_score    ?? 5,
    actionability_score: ins.actionability_score ?? 0,
    supporting_points:   (ins.supporting_points ?? []).map(p => sanitizeText(p)).filter(Boolean),
    key_quote:           ins.key_quote ? sanitizeText(ins.key_quote) : null,
    assets: {
      note: {
        title:   sanitizeText(ins.assets?.note?.title   ?? ""),
        content: sanitizeText(ins.assets?.note?.content ?? ""),
      },
      task: ins.assets?.task ? {
        title:       sanitizeText(ins.assets.task.title       ?? ""),
        description: sanitizeText(ins.assets.task.description ?? ""),
      } : null,
      content: {
        title: sanitizeText(ins.assets?.content?.title ?? ""),
        angle: sanitizeText(ins.assets?.content?.angle ?? ""),
      },
      decision: ins.assets?.decision ? {
        title:   sanitizeText(ins.assets.decision.title   ?? ""),
        context: sanitizeText(ins.assets.decision.context ?? ""),
      } : null,
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
    ? `Generate 3 insights from this video metadata:\n\n${context}`
    : `Generate 3 insights from this video:\n\nTitle: ${sanitizeText(title ?? "")}\nChannel: ${sanitizeText(channelTitle ?? "")}\n\nTranscript:\n${context}`;

  console.log(`[insights] Generating for videoId=${videoId} | usedFallback=${usedFallback}`);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature:  0.4,
    max_tokens:   3500,
  });

  const raw = completion.choices[0].message.content ?? '{"insights":[]}';
  console.log("[insights] RAW length:", raw.length);

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
