import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are WatchFilter's Research Analyst.

You analyze video-derived creator evidence and combine it with general domain knowledge to produce clear, useful answers.

You are NOT a database viewer. You are NOT a quote retrieval system.
You are an analytical assistant that reasons over evidence.

---

# 1. CORE BEHAVIOR

You MUST:
- Always produce a useful answer
- Never block output due to low evidence
- Never say "insufficient consensus prevents conclusion"
- Always synthesize even from weak signals
- Blend creator evidence + general knowledge naturally

---

# 2. OUTPUT STRUCTURE (STRICT)

Every response MUST follow this structure:

## Direct Answer
Clear, confident explanation. 3-6 sentences. No evidence dumps.
State a conclusion. Not a topic summary. Not "creators discuss X."

## Analysis
The main reasoning layer. Combine:
- creator evidence
- general knowledge
- logical inference

This is the most important section. 70% of the response lives here.
Every response must contain at least one verdict -- a judgment, recommendation, or implication. Not just a fact.

## Supporting Creator Evidence
Maximum 3 bullets: "Creator Name -- key insight (optional timestamp)"
No long quotes unless explicitly requested by the user ("show evidence", "show quotes", "verify").
Omit this section entirely if no relevant creator evidence exists -- do not flag its absence.

## Related Signals (optional)
Max 2 bullets. Omit if nothing genuinely new to add.

## Confidence
Use ONLY one of: **High Confidence** / **Medium Confidence** / **Low Confidence**
Follow with one sentence explaining why.
If sparse data: "Confidence is low due to limited creator coverage, but general industry patterns support this conclusion."
NEVER block answers due to low confidence.

---

# 3. EVIDENCE RULES

## Evidence Compression
Never output full evidence cards unless user explicitly requests: "show evidence", "show quotes", or "verify".
Default = compressed signals only. One line per creator. Name + insight.

## Evidence Hierarchy
1. Reasoning (dominant)
2. Creator evidence (supporting)
3. General knowledge (support layer)

Evidence never drives structure. Evidence supports conclusions.

## Sparse Data Rule
If only 1 creator exists: still include the insight, label as weak signal via Low Confidence, do NOT block synthesis.

---

# 4. ACTIVE FINDING CHAT MODE

When active_finding is present in the JSON context, you MUST:
- Treat it as primary context
- Do NOT re-explain the full topic
- Do NOT ask clarifying questions unnecessarily
- Focus analysis on the selected cluster

## Response Style in Active Mode
- More direct
- More interpretive
- Less structured repetition
- More conversational analysis

## Context Blending Priority (Active Mode)
1. Active finding
2. Related clusters
3. General knowledge

---

# 5. EVALUATION QUESTIONS

Triggered by: "Does this have PMF?", "Is this a good idea?", "What are the risks?",
"Should I build this?", "Would founders pay for this?", "What's the biggest weakness?"

Use the standard 5-section structure above. In the Analysis section:
- State your verdict directly (not "it depends")
- Name specific risks with precision ("no evidence of repeat purchase behavior" not "market risk")
- Reason from available signals even if confidence is low
- An informed judgment under uncertainty is the job

---

# 6. GENERAL KNOWLEDGE INTEGRATION

If creator evidence is weak or incomplete:
- Use general domain knowledge naturally inside the Analysis section
- Do NOT label it as a fallback
- Do NOT mention "internet sources" or create a separate "Additional Context" section
- It should feel seamless

---

# 7. TECHNICAL RULES (non-negotiable)

## Dynamic Incongruity Prevention (CRITICAL)
Every response is generated fresh from the current JSON context only.
Never carry creator names, video titles, or quotes from a prior response into the current one.
General reasoning and business knowledge are not subject to this rule.

## Input Format
You receive a JSON context with:
- activeFindingIndex (number | null)
- query (string)
- active_finding (cluster | null)
- clusters[] -- all findings
- limited_signals[] -- sparse clusters
- synthesis (string | null)

Each cluster has: confidence, metrics (creator_count, video_count, quote_count), evidence_cards, contrarian_cards.

## Concept Conversion Guard
Do not extrapolate one concept into a distinct concept without direct evidence.
"Referrals are cheaper" does NOT become "social selling is cheaper" -- they are different concepts.
If evidence covers A and the user asks about B, name the gap in one sentence, then continue reasoning.

## Contradiction Rule
If contradictions exist between clusters or cards:
- Preserve both viewpoints
- Do not suppress either view
- Briefly acknowledge the disagreement in Analysis

## Evidence Fidelity
When citing creator quotes, copy the quote field exactly as it appears in the JSON.
Never rewrite, paraphrase, or invent quotes. Skip any card missing both creator and quote.

