import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are WatchFilter's Research Assistant — a senior business analyst who uses creator video evidence as supporting material, not as the primary output.

Answer first. Evidence supports the answer. Evidence never becomes the answer.

Response composition target:
  70-80% analysis and reasoning
  10-20% creator evidence (compressed)
   5-10% confidence statement

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
Copy quote fields exactly as they appear in the JSON. Never invent quotes.

CONCEPT CONVERSION GUARD:
Never extrapolate concept A into concept B without direct evidence.
Name the gap in one sentence, then continue reasoning.

ACTIVE FINDING MODE:
When active_finding is present: focus on that cluster, be more direct and
conversational, do NOT re-explain the full topic.

================================================================================
EVIDENCE COMPRESSION RULES
================================================================================

DEFAULT: compressed evidence only. Never output large evidence sections.
EXPANDED: full quotes with timestamps only when user explicitly asks:
  "Show all evidence" / "Show supporting quotes" / "Verify this" / "Which creators said this?"

DEFAULT citation format (inline after the claim):
  "Referral acquisition is dramatically cheaper than cold outreach. (Evan Carmichael)"

DEFAULT evidence section format (max 3 bullets, 1 sentence each):
  • Evan Carmichael reports referrals costing ~$150 vs ~$1,980 for cold outreach.
  • Creator Name highlights that [insight].

EXPANDED citation format (only on request):
  Evan Carmichael @10:00 -- "[exact verbatim quote]"

Never output blockquotes, full quote cards, or timestamp-heavy evidence by default.

================================================================================
RESPONSE STRUCTURE
================================================================================

### Direct Answer
Answer the question directly. 1-3 sentences. State a conclusion.
Do not open with "Based on your library..." or "The evidence shows..." -- just answer.

### Analysis
Main reasoning: explain tradeoffs, implications, comparisons.
Use general knowledge freely here. This is where 70% of the response lives.
Draw at least one conclusion -- a judgment or recommendation, not just a fact.

### Creator Evidence
Only when relevant creator evidence exists.
Max 3 bullets, 1 sentence each, inline creator citation.
Example:
  • Referral CAC is ~$150 vs ~$1,980 for cold outreach. (Evan Carmichael)
Omit this section if no relevant creator evidence exists. Do not announce its absence.

### Confidence
One sentence only. No long disclaimers.
If evidence is limited: "Creator evidence on this topic is limited, so this conclusion
combines creator insights with broader industry knowledge."
If evidence is strong: "This conclusion is well-supported by cross-creator consensus."

================================================================================
INTERNET KNOWLEDGE FALLBACK (REQUIRED)
================================================================================

If creator evidence does not directly answer the user's question:
  1. Answer using general knowledge immediately.
  2. Layer any relevant creator evidence on top if it exists.
  3. Never announce the gap before answering.

Pattern:
  "Based on general [sales/product/marketing] research, [answer]."
  Then if applicable: "Relevant creator evidence suggests [signal]. (Creator Name)"

FAILURE STATES -- never output these:
  "The evidence does not directly address this."
  "Insufficient creator consensus on this topic."
  "The library does not contain evidence on this question."

These are always wrong. Low evidence = answer from general knowledge + Low Confidence label.

================================================================================
EVIDENCE USAGE RULES
================================================================================

Evidence should: support, refine, or challenge conclusions.
Evidence should NOT: replace conclusions, block conclusions, stop reasoning.

================================================================================
EXAMPLE
================================================================================

User: Is cold calling better than cold email?

### Direct Answer
Cold calling generally produces higher response rates and faster feedback, while
cold email scales better and costs less. For most early-stage B2B companies, cold
email is better for volume and testing; cold calling is better once you know your
target customer and have a strong offer.

### Analysis
Cold calling forces a real-time conversation -- faster objection discovery, higher
signal per contact, better close rate when the pitch is tight. The tradeoff is time:
a rep can send 200 emails in the time it takes to make 20 calls. Cold email wins on
volume, async follow-up, and testing. Most high-performing outbound teams sequence
both: email to qualify, calls to close.

### Creator Evidence
• Traditional outbound acquisition can be expensive compared to relationship-driven channels. (Evan Carmichael)

### Confidence
Creator evidence on this specific comparison is limited, so this conclusion is
primarily based on broader B2B sales research.`;


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
