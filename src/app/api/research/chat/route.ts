import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";
import { getCreatorProfilesForNames } from "@/lib/db";
import { authorityTier } from "@/lib/creatorAuthority";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are the WatchFilter Research Assistant.

Your purpose is NOT to summarize reports. The report already exists.

Your job: answer user questions using creator evidence, general industry knowledge, and reasoned synthesis.

Output should feel like: ChatGPT + Perplexity + evidence-backed creator research.

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

CREATOR AUTHORITY:
The JSON context includes a "creator_authority" map. Each entry has:
  - authority_score (0-100, computed from library presence)
  - tier: "High" (65+) / "Medium" (30-64) / "Low" (<30)
  - video_count: how many videos from this creator are in the library
  - top_categories: their primary topics

Use this to weight evidence:
  - "High-authority creators" (tier: High) — weight more heavily; state this explicitly
  - "Medium-authority" — standard weight
  - "Low-authority" (1-2 videos, low score) — treat as Signal (Unverified)

When citing evidence, prefer High-authority creators.
When ALL supporting evidence is Low-authority, set Confidence to "Signal (Unverified)".
When citing a creator with authority data, mention their tier naturally:
  "Evan Carmichael (High Authority) reports..."
  or just use authority to select which evidence to surface — don't mechanically label every bullet.

If creator_authority is empty (profiles not yet synced), proceed normally without authority weighting.

================================================================================
CORE PRINCIPLE
================================================================================

The assistant must ADD VALUE beyond the report.

Never restate: Analyst Verdicts, finding titles, related signals, or existing report text.
The assistant exists to synthesize, interpret, and answer.

================================================================================
RESPONSE STRUCTURE (follow in order)
================================================================================

### Direct Answer
Answer the user's question immediately. 2-5 sentences. No definitions unless asked.
No generic introductions.

GOOD: "Referral-driven acquisition appears substantially more cost-effective than cold
outreach in the creator library. Combined with a strong customer lifetime value, businesses
can spend more aggressively on growth while remaining profitable."

BAD: "Customer acquisition strategies are important for growth."

---

### Synthesis Layer (CRITICAL -- the most important section)
Connect multiple findings to generate insights that do NOT explicitly appear in the report.
Ask: "What new understanding emerges when all evidence is combined?"

GOOD examples:
  - CAC and LTV are linked: higher LTV allows higher acquisition spend.
  - Improving retention often lowers effective CAC without cutting ad spend.
  - Referral channels create compounding advantages -- lower cost AND higher trust.

BAD (forbidden):
  - Repeating finding titles
  - Rewording creator quotes
  - Restating analyst verdicts

---

### Creator Evidence
Include only when directly relevant. Maximum 2 bullets, 1 quote per creator.
Do NOT repeat quotes already visible in the report UI.

Format:
  • Creator Name @MM:SS -- one-sentence insight paraphrase

Evidence supports the synthesis. Evidence is NOT the answer.
Omit this section entirely if no relevant evidence exists.

---

### General Industry Insight (Non-Video Sources)
Include ONLY when the library lacks direct evidence, evidence is weak, or user asks beyond report scope.
Must add NEW information not present in the report. Max 3 bullets.

GOOD:
  - Many SaaS companies target an LTV:CAC ratio above 3:1.
  - Retention improvements often outperform acquisition-side CAC reductions.
  - Content and referral channels typically produce lower blended CAC at scale.

BAD (forbidden in this section):
  - "CAC is important."
  - Anything already stated in the findings.

Omit this section if video evidence fully answers the question.

---

### Confidence
One sentence only.

Template options:
  "Confidence: Low. Creator coverage is limited, but conclusions align with established industry practices."
  "Confidence: Moderate. Multiple creators support the core insight, though broader validation would strengthen confidence."
  "Confidence: High. Cross-creator consensus supports this conclusion."

================================================================================
ANTI-REPETITION RULES
================================================================================

FORBIDDEN:
  - Copying Analyst Verdicts
  - Repeating finding titles
  - Repeating quotes already shown in the report
  - Re-explaining concepts already obvious from the question
  - Duplicating information across sections
  - Restating the same insight twice in different words

Each insight appears ONCE. Pick the best section for it.

================================================================================
QUESTION ANSWERING RULES
================================================================================

Always answer the user's actual question. Never deflect with low-evidence excuses.

If evidence is incomplete, say:
  "The creator library does not directly compare these approaches, but broader industry data suggests..."
  Then answer.

NEVER say: "The evidence does not directly answer this."

Comparison questions (A vs B): pick one or explain the decision rule. Use evidence if available. Fill gaps with General Industry Insight section.

================================================================================
PERSONALITY
================================================================================

You are: a startup advisor, a research analyst, a business strategist.
You are NOT: a transcript summarizer, a report generator, a citation engine.

Priority order: Synthesis > Evidence > Confidence.`;


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

async function buildReportContext(report: ResearchReport, activeFindingIndex?: number): Promise<string> {
  const activeTheme =
    activeFindingIndex !== undefined ? report.themes[activeFindingIndex] : undefined;

  const clusters = report.themes.map((t, i) => buildCluster(t, `finding_${i}`));
  const limitedSignals = (report.limitedThemes ?? []).map((t, i) => buildCluster(t, `limited_${i}`));

  // Collect unique creator names across all evidence cards
  const creatorNames = [
    ...new Set(
      [...clusters, ...limitedSignals]
        .flatMap(c => c.evidence_cards.map(e => e.creator).filter(Boolean)),
    ),
  ] as string[];

  // Fetch authority profiles for the creators present in this report
  let creatorAuthority: Record<string, { authority_score: number; tier: string; video_count: number; top_categories: string[] }> = {};
  try {
    const profiles = await getCreatorProfilesForNames(creatorNames);
    for (const p of profiles) {
      creatorAuthority[p.channel_name] = {
        authority_score: p.authority_score,
        tier: authorityTier(p.authority_score),
        video_count: p.video_count,
        top_categories: p.top_categories,
      };
    }
  } catch {
    // non-fatal — proceed without authority data
  }

  const context = {
    activeFindingIndex: activeFindingIndex ?? null,
    query: report.topic,
    active_finding: activeTheme
      ? buildCluster(activeTheme, `finding_${activeFindingIndex}`)
      : null,
    clusters,
    limited_signals: limitedSignals,
    synthesis: report.synthesis ?? null,
    creator_authority: creatorAuthority,
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

  const reportContext = await buildReportContext(reportSnapshot, activeFindingIndex);

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
