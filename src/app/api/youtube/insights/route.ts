import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { YoutubeTranscript } from "youtube-transcript";
import { sanitizeText } from "@/lib/utils/sanitize";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

// Stage 1 categories
export type InsightCategory = "market" | "strategy" | "product" | "growth" | "tech" | "psychology";

// Stage 2 impact areas
export type ImpactArea = "revenue" | "growth" | "product" | "efficiency" | "strategy" | "none";

// Stage 3 action types
export type ActionType = "inferred_action" | "strategic_move" | "no_action";

// Stage 4 task metadata
export type Effort       = "low" | "medium" | "high";
export type TimeHorizon  = "immediate" | "short-term" | "long-term";

// Legacy export — kept for parent components that reference it
export type VideoType =
  | "Advice / Self Improvement" | "Educational" | "Interview"
  | "News / Industry Analysis"  | "Market Commentary"
  | "Opinion / Discussion"      | "Tutorial";

export interface InsightNote {
  title:      string;
  content:    string;
  confidence: number;
  reason:     string;
}

export interface InsightTask {
  title:        string;
  description:  string;
  steps:        string[];
  effort:       Effort;
  time_horizon: TimeHorizon;
  confidence:   number;
  reason:       string;
}

export interface InsightContentAsset {
  title:    string;
  hook:     string;
  angle:    string;
  audience: string;
  outline:  string[];
}

export interface InsightDecision {
  title:      string;
  context:    string;
  risks:      string;
  confidence: number;
}

export interface Insight {
  // Stage 1 — Insight Extraction
  title:              string;
  category:           InsightCategory;
  insight_confidence: number;       // 0-10

  // Stage 2 — Significance Mapping
  relevance_score:  number;         // 0-10
  impact_area:      ImpactArea;
  why_it_matters:   string;

  // Stage 3 — Action Potential
  action_type:        ActionType;
  action_description: string;
  action_confidence:  number;       // 0-10, meaningful for inferred_action

  // Evidence
  what_was_discussed: string;
  supporting_points:  string[];
  key_quote:          string | null;

  // Derived fields kept for backward compat with auto-send + drawer
  importance_score:        number;  // = relevance_score
  actionability_score:     number;  // derived: inferred_action→7-9, strategic_move→4-6, no_action→0-2
  actionability_reason:    string;  // = why_it_matters
  actionability_confidence: number; // = action_confidence * 10

  assets: {
    note:     InsightNote;
    task:     InsightTask | null;     // only when inferred_action AND action_confidence >= 7
    content:  InsightContentAsset;
    decision: InsightDecision | null; // only when strategic_move
  };
}

