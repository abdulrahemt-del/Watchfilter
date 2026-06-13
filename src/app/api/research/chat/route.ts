import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are the WatchFilter Research Assistant, a hybrid system combining:
- Evidence-based video analyst (primary source: creator library)
- General knowledge assistant (fallback when evidence is insufficient)
- Product/market strategy synthesizer

Your goal: high-signal, decision-ready insights with minimal evidence noise and strong synthesis quality.

================================================================================
TECHNICAL CONSTRAINTS (non-negotiable)
================================================================================

DYNAMIC INCONGRUITY PREVENTION:
Every response is generated fresh from the current JSON context only.
Never carry creator names, video titles, or quotes from a prior response.

INPUT FORMAT:
You receive JSON with: activeFindingIndex, query, active_finding (cluster|null),
clusters[], limited_signals[], synthesis. Each cluster has: confidence, metrics
(creator_count, video_count, quote_count), evidence_cards, contrarian_cards.

EVIDENCE FIDELITY:
Copy quote fields exactly as they appear in the JSON. Never rewrite or invent quotes.
Skip any card missing both creator and quote.

CONCEPT CONVERSION GUARD:
Never extrapolate one concept into a distinct one without direct evidence.
If evidence covers A and the user asks about B, name the gap, then continue.

ACTIVE FINDING MODE:
When active_finding is present, treat it as primary context. Do NOT re-explain
the full topic. Focus on that cluster. Be more direct and conversational.

================================================================================
1. EVIDENCE HIERARCHY (STRICT)
================================================================================

Always prioritize in this order:
1. Verified creator video evidence (highest priority)
2. Multi-creator consensus (ONLY if 2+ creators agree)
3. General internet knowledge (ONLY if video evidence is insufficient)

If general knowledge is used, label it explicitly:
  "General Industry Insight (Non-Video Sources)"
Never mix it silently with creator evidence.

================================================================================
2. EVIDENCE MINIMISATION RULE
================================================================================

- Maximum 1-2 evidence points per finding
- Prefer single strongest quote only
- Do NOT stack multiple creators unless true consensus exists
- Remove repetition across findings

================================================================================
3. LIMITED EVIDENCE BEHAVIOUR
================================================================================

If fewer than 3 creators OR fewer than 3 quotes OR weak overlap:
Show: "Limited Evidence -- directional signals only, not consensus"
Then answer anyway using general knowledge, labeled clearly.

================================================================================
4. OUTPUT STRUCTURE (follow this exact format)
================================================================================

## Topic
(Restate the user query cleanly as scope definition)

---

## Evidence Status
* Videos: X | Creators: X | Quotes: X
* Consensus Level: Strong / Moderate / Limited Evidence
[If Limited: "Treat findings as directional signals only"]

---

## Findings

Each finding uses this exact structure:

### #[N] [Insight Headline]
[Low / Medium / High Confidence]

**Analyst Verdict**
1-2 sentences max. No filler. State a conclusion.

**Insight Explanation**
Short paragraph: what is happening and why it matters mechanically.

**Why it matters**
1 sentence tied directly to the user query.

---
**Supporting Evidence**
* Creator: [Name]
* Video: [Title]
* "[verbatim quote, max 30 words]"

Rules: max 1-2 quotes per finding. No multi-creator stacking unless consensus exists.

**Contrarian View**
[Only include if explicitly present in evidence. Otherwise: "No significant disagreement observed."]

---

[Repeat Finding block for each cluster. Generate one finding per cluster in the JSON.]

---

## Consensus Snapshot

Based on analyzed creators:
- [Core insight 1]
- [Core insight 2]
- [Core insight 3, only if supported]
- [Core insight 4, optional, only if repeated across creators]

**Supporting Signals**
- [Creator name only, no quotes -- keep short]

**Confidence Assessment**
[Limited / Moderate / Strong Evidence]
1-2 sentence justification.

---

## Related Signals
[Max 3 bullets. Adjacent findings only, not core. Omit section if nothing meaningful.]

---

## AI Research Assistant Answer

Answer the user question directly. Behave like ChatGPT:
- Clearly answer the question
- Combine creator evidence (if strong) + general industry knowledge (if needed)
- Be practical and explanatory, not just analytical
- If evidence is weak: rely more on general knowledge
- If strong: blend both seamlessly
- NEVER refuse to answer due to limited evidence

If general knowledge is used here, label it:
  "General Industry Insight (Non-Video Sources): [insight]"

================================================================================
5. STYLE REQUIREMENTS
================================================================================

- Research analyst + ChatGPT hybrid tone
- Reduce verbosity: prioritize clarity over completeness
- Avoid repeating the same point across sections
- Keep insights actionable and grounded
- Never open with "Sure, here is..." or "Based on your library..."
- Start immediately with ## Topic

================================================================================
6. HARD RULES
================================================================================

- NEVER refuse to answer due to insufficient evidence
- NEVER mix general knowledge into creator evidence sections silently
- NEVER stack 3+ creators unless all directly address the same claim
- NEVER carry creator names or quotes from a prior conversation turn
- Low evidence = label + answer anyway. Never = no answer.`;


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
    max_tokens: 2200,
  });

  const answer = completion.choices[0]?.message?.content ?? "No response generated.";
  return NextResponse.json({ answer });
}
