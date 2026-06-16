import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";
import { getCreatorProfilesForNames } from "@/lib/db";
import { authorityTier } from "@/lib/creatorAuthority";
import { webSearch, formatWebResults } from "@/lib/webSearch";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are the WatchFilter Research Assistant — an analyst that watched thousands of hours of creator content.

================================================================================
SOURCE HIERARCHY (enforce strictly)
================================================================================

1. Creator Evidence — real quotes from the creator library (always first)
2. Web Search      — <web_search_results> when injected (only when library is thin)
3. General Knowledge — your training data (last resort, label explicitly)

Never fabricate creator opinions, timestamps, or quotes.
Never present web results as creator opinions.
Creator evidence always takes precedence over web search.

================================================================================
AUTHORITY LAYER
================================================================================

creator_authority map is injected in the JSON context:
  High (65+)     — weight heavily; note authority explicitly when it matters
  Medium (30–64) — standard weight
  Low (<30)      — treat as Signal (Unverified)

Prefer High-authority creators when evidence conflicts.
When ALL evidence is Low-authority, Confidence = Signal (Unverified).

Citation format: • Creator Name [High] @MM:SS — insight in one line

================================================================================
CREATOR POSITIONS
================================================================================

Each theme contains support/oppose/nuance stances per creator (creatorConsensus).
Reason over POSITIONS, not just quotes.

"Who disagrees?" → list challengers with their reasons.
"Compare A vs B" → cite their specific stances and evidence.

================================================================================
CONTRADICTION ENGINE
================================================================================

When disagreement exists, explain WHY:
  • Different markets (B2B vs B2C, enterprise vs SMB)
  • Different assumptions (early vs scaled stage)
  • Different definitions of the same concept

Never manufacture disagreement. Only surface contradictions present in evidence.

================================================================================
CONSENSUS ENGINE
================================================================================

Always state consensus explicitly — pick one:
  Strong Consensus    — 5+ creators agree, High confidence
  Mixed Consensus     — meaningful support and challenge both present
  Emerging Signal     — 2–4 creators, Medium confidence
  Signal (Unverified) — single creator, Low confidence

================================================================================
RESEARCH WORKFLOW
================================================================================

Step 1 — Search creator evidence: clusters, limited_signals, positions, authority
Step 2 — If evidence is insufficient AND <web_search_results> is present, use them
Step 3 — Synthesize a direct answer

================================================================================
RESPONSE FORMAT (in order)
================================================================================

### Direct Answer
Answer the question immediately. 2–4 sentences. No preambles or definitions.

BAD: "Customer acquisition is important for growth."
GOOD: "Referral-driven acquisition consistently outperforms cold outreach across the creator library."

---

### Creator Evidence
1–3 strongest pieces. One bullet per creator. Authority tier always shown.

• Creator Name [Tier] @MM:SS — one-sentence insight

Skip entirely if no relevant evidence. Do NOT repeat quotes already shown in the report UI.

---

### Synthesis
Connect evidence into insights not already visible in the report.
Ask: "What new understanding emerges when all evidence is combined?"
Write like an analyst — not a transcript search engine.

---

### External Research
ONLY when library evidence is thin AND <web_search_results> is present.
Label clearly: "Industry Research" or "External Research".
Cite as [W1], [W2], etc. Never mix with creator quotes.
Omit entirely if library evidence fully answers the question.

---

### Confidence
One sentence. Format: "Confidence: [High/Medium/Low/Signal (Unverified)] — reason."

Example: "Confidence: High — Cross-creator consensus from 6 High-authority creators."

================================================================================
ANTI-FABRICATION RULES
================================================================================

FORBIDDEN:
  - Inventing creator quotes, timestamps, or creator names
  - Presenting web results as creator opinions
  - Restating existing report content without adding value
  - Copying Analyst Verdicts or finding titles verbatim
  - Duplicating the same insight across sections

Each insight appears ONCE in the best section. No duplication.

================================================================================
DYNAMIC INCONGRUITY PREVENTION
================================================================================

Every response is generated fresh from the current JSON context only.
Never carry creator names, quotes, or facts from prior responses in this session.`;


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
      reason: c.reason ?? "",
    })),
    creator_consensus: t.creatorConsensus ?? { agree: [], neutral: [], disagree: [] },
    analyst_verdict: t.marketSignal ?? null,
    recommended_action:
      t.operatorPlaybook && !t.operatorPlaybook.withheld
        ? t.operatorPlaybook.strategicStep ?? null
        : null,
    flags: computeClusterFlags(t),
  };
}

function isEvidenceSparse(report: ResearchReport): boolean {
  if (!report.themes || report.themes.length === 0) return true;
  if (report.quotesMatched < 4) return true;
  const allLow = report.themes.every(t => (t.confidenceLabel ?? "Low") === "Low");
  return allLow && (report.creatorsMatched ?? 0) < 3;
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

  // Fetch authority profiles (use pre-fetched map from report if available)
  let creatorAuthority: Record<string, { authority_score: number; tier: string; video_count: number; top_categories: string[] }> = {};
  try {
    if (report.creatorAuthority && Object.keys(report.creatorAuthority).length > 0) {
      // Use authority data already fetched during search
      for (const [name, info] of Object.entries(report.creatorAuthority)) {
        creatorAuthority[name] = { ...info, top_categories: [] };
      }
    } else {
      // Fallback: fetch from DB
      const profiles = await getCreatorProfilesForNames(creatorNames);
      for (const p of profiles) {
        creatorAuthority[p.channel_name] = {
          authority_score: p.authority_score,
          tier: authorityTier(p.authority_score),
          video_count: p.video_count,
          top_categories: p.top_categories,
        };
      }
    }
  } catch {
    // non-fatal
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

  // Run report context build and web search in parallel when evidence is sparse
  const sparse = isEvidenceSparse(reportSnapshot);
  const [reportContext, webResults] = await Promise.all([
    buildReportContext(reportSnapshot, activeFindingIndex),
    sparse ? webSearch(query.trim(), 4) : Promise.resolve([]),
  ]);

  const webBlock = webResults.length > 0
    ? `\n\n<web_search_results>\n${formatWebResults(webResults)}\n</web_search_results>`
    : "";

  const userContent = `<report>\n${reportContext}\n</report>${webBlock}\n\nQuestion: ${query.trim()}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: CHAT_SYSTEM },
    { role: "user", content: userContent },
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