const SYSTEM_PROMPT = [
  "You are the reasoning engine for WatchFilter — a system that converts long-form content",
  "into decision-relevant intelligence for founders and operators.",
  "",
  "Your goal is NOT to summarise content.",
  "Your goal is to produce outputs that are more valuable than the original content.",
  "",
  "Follow the pipeline below IN ORDER. Each stage builds on the previous.",
  "",
  "=============================================================",
  "STAGE 1: INSIGHT EXTRACTION",
  "=============================================================",
  "Extract 3 atomic, factual or conceptual insights from the content.",
  "",
  "title (the 'statement'): A specific declarative claim. Not a topic. Not a question.",
  "  BAD: 'AI Infrastructure Discussion'",
  "  GOOD: 'Falling compute costs historically increase total AI demand via Jevons Paradox'",
  "",
  "category: market | strategy | product | growth | tech | psychology",
  "",
  "insight_confidence: 0-10. How well-supported is this insight by the content itself?",
  "",
  "=============================================================",
  "STAGE 2: SIGNIFICANCE MAPPING",
  "=============================================================",
  "Evaluate relevance for a founder or operator.",
  "",
  "relevance_score: 0-10.",
  "  Ask: 'Does this change how a smart operator thinks or decides?'",
  "  HARD RULE: NEVER score below 4 for business, startup, SaaS, AI, marketing,",
  "  strategy, investing, or growth content. These categories are inherently decision-relevant.",
  "",
  "impact_area: revenue | growth | product | efficiency | strategy | none",
  "",
  "why_it_matters: The strategic significance. No advice. No 'you should'. No recommendations.",
  "  Explain WHY this matters — the implication, the pattern, the leverage point.",
  "",
  "=============================================================",
  "STAGE 3: ACTION POTENTIAL (critical layer)",
  "=============================================================",
  "Classify the action type. This determines what assets get created.",
  "",
  "OPTION A — inferred_action:",
  "  Something the user could reasonably do or test based on this insight.",
  "  Examples: audit a funnel, test a channel, analyze competitors, run an experiment,",
  "  benchmark costs, interview customers, map the competitive landscape.",
  "  Use when: the insight implies a concrete investigative or operational action.",
  "  action_confidence: 0-10. How confident are you this action is worth doing?",
  "",
  "OPTION B — strategic_move:",
  "  No immediate execution required — but this insight changes thinking, direction, or assumptions.",
  "  Examples: rethink originality vs speed, shift distribution strategy,",
  "  reconsider product assumptions, adopt a new mental model, reframe the market.",
  "  Use when: the insight reframes something important but doesn't point to a specific task.",
  "",
  "OPTION C — no_action:",
  "  RARE. Only when relevance_score <= 3 AND the content has no decision-relevant implication.",
  "",
  "ROUTING RULES:",
  "  If relevance_score >= 6 → MUST be inferred_action OR strategic_move. Never no_action.",
  "  Prefer strategic_move when uncertain. Avoid forcing tasks for everything.",
  "  Output Priority: strategic_move > inferred_action > no_action",
  "",
  "action_description: The specific action (inferred_action) or mental shift (strategic_move).",
  "  BAD: 'Consider AI opportunities'",
  "  GOOD (inferred): 'Audit current infrastructure costs and model impact of 3x usage growth over 18 months'",
  "  GOOD (strategic): 'Shift framework from TAM-sizing to Jevons Paradox analysis for infrastructure markets'",
  "",
  "=============================================================",
  "STAGE 4: TASK LAYER (only when action_type = inferred_action AND action_confidence >= 7)",
  "=============================================================",
  "Generate a concrete, executable task.",
  "",
  "BANNED task titles (fail quality check automatically):",
  "  Prepare for X | Review X | Think about X | Study X | Improve X | Evaluate X |",
  "  Explore X | Consider X | Look into X | Research X | Assess X",
  "",
  "task title MUST:",
  "  1. Start with a specific action verb (Audit, Interview, Map, Build, Calculate, Draft, Model, Benchmark, Identify)",
  "  2. Name a specific object",
  "  3. Include a measurable scope or outcome",
  "",
  "task steps: 2-5 specific, executable bullet steps. Not sub-topics. Actual instructions.",
  "  BAD step: 'Review the competitive landscape'",
  "  GOOD step: 'List 10 direct competitors and record their pricing, acquisition channel, and positioning in a spreadsheet'",
  "",
  "effort: low (< 2 hours) | medium (2-8 hours) | high (> 1 day)",
  "time_horizon: immediate (this week) | short-term (this month) | long-term (this quarter+)",
  "",
  "=============================================================",
  "ASSET GENERATION (after pipeline is complete)",
  "=============================================================",
  "",
  "NOTE (always — adds context the speaker did NOT provide):",
  "  REQUIRED: at least 2 historical examples or analogies",
  "  REQUIRED: a named framework or pattern",
  "  REQUIRED: a second-order effect not mentioned by speaker",
  "  FORBIDDEN: restating the insight (immediate fail)",
  "  note.confidence: 0-100",
  "  note.reason: why this parallel/framework is the right lens",
  "",
  "TASK (only when action_type = inferred_action AND action_confidence >= 7):",
  "  Use the task from Stage 4. Add confidence (0-100) and reason.",
  "  If action_type != inferred_action OR action_confidence < 7 → set task to null.",
  "",
  "CONTENT (always — full publishable brief):",
  "  title: specific curiosity-driving headline (works as YouTube title or newsletter subject)",
  "  hook: 2-3 sentences leading with a counterintuitive claim",
  "  angle: one-sentence contrarian thesis, publishable as a tweet",
  "  audience: specific persona (not just 'founders')",
  "  outline: exactly 4 specific section titles (not vague topics)",
  "",
  "DECISION RECORD (only when action_type = strategic_move):",
  "  title: a concrete recommendation sentence (not a label)",
  "    BAD: 'Infrastructure Investment Decisions'",
  "    GOOD: 'Prioritise infrastructure-layer investments over application-layer for the next 12 months'",
  "  context: the mechanism that makes this decision necessary right now",
  "  risks: specific scenarios where this decision backfires",
  "  confidence: 0-100",
  "  If action_type != strategic_move → set decision to null.",
  "",
  "=============================================================",
  "SELF-REVIEW (before returning output)",
  "=============================================================",
  "For each insight, verify:",
  "1. Is the title a specific declarative claim (not a topic)?",
  "2. Is relevance_score >= 4 for any business/AI/strategy content?",
  "3. Is action_type set to strategic_move or inferred_action when relevance >= 6?",
  "4. Does the note add information the speaker did NOT provide?",
  "5. If task exists: does it pass the banned-title check AND have specific steps?",
  "If ANY answer is NO — fix it before returning.",
  "",
  "=============================================================",
  "RETURN ONLY JSON — no markdown, no explanation",
  "=============================================================",
  "",
  JSON.stringify({
    video_type: "Interview",
    insights: [{
      title: "Falling compute costs historically increase total AI demand via Jevons Paradox",
      category: "market",
      insight_confidence: 9,
      relevance_score: 9,
      impact_area: "strategy",
      why_it_matters: "Infrastructure-layer businesses may benefit disproportionately as falling costs expand the total addressable market faster than margins compress — the same pattern that made electricity and cloud providers more valuable over time, not less.",
      action_type: "inferred_action",
      action_description: "Audit current infrastructure cost exposure and model the margin impact of a 3x usage increase over 18 months",
      action_confidence: 8,
      what_was_discussed: "The speaker argued that cheaper AI inference follows Jevons Paradox — lower resource costs lead to increased total consumption rather than reduced spending. They cited Nvidia's expanding margins despite falling per-unit compute costs as evidence.",
      supporting_points: [
        "Inference demand grew 40x in 2024 while cost per token fell 90%",
        "Nvidia expanded margins despite falling per-unit compute costs",
        "Every major infrastructure wave followed the same pattern"
      ],
      key_quote: "The price per token will approach zero, but the spend on tokens will approach infinity.",
      importance_score: 9,
      actionability_score: 8,
      actionability_reason: "Infrastructure-layer businesses benefit disproportionately as falling costs expand the TAM — implies a positioning and investment allocation decision.",
      actionability_confidence: 80,
      assets: {
        note: {
          title: "How Falling Infrastructure Costs Have Always Expanded Total Markets",
          content: "Jevons Paradox appears in every major infrastructure wave. Railroads (1850s): cheaper freight created entirely new shipping routes that didn't exist before, multiplying total volume 20x. Electricity (1900s): cheaper power created new industries — cinema, radio, refrigeration — that were previously uneconomical. Cloud computing (2012-2020): AWS price cuts accelerated adoption faster than revenue declined, expanding cloud TAM from $10B to $400B. Pattern: when infrastructure cost crosses a threshold, new use cases become viable, expanding total demand faster than margins compress. Second-order effect: near-zero AI inference costs may create ambient, always-on AI applications that are economically impossible today — real-time personalization at scale, continuous agents, instant translation for every interaction.",
          confidence: 92,
          reason: "Strong historical parallel with documented data across three major infrastructure waves. The Jevons Paradox mechanism is well-evidenced and AI shows identical early indicators."
        },
        task: {
          title: "Audit infrastructure cost exposure and model the margin impact of 3x AI usage growth over 18 months",
          description: "Identify every AI API dependency and model the cost/margin impact at different growth scenarios.",
          steps: [
            "List every AI API call in your product and calculate current monthly cost",
            "Model cost at 2x, 5x, and 10x usage assuming 50% price reduction per year",
            "Identify which product features become economically viable at each price threshold",
            "Map which competitors benefit most from falling costs vs. which are most exposed",
            "Document the resulting strategic options and present to team"
          ],
          effort: "medium",
          time_horizon: "immediate",
          confidence: 88,
          reason: "The Jevons Paradox dynamic directly implies that AI-adjacent businesses should stress-test cost models against simultaneously rising demand and falling unit costs."
        },
        content: {
          title: "Why Cheaper AI Could Make Infrastructure Companies More Valuable, Not Less",
          hook: "Most investors assume falling AI prices compress margins and hurt infrastructure companies. History says the opposite — cheaper infrastructure has always created more total demand. The companies that look most threatened by commoditisation are often the ones that benefit most.",
          angle: "Falling AI compute costs expand the total market faster than they compress margins, following the exact pattern of railroads, electricity, and cloud computing.",
          audience: "Early-stage investors and founders deciding whether to build at the infrastructure or application layer of the AI stack",
          outline: [
            "The counterintuitive economic law (Jevons Paradox) that predicts what happens when resources get cheaper",
            "Three historical infrastructure waves where lower costs created 10x more demand — railroads, electricity, cloud",
            "The specific AI market data showing the same pattern emerging right now",
            "How to position your portfolio or product to capture demand expansion rather than fight commoditisation"
          ]
        },
        decision: null
      }
    }]
  }, null, 2),
].join("\n");

