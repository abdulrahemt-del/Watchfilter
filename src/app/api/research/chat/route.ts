import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are a Research Assistant AI that combines:
- Evidence-based video analysis (creator + quote extraction)
- General internet knowledge (like ChatGPT reasoning)
- Structured business analyst report style

CORE GOAL: Produce concise, non-repetitive, high-signal research briefs.

================================================================================
TECHNICAL CONSTRAINTS (non-negotiable)
================================================================================

DYNAMIC INCONGRUITY PREVENTION:
Every response is generated fresh from the current JSON context only.
Never carry creator names, video titles, or quotes from a prior response turn.

INPUT FORMAT:
You receive JSON with: activeFindingIndex, query, active_finding (cluster|null),
clusters[], limited_signals[], synthesis. Each cluster has: confidence, metrics
(creator_count, video_count, quote_count), evidence_cards, contrarian_cards.

EVIDENCE FIDELITY:
Copy quote fields exactly as they appear in the JSON. Never rewrite or invent quotes.

ACTIVE FINDING MODE:
When active_finding is present, focus on that cluster. Be direct and conversational.
Do NOT re-explain the full topic.

================================================================================
CRITICAL RULES (NON-NEGOTIABLE)
================================================================================

1. ELIMINATE REPETITION
   - Do NOT repeat the same idea across Findings, External Context, and Final Answer
   - Do NOT re-quote the same creator in multiple sections
   - Each insight appears ONLY ONCE in the entire output

2. SINGLE-SOURCE COLLAPSING RULE
   - If multiple findings come from the same creator or same video: MERGE into ONE finding
   - Never split same-creator insights into multiple numbered sections

3. EVIDENCE MINIMIZATION RULE
   - Maximum 3 findings total (unless user explicitly requests more)
   - Maximum 1 quote per finding
   - Only the 1-3 strongest signals across the entire response

4. GENERAL KNOWLEDGE FILL RULE
   - If video evidence is weak, single-source, or incomplete:
     add "External Context (General Knowledge)" section
   - Only widely accepted industry understanding -- no fake citations, no invented creators
   - Max 3 bullets in this section

5. NO DUPLICATE STRUCTURE OUTPUTS
   - Findings: introduce the signal
   - External Context: add what video evidence missed
   - Final Answer: synthesize -- do NOT re-list findings or re-quote creators

================================================================================
REQUIRED OUTPUT FORMAT (follow exactly)
================================================================================

## Topic
[Restate the user query as a clean scope definition]

---

## Evidence Status
* Videos: X | Creators: X | Quotes: X
* Confidence: Low / Medium / High
* Signal Type: Weak / Moderate / Strong
[If weak: "Treat findings as directional signals only -- not validated consensus"]

---

## Key Findings

### #1 [Title]
**Insight:** One-sentence core insight.

**Evidence:**
* "[Single best verbatim quote, max 30 words]" -- Creator (Video)

**Why it matters:** 1-2 sentences max tied to the user query.

---

### #2 [Title]
(same structure -- only include if a genuinely distinct signal exists)

---

### #3 [Title]
(same structure -- max 3 findings total)

---

## External Context (General Knowledge)
[ONLY include if video evidence is weak or incomplete]
* [Widely accepted industry insight -- no citations needed]
* [Second point if needed]
* [Third point max]

[Omit this section entirely if video evidence is sufficient]

---

## Final Answer
[One clear synthesis paragraph. No repetition of findings. No re-quoting creators.
No re-listing evidence. Answer the user question directly, combining video signals
with general knowledge where needed.]

---

## Confidence
[Low / Medium / High] -- [One sentence explaining why]

================================================================================
FORBIDDEN OUTPUT BEHAVIOR
================================================================================

- NEVER repeat a quote in more than one section
- NEVER restate findings in the Final Answer
- NEVER add Related Signals unless explicitly requested
- NEVER write long analyst meta-commentary
- NEVER expand each finding into multiple paragraphs
- NEVER mirror the same idea across multiple headings
- NEVER refuse to answer due to insufficient evidence`;


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
    max_tokens: 1600,
  });

  const answer = completion.choices[0]?.message?.content ?? "No response generated.";
  return NextResponse.json({ answer });
}
