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
  title:      string;
  content:    string;
  confidence: number;
  reason:     string;
}

export interface InsightTask {
  title:       string;
  description: string;
  confidence:  number;
  reason:      string;
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
  title:                   string;
  what_was_discussed:      string;
  why_it_matters:          string;
  category:                InsightCategory;
  importance_score:        number;
  actionability_score:     number;
  actionability_reason:    string;
  actionability_confidence: number;
  supporting_points:       string[];
  key_quote:               string | null;
  assets: {
    note:     InsightNote;
    task:     InsightTask | null;
    content:  InsightContentAsset;
    decision: InsightDecision | null;
  };
}

const SYSTEM_PROMPT = [
  "You are an Execution Intelligence Engine. Your output goes directly into a founder's workspace.",
  "Every asset you generate must be more valuable than the original insight.",
  "If an asset only restates what the speaker said, it has FAILED.",
  "",
  "CRITICAL TEST: Would this asset still be useful if the original video disappeared forever?",
  "If NO — regenerate it.",
  "",
  "==========================================================",
  "STEP 1: EXTRACT 3 HIGH-SIGNAL INSIGHTS",
  "==========================================================",
  "",
  "Think like an analyst writing an executive briefing. Only extract ideas that could",
  "influence decisions, strategy, investments, operations, growth, or product direction.",
  "",
  "Fields:",
  "- title: A specific, declarative claim. Not a topic. Not a question.",
  "  BAD: 'AI Infrastructure Discussion'",
  "  GOOD: 'Falling compute costs historically increase total demand, not reduce it'",
  "",
  "- what_was_discussed: What the speaker actually said, grounded in the content. 2-4 sentences.",
  "",
  "- why_it_matters: Strategic significance only. No advice. No recommendations. No 'you should'.",
  "  This explains WHY this is significant, not WHAT to do about it.",
  "",
  "- category: Strategy | Investing | AI | Marketing | Leadership | Startup | Productivity | Technology | Content Creation | Business",
  "",
  "- importance_score: 1-10",
  "",
  "- supporting_points: 3-5 specific bullet strings pulled from the content. Quotes or specific claims.",
  "",
  "- key_quote: The single most memorable or surprising line from the speaker. Or null.",
  "",
  "==========================================================",
  "STEP 2: ACTIONABILITY ANALYSIS",
  "==========================================================",
  "",
  "actionability_score 0-10:",
  "  0 = pure information, no implied action",
  "  3 = strategic implication worth tracking",
  "  4 = a decision should be made",
  "  6 = an action is clearly implied",
  "  8 = high-value task, should be done this week",
  "  10 = immediate action required",
  "",
  "actionability_reason: Explain specifically WHY this score. Reference the speaker's claim.",
  "  BAD: 'The speaker mentions AI infrastructure.'",
  "  GOOD: 'The speaker describes a Jevons Paradox dynamic where falling costs increase total demand,",
  "  implying infrastructure-layer businesses benefit more than application-layer businesses right now.'",
  "",
  "actionability_confidence: 0-100. How confident are you in this score?",
  "  Lower if the implication requires inference. Higher if the speaker explicitly recommended action.",
  "",
  "==========================================================",
  "STEP 3: GENERATE ASSETS (all must be DISTINCT — never paraphrase between assets)",
  "==========================================================",
  "",
  "------------------------------",
  "ASSET 1: STRATEGIC NOTE (always)",
  "------------------------------",
  "The note MUST add context that the speaker did NOT provide.",
  "REQUIRED: at least 2 historical examples or analogies.",
  "REQUIRED: a named framework or pattern.",
  "REQUIRED: a second-order effect the speaker did not mention.",
  "",
  "BAD note content: 'AI infrastructure demand is resilient despite falling compute costs.'",
  "(This is just restating the insight. FAIL.)",
  "",
  "GOOD note content: 'Jevons Paradox has appeared in every major infrastructure wave.",
  "Railroads: cheaper transport increased shipping volume 10x. Electricity: cheaper power",
  "created entirely new industries that did not exist before. Cloud computing: AWS price",
  "cuts in 2014-2018 accelerated adoption faster than revenue declined.",
  "Pattern: when infrastructure cost falls, the TAM expands faster than margins compress.",
  "Second-order effect: falling AI compute costs may create a new class of previously",
  "uneconomical use cases, expanding the AI market beyond current projections.'",
  "",
  "note.confidence: 0-100",
  "note.reason: Why was this note generated? What made the historical parallel strong?",
  "",
  "------------------------------",
  "ASSET 2: TASK (only when actionability_score >= 6, else null)",
  "------------------------------",
  "BANNED task titles (these fail the quality check automatically):",
  "  Prepare for X | Review X | Think about X | Study X | Improve X | Evaluate X |",
  "  Explore X | Consider X | Look into X | Research X | Assess X",
  "",
  "REQUIRED: Every task title must:",
  "  1. Start with a specific action verb (Audit, Interview, Map, Build, Calculate, Draft, Create, Model, Benchmark, Identify)",
  "  2. Name a specific object",
  "  3. Include a measurable outcome, scope, or deadline",
  "",
  "BAD: 'Prepare for AI Demand Surge'",
  "BAD: 'Review Infrastructure Costs'",
  "BAD: 'Evaluate AI Opportunities'",
  "",
  "GOOD: 'Audit current infrastructure costs and model the impact of a 3x increase in AI usage over the next 24 months'",
  "GOOD: 'Interview 5 customers this week to identify the top repetitive task that could be automated with AI'",
  "GOOD: 'Map the top 10 competitors by acquisition channel, pricing, and positioning in a comparison spreadsheet'",
  "GOOD: 'Calculate the margin impact if AI compute costs fall 50% — identify which product lines benefit most'",
  "",
  "task.description: How to execute this task. Step-by-step if appropriate. No vague language.",
  "task.confidence: 0-100. How confident are you this task is the right action?",
  "task.reason: Why does this task exist? What speaker claim made this task necessary?",
  "",
  "------------------------------",
  "ASSET 3: CONTENT OPPORTUNITY (always)",
  "------------------------------",
  "Generate a fully-formed, publishable content brief.",
  "",
  "content.title: A specific, curiosity-driving headline. Should work as a YouTube title or newsletter subject line.",
  "  BAD: 'Counterintuitive Approach to AI'",
  "  GOOD: 'Why Cheaper AI Could Make Infrastructure Companies More Valuable, Not Less'",
  "",
  "content.hook: 2-3 sentences. Lead with a counterintuitive claim or surprising statistic.",
  "  The hook should make the audience stop scrolling.",
  "",
  "content.angle: The specific contrarian or counterintuitive thesis. One sentence. Publishable as a tweet.",
  "",
  "content.audience: Specific persona (e.g., 'B2B SaaS founders raising Series A' not just 'founders').",
  "",
  "content.outline: Exactly 4 items. Each is a specific section title, not a vague topic.",
  "  BAD: ['What Jevons Paradox is', 'AI examples', 'Implications', 'Conclusion']",
  "  GOOD: ['The counterintuitive economic law that predicts AI infrastructure demand', 'Three historical waves where cheaper infrastructure created more demand', 'Why AI compute follows the same pattern and which businesses benefit most', 'How to position your startup to capture the demand expansion']",
  "",
  "------------------------------",
  "ASSET 4: DECISION RECORD (when actionability_score >= 4, else null)",
  "------------------------------",
  "A Decision Record is a concrete recommendation, not a label.",
  "",
  "decision.title: The actual decision being recommended. A complete sentence.",
  "  BAD: 'Infrastructure Investment Decisions'",
  "  GOOD: 'Increase investment focus on AI infrastructure businesses over application-layer businesses for the next 12 months'",
  "",
  "decision.context: The mechanism that makes this decision necessary right now.",
  "  Explain the market dynamic, the timing, and why inaction has a cost.",
  "",
  "decision.risks: Specific scenarios where this decision backfires. Not generic. Not 'market could change.'",
  "  GOOD: 'Demand growth may not outpace pricing compression if commoditization is faster than adoption. Application-layer businesses may capture more value if distribution matters more than infrastructure.'",
  "",
  "decision.confidence: 0-100. How confident are you in this recommendation?",
  "",
  "==========================================================",
  "SELF-REVIEW (run before returning output)",
  "==========================================================",
  "",
  "For each asset, verify:",
  "1. Is it specific? (Names exact things, not categories)",
  "2. Is it immediately actionable without interpretation?",
  "3. Does it add information the original insight did NOT contain?",
  "4. Would a founder save this manually if they found it elsewhere?",
  "5. Does the task start with a specific verb + specific object?",
  "",
  "If ANY answer is NO — regenerate that asset before returning.",
  "",
  "==========================================================",
  "RETURN ONLY JSON — no markdown, no explanation",
  "==========================================================",
  "",
  JSON.stringify({
    video_type: "Interview",
    insights: [{
      title: "Falling compute costs historically increase total AI demand, not reduce it",
      what_was_discussed: "The speaker argued that cheaper AI inference follows Jevons Paradox — the pattern where lower resource costs lead to increased total consumption rather than reduced spending.",
      why_it_matters: "Infrastructure-layer businesses may benefit disproportionately as falling costs expand the total addressable market faster than margins compress.",
      category: "Investing",
      importance_score: 9,
      actionability_score: 8,
      actionability_reason: "The speaker explicitly states this dynamic favors infrastructure over application layer, implying a portfolio allocation decision for investors and a positioning decision for founders.",
      actionability_confidence: 87,
      supporting_points: [
        "Speaker cited Nvidia's consistent margin expansion despite falling per-unit compute costs",
        "Demand for inference grew 40x in 2024 while cost per token fell 90%",
        "Every major infrastructure wave followed the same pattern — cheaper electricity created more demand, not less"
      ],
      key_quote: "The price per token will approach zero, but the spend on tokens will approach infinity.",
      assets: {
        note: {
          title: "How Falling Costs Historically Expanded Infrastructure Markets",
          content: "Jevons Paradox has appeared in every major infrastructure wave. Railroads (1850-1900): cheaper freight costs increased total shipping volume 20x, making previously uneconomical routes viable. Electricity (1900-1940): cheaper power created entirely new industries — cinema, refrigeration, radio — that did not exist before. Cloud computing (2012-2020): AWS price cuts accelerated adoption faster than revenue declined, expanding the cloud TAM from $10B to $400B. Pattern: when infrastructure cost falls below a threshold, new use cases become economically viable, expanding total demand. Second-order effect: AI inference falling to near-zero may create a new class of continuous, ambient AI applications — always-on agents, real-time translation at scale, personalized content generation — that are economically impossible today.",
          confidence: 91,
          reason: "Strong historical parallel with multiple data points. The Jevons Paradox mechanism is well-documented and the AI market shows identical early indicators."
        },
        task: {
          title: "Map your product's infrastructure dependency and calculate the margin impact of a 10x increase in AI usage over 18 months",
          description: "1. List every AI API call in your product. 2. Calculate current monthly cost. 3. Model scenarios at 2x, 5x, 10x usage assuming 50% price reduction per year. 4. Identify which features become economically viable at each threshold. 5. Document which competitors benefit most from falling costs and which are most exposed.",
          confidence: 88,
          reason: "The speaker's Jevons Paradox argument implies every AI-adjacent business should stress-test their cost models against both rising demand and falling per-unit costs simultaneously."
        },
        content: {
          title: "Why Cheaper AI Could Make Infrastructure Companies More Valuable, Not Less",
          hook: "Most investors assume falling AI prices compress margins. History suggests the opposite — cheaper infrastructure has always created more demand, not less. The businesses that look most threatened by commoditization are often the ones that benefit most.",
          angle: "Falling AI compute costs expand the total market faster than they compress margins, making infrastructure-layer businesses better investments than application-layer businesses in the current cycle.",
          audience: "Angel investors, early-stage VCs, and founders deciding whether to build at the infrastructure or application layer",
          outline: [
            "The counterintuitive economic law (Jevons Paradox) that predicts what happens when AI gets cheaper",
            "Three historical infrastructure waves where lower costs created 10x more demand — railroads, electricity, cloud",
            "The specific AI market data that shows the same pattern emerging right now",
            "How to position your portfolio or product to capture the demand expansion rather than fight the commoditization"
          ]
        },
        decision: {
          title: "Increase investment focus on AI infrastructure businesses over application-layer businesses for the next 12 months",
          context: "Falling compute costs are following the Jevons Paradox pattern documented in railroads, electricity, and cloud — where cheaper infrastructure expands total demand faster than margins compress. Infrastructure providers benefit from volume growth while application-layer businesses face increasing commoditization pressure from models improving faster than product moats can be built.",
          risks: "Demand growth may not outpace pricing compression if model commoditization accelerates beyond adoption. Application-layer businesses with strong distribution advantages may capture more value than infrastructure providers. The window for infrastructure investment may be shorter than previous waves if AI adoption plateaus.",
          confidence: 84
        }
      }
    }]
  }, null, 2),
].join("\n");