interface ParsedResponse {
  video_type?: VideoType;
  insights?:   Insight[];
}

function sanitizeInsightRaw(ins: Insight): Insight {
  const actionType = ins.action_type ?? "no_action";

  // Derive backward-compat fields from pipeline outputs
  const derivedActionabilityScore =
    actionType === "inferred_action"
      ? Math.min(10, Math.max(6, Math.round((ins.action_confidence ?? 5) * 1.1)))
      : actionType === "strategic_move"
      ? Math.min(6, Math.max(4, 5))
      : Math.min(3, ins.relevance_score ?? 2);

  return {
    ...ins,
    title:              sanitizeText(ins.title              ?? ""),
    why_it_matters:     sanitizeText(ins.why_it_matters     ?? ""),
    action_description: sanitizeText(ins.action_description ?? ""),
    what_was_discussed: sanitizeText(ins.what_was_discussed ?? ""),
    category:           ins.category   ?? "strategy",
    impact_area:        ins.impact_area ?? "none",
    action_type:        actionType,
    insight_confidence:  ins.insight_confidence  ?? 5,
    relevance_score:     ins.relevance_score     ?? 5,
    action_confidence:   ins.action_confidence   ?? 0,
    supporting_points:   (ins.supporting_points ?? []).map(p => sanitizeText(p)).filter(Boolean),
    key_quote:           ins.key_quote ? sanitizeText(ins.key_quote) : null,

    // Backward compat
    importance_score:        ins.relevance_score     ?? 5,
    actionability_score:     derivedActionabilityScore,
    actionability_reason:    sanitizeText(ins.why_it_matters ?? ""),
    actionability_confidence: Math.round((ins.action_confidence ?? 5) * 10),

    assets: {
      note: {
        title:      sanitizeText(ins.assets?.note?.title      ?? ""),
        content:    sanitizeText(ins.assets?.note?.content    ?? ""),
        confidence: ins.assets?.note?.confidence ?? 70,
        reason:     sanitizeText(ins.assets?.note?.reason     ?? ""),
      },
      task: (actionType === "inferred_action" && (ins.action_confidence ?? 0) >= 7 && ins.assets?.task)
        ? {
            title:        sanitizeText(ins.assets.task.title       ?? ""),
            description:  sanitizeText(ins.assets.task.description ?? ""),
            steps:        (ins.assets.task.steps ?? []).map(s => sanitizeText(s)).filter(Boolean),
            effort:       ins.assets.task.effort       ?? "medium",
            time_horizon: ins.assets.task.time_horizon ?? "short-term",
            confidence:   ins.assets.task.confidence ?? 70,
            reason:       sanitizeText(ins.assets.task.reason ?? ""),
          }
        : null,
      content: {
        title:    sanitizeText(ins.assets?.content?.title    ?? ""),
        hook:     sanitizeText(ins.assets?.content?.hook     ?? ""),
        angle:    sanitizeText(ins.assets?.content?.angle    ?? ""),
        audience: sanitizeText(ins.assets?.content?.audience ?? ""),
        outline:  (ins.assets?.content?.outline ?? []).map(o => sanitizeText(o)).filter(Boolean),
      },
      decision: (actionType === "strategic_move" && ins.assets?.decision)
        ? {
            title:      sanitizeText(ins.assets.decision.title      ?? ""),
            context:    sanitizeText(ins.assets.decision.context    ?? ""),
            risks:      sanitizeText(ins.assets.decision.risks      ?? ""),
            confidence: ins.assets.decision.confidence ?? 70,
          }
        : null,
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
    ? `Run the 4-stage pipeline on this video metadata:\n\n${context}`
    : `Run the 4-stage pipeline on this video:\n\nTitle: ${sanitizeText(title ?? "")}\nChannel: ${sanitizeText(channelTitle ?? "")}\n\nTranscript:\n${context}`;

  console.log(`[insights] videoId=${videoId} | usedFallback=${usedFallback}`);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature:  0.4,
    max_tokens:   4500,
  });

  const raw     = completion.choices[0].message.content ?? '{"insights":[]}';
  const cleaned = sanitizeText(raw);
  const parsed  = JSON.parse(cleaned) as ParsedResponse;

  const insights = (parsed.insights ?? []).slice(0, 3).map(sanitizeInsightRaw);

  console.log(`[insights] Returning ${insights.length} insights | action_types: ${insights.map(i => i.action_type).join(", ")}`);

  return NextResponse.json({ video_type: parsed.video_type ?? null, insights, usedFallback });
}
