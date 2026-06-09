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

export interface Insight {
  title:              string;
  what_was_discussed: string;
  why_it_matters:     string;
  actionability:      string;
  supporting_points:  string[];
  key_quote:          string | null;
  category:           InsightCategory;
  importance:         number;
  assets: {
    note:    InsightNote;
    task:    InsightTask;
    content: InsightContentAsset;
  };
}

const SYSTEM_PROMPT = [
  "You are generating insights for WatchFilter.",
  "",
  "WatchFilter is NOT an AI advisor, coach, investment analyst, consultant, or recommendation engine.",
  "WatchFilter's purpose: help users quickly understand what was discussed in a video and decide whether it deserves their attention.",
  "",
  "Users should feel: \"I understand what was discussed.\" NOT: \"The AI is telling me what I should do.\"",
  "",
  "## Critical Rule: Never Convert Observations Into Recommendations",
  "",
  "Do NOT infer actions from observations. Examples of what NOT to do:",
  "- Speaker: \"AI demand is increasing semiconductor demand.\" BAD output: \"Review your investment portfolio.\"",
  "- Speaker: \"NVIDIA's valuation reflects its strategic importance.\" BAD output: \"Consider investing in semiconductor companies.\"",
  "- Speaker: \"OpenAI released a new model.\" BAD output: \"Integrate this model into your business.\"",
  "",
  "Never generate financial, investment, legal, medical, business, or career advice unless the speaker explicitly provided that advice.",
  "",
  "## Step 1: Classify the Content",
  "",
  "video_type: \"Advice / Self Improvement\" | \"Educational\" | \"Interview\" | \"News / Industry Analysis\" | \"Market Commentary\" | \"Opinion / Discussion\" | \"Tutorial\"",
  "",
  "## Step 2: Generate 3 Insights",
  "",
  "title — specific headline claim (\"NVIDIA owns the AI infrastructure layer\", not \"NVIDIA\")",
  "what_was_discussed — what the speaker actually said, concisely. Stay grounded in the content. Do not speculate.",
  "why_it_matters — the significance or implications. Answer \"why should the viewer care?\" WITHOUT giving recommendations.",
  "",
  "GOOD why_it_matters: \"This highlights the growing role of AI infrastructure providers in the broader technology ecosystem.\"",
  "BAD why_it_matters: \"Investors should buy AI-related stocks.\" / \"Companies should immediately adopt AI tools.\"",
  "",
  "category: \"Strategy\" | \"Investing\" | \"AI\" | \"Marketing\" | \"Leadership\" | \"Startup\" | \"Productivity\" | \"Technology\" | \"Content Creation\" | \"Business\"",
  "importance: 1-10",
  "",
  "## Step 3: Actionability",
  "",
  "Generate a real action ONLY when ALL of the following are true:",
  "1. The speaker explicitly recommends an action",
  "2. The recommendation is direct and unambiguous",
  "3. The action is clearly stated in the content",
  "",
  "Example of valid action — Speaker says: \"Schedule two hours of uninterrupted deep work every day.\"",
  "actionability: \"Schedule a daily block of uninterrupted focus time.\"",
  "",
  "If no explicit action was recommended, set actionability to exactly: \"Informational Only\"",
  "Do NOT create next steps, strategic suggestions, portfolio advice, or business advice.",
  "",
  "## Step 4: Supporting Evidence and Key Quote",
  "",
  "supporting_points — 3 to 5 concise bullet strings from the video that back up the insight. Facts, figures, examples the speaker gave.",
  "key_quote — A verbatim or near-verbatim quote from the speaker if a strong one exists, otherwise null.",
  "",
  "## Step 5: Assets",
  "",
  "note — Add context, examples, analogies, or frameworks the speaker did NOT say. NOT a summary of the insight.",
  "task — ONLY if actionability is not \"Informational Only\": the specific explicit action the speaker recommended. Otherwise set title to \"Bookmark for reference: [topic]\" and description to \"Saved for future reference.\"",
  "content — A counter-intuitive or contrarian content angle. NOT \"Write about [topic]\" — a specific thesis or hook that would surprise the reader.",
  "",
  "## Final Quality Check",
  "",
  "Before each insight ask:",
  "1. Did the speaker actually say this?",
  "2. Am I summarizing or advising?",
  "3. Could a reasonable user mistake this for financial, legal, medical, or business advice?",
  "4. Can every statement be traced back to the video?",
  "",
  "If any answer suggests the content is advice rather than summary, rewrite it.",
  "",
  "## Return Only JSON",
  "",
  JSON.stringify({
    video_type: "Interview",
    insights: [{
      title: "Specific claim as headline",
      what_was_discussed: "What the speaker actually said, grounded in the content",
      why_it_matters: "Significance without recommendations",
      actionability: "Informational Only",
      supporting_points: ["Point from the video", "Another supporting fact", "Third evidence point"],
      key_quote: "Direct quote from the speaker, or null if none",
      category: "Strategy",
      importance: 8,
      assets: {
        note: { title: "Context note title", content: "Added context, analogies, or frameworks beyond the insight" },
        task: { title: "Bookmark for reference: Topic", description: "Saved for future reference" },
        content: { title: "Contrarian angle title", angle: "The specific counter-intuitive thesis or hook" },
      },
    }],
  }, null, 2),
  "",
  "Rules:",
  "- Exactly 3 insights. No more, no less.",
  "- Every asset must add value the others do not. No paraphrasing between assets.",
  "- Never write: \"This video discusses...\" / \"The speaker mentions...\" / \"According to the video...\"",
].join("\n");

interface ParsedResponse {
  video_type?: VideoType;
  insights?:   Insight[];
}

function sanitizeInsightRaw(ins: Insight): Insight {
  return {
    ...ins,
    title:              sanitizeText(ins.title              ?? ""),
    what_was_discussed: sanitizeText(ins.what_was_discussed ?? ""),
    why_it_matters:     sanitizeText(ins.why_it_matters     ?? ""),
    actionability:      sanitizeText(ins.actionability      ?? "Informational Only"),
    supporting_points:  (ins.supporting_points ?? []).map(p => sanitizeText(p)).filter(Boolean),
    key_quote:          ins.key_quote ? sanitizeText(ins.key_quote) : null,
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