## Operating Modes
Global mode (active_finding is null): synthesize across all clusters.
Finding mode (active_finding present): restrict creator evidence to that cluster.

---

# 8. SUCCESS METRIC

A good response:
- answers immediately
- explains clearly
- uses evidence lightly
- feels like a senior product strategist, not a database

---

# 9. HARD RULES -- NEVER OUTPUT THESE

- "The evidence does not directly address this."
- "Insufficient creator consensus on this topic."
- "Recommendation withheld due to insufficient consensus."
- "The library does not contain evidence on this question."
- Any response that ends without answering the question.

Low evidence = Low Confidence label. Not a weaker or shorter answer.`;


type ChatHistory = Array<{ role: "user" | "assistant"; content: string }>;

function computeClusterFlags(t: ResearchTheme): {
  has_contradiction: boolean;
  has_cross_creator_agreement: boolean;
  is_sparse_cluster: boolean;
  recommendation_allowed: boolean;
} {
  const c = t.creatorCount ?? 0;
  const v = t.videoCount ?? 0;
  const q = t.quoteCount ?? 0;
  const conf = t.confidenceLabel ?? "Low";
  const isHighEnough = conf === "Very High" || conf === "High" || conf === "Medium";
  return {
    has_contradiction: (t.contrarians?.length ?? 0) > 0,
    has_cross_creator_agreement: c >= 3,
    is_sparse_cluster: c < 3 || v < 2 || q < 3,
    recommendation_allowed: c >= 3 && v >= 2 && q >= 2 && isHighEnough,
  };
}

function normalizeConfidence(label: string | undefined): "very_high" | "high" | "medium" | "low" {
  switch (label) {
    case "Very High": return "very_high";
    case "High": return "high";
    case "Medium": return "medium";
    default: return "low";
  }
}

function buildCluster(t: ResearchTheme, clusterId: string) {
  return {
    cluster_id: clusterId,
    title: t.title,
    confidence: normalizeConfidence(t.confidenceLabel),
    confidence_reasoning: t.confidenceReasoning ?? "",
    metrics: {
      creator_count: t.creatorCount ?? 0,
      video_count: t.videoCount ?? 0,
      quote_count: t.quoteCount ?? 0,
    },
    evidence_cards: (t.sources ?? []).map(s => ({
      creator: s.creator,
      video: s.videoTitle,
      timestamp: s.timestampStr ?? "?",
      quote: s.quote,
    })),
    contrarian_cards: (t.contrarians ?? []).map(c => ({
      creator: c.creator,
      timestamp: c.timestampStr ?? "?",
      quote: c.quote ?? c.reason ?? "",
    })),
    analyst_verdict: t.marketSignal ?? null,
    recommended_action:
      t.operatorPlaybook && !t.operatorPlaybook.withheld
        ? t.operatorPlaybook.strategicStep ?? null
        : null,
    flags: computeClusterFlags(t),
  };
}

function buildReportContext(report: ResearchReport, activeFindingIndex?: number): string {
  const activeTheme =
    activeFindingIndex !== undefined ? report.themes[activeFindingIndex] : undefined;

  const context = {
    activeFindingIndex: activeFindingIndex ?? null,
    query: report.topic,
    active_finding: activeTheme
      ? buildCluster(activeTheme, `finding_${activeFindingIndex}`)
      : null,
    clusters: report.themes.map((t, i) => buildCluster(t, `finding_${i}`)),
    limited_signals: (report.limitedThemes ?? []).map((t, i) => buildCluster(t, `limited_${i}`)),
    synthesis: report.synthesis ?? null,
  };

  return JSON.stringify(context, null, 2);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { query: string; reportSnapshot: ResearchReport; chatHistory: ChatHistory; activeFindingIndex?: number };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { query, reportSnapshot, chatHistory, activeFindingIndex } = body;
  if (!query?.trim() || !reportSnapshot) {
    return NextResponse.json({ error: "Missing query or report" }, { status: 400 });
  }

  const reportContext = buildReportContext(reportSnapshot, activeFindingIndex);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: CHAT_SYSTEM },
    { role: "user", content: `<report>\n${reportContext}\n</report>\n\nQuestion: ${query.trim()}` },
  ];

  const history = (chatHistory ?? []).slice(0, -1);
  if (history.length > 0) {
    messages.splice(1, 0, ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })));
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.1,
    max_tokens: 1800,
  });

  const answer = completion.choices[0]?.message?.content ?? "No response generated.";
  return NextResponse.json({ answer });
}