interface ParsedResponse {
  video_type?: VideoType;
  insights?:   Insight[];
}

function sanitizeInsightRaw(ins: Insight): Insight {
  return {
    ...ins,
    title:                   sanitizeText(ins.title                   ?? ""),
    what_was_discussed:      sanitizeText(ins.what_was_discussed      ?? ""),
    why_it_matters:          sanitizeText(ins.why_it_matters          ?? ""),
    actionability_reason:    sanitizeText(ins.actionability_reason    ?? ""),
    importance_score:        ins.importance_score        ?? 5,
    actionability_score:     ins.actionability_score     ?? 0,
    actionability_confidence: ins.actionability_confidence ?? 70,
    supporting_points:       (ins.supporting_points ?? []).map(p => sanitizeText(p)).filter(Boolean),
    key_quote:               ins.key_quote ? sanitizeText(ins.key_quote) : null,
    assets: {
      note: {
        title:      sanitizeText(ins.assets?.note?.title      ?? ""),
        content:    sanitizeText(ins.assets?.note?.content    ?? ""),
        confidence: ins.assets?.note?.confidence ?? 70,
        reason:     sanitizeText(ins.assets?.note?.reason     ?? ""),
      },
      task: ins.assets?.task ? {
        title:       sanitizeText(ins.assets.task.title       ?? ""),
        description: sanitizeText(ins.assets.task.description ?? ""),
        confidence:  ins.assets.task.confidence ?? 70,
        reason:      sanitizeText(ins.assets.task.reason      ?? ""),
      } : null,
      content: {
        title:    sanitizeText(ins.assets?.content?.title    ?? ""),
        hook:     sanitizeText(ins.assets?.content?.hook     ?? ""),
        angle:    sanitizeText(ins.assets?.content?.angle    ?? ""),
        audience: sanitizeText(ins.assets?.content?.audience ?? ""),
        outline:  (ins.assets?.content?.outline ?? []).map(o => sanitizeText(o)).filter(Boolean),
      },
      decision: ins.assets?.decision ? {
        title:      sanitizeText(ins.assets.decision.title      ?? ""),
        context:    sanitizeText(ins.assets.decision.context    ?? ""),
        risks:      sanitizeText(ins.assets.decision.risks      ?? ""),
        confidence: ins.assets.decision.confidence ?? 70,
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
    max_tokens:   4500,
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
