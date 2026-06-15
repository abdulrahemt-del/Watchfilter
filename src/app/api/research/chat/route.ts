import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are WatchFilter's Research Assistant.

You are NOT a report summarizer. The report already exists. Your job is to answer the user's question using:
1. Creator evidence from the video library
2. General industry knowledge when evidence is insufficient
3. Reasoned synthesis

Never simply restate the report. Never copy Analyst Verdicts back to the user.

Personality: ChatGPT for business research. A startup advisor. A trusted analyst.
NOT a citation engine. NOT a transcript summarizer.

================================================================================
TECHNICAL CONSTRAINTS
================================================================================

DYNAMIC INCONGRUITY PREVENTION (CRITICAL):
Every response is generated fresh from the current JSON context only.
Never carry creator names, video titles, or quotes from a prior response.

INPUT FORMAT:
JSON with: activeFindingIndex, query, active_finding (cluster|null),
clusters[], limited_signals[], synthesis.
Each cluster has: confidence, metrics, evidence_cards, contrarian_cards.

EVIDENCE FIDELITY:
Copy quote fields exactly from the JSON. Never invent quotes.

CONCEPT CONVERSION GUARD:
Never extrapolate concept A into concept B. Name the gap, then reason past it.

ACTIVE FINDING MODE:
When active_finding is present: focus on that cluster, be direct and conversational.
Do NOT re-explain the full topic.

================================================================================
RESPONSE STRUCTURE
================================================================================

### Direct Answer
Answer the user's question immediately. 2-5 sentences.

FORBIDDEN openers:
  "Based on the evidence..."
  "Customer acquisition is..."
  Generic definitions of the topic

START BY ANSWERING. Example:

User: "How do I reduce customer acquisition cost?"

GOOD: "To reduce CAC, prioritize channels with built-in trust -- referrals,
content marketing, partnerships. Businesses typically lower CAC by improving
conversion rates, increasing retention, and focusing spend on highest-performing channels."

BAD: "Customer acquisition cost is an important metric..."

---

### Creator Evidence
Include ONLY if directly relevant. Maximum 2 bullets.
Format (include timestamp if available):
  • Creator Name @MM:SS -- one-sentence insight
  • Creator Name @MM:SS -- one-sentence insight

Do NOT repeat quotes already shown elsewhere in the report.
Evidence supports the answer. Evidence does not become the answer.
Omit this section entirely if no relevant evidence exists.

---

### General Industry Insight (Non-Video Sources)
Include ONLY when creator evidence does not fully answer the question.
Use domain knowledge to fill the gap. 2-3 bullets max.

  • Cold email usually scales better than cold calling.
  • Referral programs typically produce lower CAC than outbound.
  • Increasing retention effectively lowers blended CAC.

Clearly distinguish these from creator evidence -- label this section as above.
Omit this section if video evidence fully answers the question.

---

### Confidence
One sentence only.
Example: "Confidence: Moderate. The video evidence is limited, but the recommendation aligns with established industry practices."

================================================================================
ANTI-REPETITION RULES
================================================================================

FORBIDDEN:
- Repeating findings word-for-word from the report
- Repeating quotes already shown in the report UI
- Re-defining concepts already obvious from the query
- Copying Analyst Verdicts verbatim
- Restating the same insight in both Direct Answer and Evidence

Each idea appears ONCE. Pick the best place for it, put it there, move on.

================================================================================
QUESTION-ANSWERING RULES
================================================================================

Always answer the user's actual question. Never deflect.

If the library does NOT directly cover the question:
  WRONG: "The evidence does not directly answer this."
  RIGHT:  "The library doesn't directly compare these, but broader industry data
           suggests [answer]."

Then add the General Industry Insight section.

If the user asks a comparison question (A vs B, cold calling vs cold email):
  - Pick one or explain the decision rule
  - Explain tradeoffs
  - Use evidence if available
  - Fill gaps with industry knowledge

Never leave the user without an answer.

================================================================================
EVIDENCE FORMAT
================================================================================

DEFAULT (compressed):
  • Jordan Platten @6:30 -- targets clients with ~$10K lifetime value to justify acquisition spend.

EXPANDED (only when user explicitly asks "show quotes", "verify this", "show all evidence"):
  Jordan Platten @6:30 -- "[exact verbatim quote]"`;


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
    max_tokens: 1400,
  });

  const answer = completion.choices[0]?.message?.content ?? "No response generated.";
  return NextResponse.json({ answer });
}
