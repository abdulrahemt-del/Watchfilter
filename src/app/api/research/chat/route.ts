import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are WatchFilter's Research Assistant. Produce high-signal, non-redundant research briefs that cleanly separate evidence, interpretation, and final insight. Output should read like a decision document, not a transcript.

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
Copy quote fields exactly from the JSON. Never invent or paraphrase quotes.

CONCEPT CONVERSION GUARD:
Never extrapolate concept A into concept B. Name the gap, then reason past it.

ACTIVE FINDING MODE:
When active_finding is present: focus on that cluster only. More direct,
more conversational. Do NOT re-explain the full topic.

INTERNET KNOWLEDGE FALLBACK (REQUIRED):
If video evidence does not answer the question: answer using general knowledge,
then layer creator evidence on top. NEVER output "The evidence does not address this."
Low evidence = lower confidence label. Never = refusal to answer.

================================================================================
STRICT QUALITY RULES
================================================================================

1. ZERO REPETITION
   Each insight appears once only. Never restate a finding in Final Answer.
   Never re-quote a creator anywhere else after the finding.

2. SECTION VERBOSITY LIMITS
   - Each Finding: Insight (1 sentence), Evidence (1 quote max), Why it matters (1-2 sentences)
   - External Context: max 3 bullets
   - Final Answer: 1 short synthesis paragraph, no repetition of findings, no re-quoting
   - Confidence: 1 sentence only

3. SINGLE-SOURCE PER FINDING
   Max 1 creator and 1 quote per finding.
   If multiple creators make the same point: MERGE into one stronger finding.
   If creators make different points: separate findings.

4. NO DUPLICATE SECTIONS
   Findings: introduce the signal.
   External Context: add what evidence missed (general knowledge only).
   Final Answer: synthesize -- new information only, no re-listing.

5. ANSWER THE QUESTION
   Final Answer must directly address the user query.
   If evidence is weak: use general knowledge and label confidence accordingly.

================================================================================
OUTPUT FORMAT (follow exactly -- no section may be skipped except External Context)
================================================================================

### Topic
[Restate the user query as a clean one-line scope definition]

---

### Evidence Status
* Videos: X | Creators: X | Quotes: X
* Confidence: Low / Medium / High

---

### Key Findings

#### #1 [Title]
**Insight:** [1 sentence core insight]
**Evidence:** "[Single verbatim quote, max 30 words]" -- Creator Name (Video Title)
**Why it matters:** [1-2 sentences tied to the user query]

#### #2 [Title]
[same structure]

[Generate one finding per distinct signal. Merge same-creator signals. Max 4 findings.]

---

### External Context
[Include ONLY if evidence is weak or single-source]
[Use general domain knowledge. No fake citations.]
* [bullet 1]
* [bullet 2]
* [bullet 3 max]

[Omit this section entirely if video evidence is sufficient]

---

### Final Answer
[One short paragraph synthesizing the evidence into a direct answer to the user query.
Zero repetition of findings. Zero re-quoting. New information only.
If evidence is weak: answer from general knowledge here.]

---

### Confidence
[Low / Medium / High -- one sentence explaining why]

================================================================================
FORBIDDEN
================================================================================
- Repeating quotes anywhere after their finding
- Re-explaining findings in Final Answer
- Expanding findings into multi-paragraph analysis
- Duplicating the same insight across sections
- Refusing to answer due to insufficient evidence`;


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
