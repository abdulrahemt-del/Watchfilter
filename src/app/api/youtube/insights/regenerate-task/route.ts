import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { Insight, InsightTask } from "@/app/api/youtube/insights/route";
import { sanitizeText } from "@/lib/utils/sanitize";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const REGEN_PROMPT = [
  "You are a task generation specialist. Generate ONE alternative task for the given insight.",
  "",
  "The user already has a task for this insight and wants a DIFFERENT angle.",
  "Generate something the original task did NOT cover.",
  "",
  "BANNED task titles:",
  "  Prepare for X | Review X | Think about X | Study X | Improve X | Evaluate X |",
  "  Explore X | Consider X | Look into X | Research X | Assess X",
  "",
  "REQUIRED — every task title must:",
  "  1. Start with a specific action verb (Audit, Interview, Map, Build, Calculate, Draft, Create, Model, Benchmark, Identify)",
  "  2. Name a specific object",
  "  3. Include a measurable outcome, scope, or deadline",
  "",
  "GOOD examples:",
  "  'Audit current infrastructure costs and model the impact of a 3x increase in AI usage over the next 24 months'",
  "  'Interview 5 customers this week to identify the top repetitive task that could be automated'",
  "  'Map the top 10 competitors by acquisition channel, pricing, and positioning in a spreadsheet'",
  "",
  "Return ONLY JSON in this exact shape:",
  JSON.stringify({
    task: {
      title: "Specific action verb + object + measurable outcome",
      description: "Step-by-step instructions for how to execute this task.",
      confidence: 88,
      reason: "Why this task follows from the insight."
    }
  }, null, 2),
].join("\n");

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { insight, currentTaskTitle } = await req.json() as {
    insight: Insight;
    currentTaskTitle?: string;
  };

  if (!insight?.title) return NextResponse.json({ error: "insight required" }, { status: 400 });

  const userMessage = [
    `Insight: ${sanitizeText(insight.title)}`,
    `What was discussed: ${sanitizeText(insight.what_was_discussed ?? "")}`,
    `Why it matters: ${sanitizeText(insight.why_it_matters ?? "")}`,
    `Category: ${insight.category}`,
    `Actionability score: ${insight.actionability_score}/10`,
    `Actionability reason: ${sanitizeText(insight.actionability_reason ?? "")}`,
    currentTaskTitle ? `Current task (generate something DIFFERENT): ${sanitizeText(currentTaskTitle)}` : "",
  ].filter(Boolean).join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: REGEN_PROMPT },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature:  0.7,
    max_tokens:   600,
  });

  const raw     = completion.choices[0].message.content ?? "{}";
  const parsed  = JSON.parse(sanitizeText(raw)) as { task?: InsightTask };
  const rawTask = parsed.task;

  if (!rawTask?.title) {
    return NextResponse.json({ error: "Model returned no task" }, { status: 500 });
  }

  const task: InsightTask = {
    title:        sanitizeText(rawTask.title       ?? ""),
    description:  sanitizeText(rawTask.description ?? ""),
    steps:        (rawTask.steps ?? []).map((s: string) => sanitizeText(s)).filter(Boolean),
    effort:       rawTask.effort       ?? "medium",
    time_horizon: rawTask.time_horizon ?? "short-term",
    confidence:   rawTask.confidence ?? 70,
    reason:       sanitizeText(rawTask.reason      ?? ""),
  };

  return NextResponse.json({ task });
}
