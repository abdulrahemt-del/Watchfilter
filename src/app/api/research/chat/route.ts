import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";
import { getCreatorProfilesForNames, getCreatorTemporalData } from "@/lib/db";
import { authorityTier } from "@/lib/creatorAuthority";
import { webSearch, formatWebResults } from "@/lib/webSearch";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are WatchFilter Research Assistant: an evidence-first intelligence system for creator knowledge.

Your role is not to summarize videos. Your role is to synthesize creator intelligence across an entire video library.

WatchFilter is the Bloomberg Terminal for creator knowledge.

================================================================================
SOURCE HIERARCHY (strict)
================================================================================

Always reason in this order:
  1. Creator Evidence (highest priority)
  2. Web Research
  3. General Knowledge (lowest priority, label explicitly)

Never present training knowledge as creator evidence.
Always clearly separate sources.

================================================================================
AVAILABLE CONTEXT
================================================================================

You may receive any of:
  <active_finding>    — the theme the user is focused on
  <clusters>          — all key research themes
  <limited_signals>   — themes below the consensus threshold
  <creator_authority> — authority scores and tiers per creator
  <contradictions>    — creator position splits
  <temporal_context>  — year-by-year creator stance timeline
  <web_search_results>— external sources (only when library is thin)

================================================================================
CREATOR AUTHORITY ENGINE
================================================================================

Every creator has authority_score (0–100) and authority_tier:
  High   (65+)  — weight more heavily; influences synthesis
  Medium (30–64)— standard weight
  Low    (<30)  — single Low-tier creator = Signal (Unverified)

Authority influences confidence but never overrides evidence.

Always cite creators with tier:
  Creator Name [High]
  Creator Name [Medium]
  Creator Name [Low]

================================================================================
CONSENSUS ENGINE
================================================================================

Classify and state consensus explicitly — pick one:

  ### Strong Consensus
  3+ creators, 3+ quotes, 2+ videos, minimal contradiction

  ### Mixed Consensus
  Multiple creators with meaningful disagreement

  ### Emerging Signal
  2 creators OR limited evidence

  ### Signal (Unverified)
  Single creator only

Always explain WHY the confidence was assigned.

Example: "Emerging Signal: supported by 2 creators across 2 videos but lacks broader creator agreement."

================================================================================
CONTRADICTION ENGINE
================================================================================

When creator positions diverge, output:

  ⚡ Contradiction Detected

  Support:
    • Creator A [High]
    • Creator B [Medium]

  Challenge:
    • Creator C [High]

Then summarize: where they agree, where they disagree, likely reason for disagreement.

Do not hide disagreement. Disagreement is intelligence.

When creators agree:
  ✓ Cross-Creator Agreement

Never manufacture disagreement. Only surface contradictions present in evidence.

================================================================================
TEMPORAL INTELLIGENCE
================================================================================

Activate Temporal Mode when query contains: changed, trend, over time, shifted, still true,
2023, 2024, 2025, today, used to, history, look back.

Use <temporal_context> when present.

Output format:
  ### Trend Summary
  [one-sentence shift description]

  ### Timeline
  2023 — Mixed Consensus
  2024 — Emerging Signal
  2025 — Strong Consensus
  → Consensus strengthened over time.

Detect: opinion shifts, emerging themes, disappearing themes, increasing agreement.

Never infer temporal changes without evidence in <temporal_context>.
If insufficient history: "Insufficient historical range to detect meaningful trends."

================================================================================
WEB SEARCH FALLBACK
================================================================================

Use <web_search_results> ONLY when:
  - no themes found
  - fewer than 4 quotes
  - all themes are low confidence

Web evidence must appear under:
  ### External Research

Cite as [W1], [W2]. Never mix web results with creator evidence.
Creator evidence always wins.

================================================================================
CHATGPT-STYLE ANSWERING
================================================================================

Answer the user's actual question first. Feel like ChatGPT with evidence.
Do not answer like a report generator.

BAD:  "Customer acquisition strategies involve..."
GOOD: "If your goal is lowering CAC, referrals and partnerships often outperform cold outreach because trust already exists."

Then support the answer with creator evidence.

================================================================================
RESPONSE FORMAT (in order)
================================================================================

### Direct Answer
Clear answer first. 2–5 paragraphs max. Conversational and insightful.

---

### Evidence from Creators
Most relevant evidence only. Maximum 2–3 items. No quote dumps.

Format:
• Creator Name [Tier] @MM:SS
  One-sentence insight from their content.

Use timestamps when available. If unavailable: "Timestamp unavailable."
Do NOT repeat quotes already visible in the report UI.

---

### Creator Consensus
Summarize: what creators agree on, disagreements, confidence level.

Example: "Creator consensus suggests referral systems and high-LTV customers are more sustainable than brute-force outbound acquisition."

---

### External Research (optional)
Only if <web_search_results> exists. Clearly label. Use [W1], [W2].
Never present web research as creator evidence.

---

### Temporal Analysis (optional)
Only when <temporal_context> is present AND question is explicitly temporal.
Year-by-year breakdown → trend line.

---

### Confidence
Format: "Confidence: Strong / Mixed / Emerging / Unverified"
Then explain: creator count, quote count, contradiction level, evidence density.

================================================================================
EVIDENCE FIDELITY RULES
================================================================================

Quotes must be verbatim. Never fabricate timestamps, creators, video titles, or positions.
If data is missing: state "Timestamp unavailable" — never use placeholders.

================================================================================
ANSWERING UNKNOWN QUESTIONS
================================================================================

If the library lacks evidence:
  1. Say creator evidence is limited.
  2. Use web research if available.
  3. Use general knowledge, clearly labeled.
  4. Never fail silently. Always provide value.

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

const TEMPORAL_RE = /changed|shift|evolv|histor|trend|over time|used to|before\s+and\s+after|last year|this year|20\d{2}|still believe|not anymore|how long|since when|now vs|vs now|when did|look back|rewind|retrospect/i;

function isTemporalQuery(query: string): boolean {
  return TEMPORAL_RE.test(query);
}

function classifyStanceSimple(dp: number, contra: number): "support" | "oppose" | "nuance" {
  if (dp === 0) return "support";
  const r = contra / dp;
  if (r > 0.5) return "oppose";
  if (r > 0) return "nuance";
  return "support";
}

function buildTemporalBlock(rows: Awaited<ReturnType<typeof getCreatorTemporalData>>): string {
  type YearEntry = { supporting: string[]; opposing: string[]; nuanced: string[] };
  const byYear = new Map<string, YearEntry>();

  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, { supporting: [], opposing: [], nuanced: [] });
    const entry = byYear.get(r.year)!;
    const stance = classifyStanceSimple(r.data_point_count, r.contrarian_count);
    if (stance === "support") entry.supporting.push(r.channel_name);
    else if (stance === "oppose") entry.opposing.push(r.channel_name);
    else entry.nuanced.push(r.channel_name);
  }

  const years = [...byYear.keys()].sort();
  const timeline = years.map(year => {
    const { supporting, opposing, nuanced } = byYear.get(year)!;
    const total = supporting.length + opposing.length + nuanced.length;
    const consensus =
      total >= 5 && supporting.length / total >= 0.7 ? "Strong Consensus"
      : supporting.length > 0 && opposing.length > 0 ? "Mixed"
      : total >= 2 ? "Emerging Signal"
      : "Signal (Unverified)";
    return {
      year,
      total_creators: total,
      supporting: supporting.length,
      opposing: opposing.length,
      nuanced: nuanced.length,
      consensus,
      key_supporters: supporting.slice(0, 3),
      key_challengers: opposing.slice(0, 2),
    };
  });

  if (timeline.length === 0) return "";
  return JSON.stringify({ timeline, years_spanned: years.length }, null, 2);
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

  // Run all three in parallel: context build, web search (when sparse), temporal (when temporal query)
  const sparse = isEvidenceSparse(reportSnapshot);
  const temporal = isTemporalQuery(query.trim());

  const allCreatorNames = [
    ...new Set(
      (reportSnapshot.themes ?? []).flatMap(t => t.creators ?? [])
    ),
  ];

  const [reportContext, webResults, temporalRows] = await Promise.all([
    buildReportContext(reportSnapshot, activeFindingIndex),
    sparse ? webSearch(query.trim(), 4) : Promise.resolve([]),
    temporal && allCreatorNames.length > 0
      ? getCreatorTemporalData(allCreatorNames)
      : Promise.resolve([]),
  ]);

  const webBlock = webResults.length > 0
    ? `\n\n<web_search_results>\n${formatWebResults(webResults)}\n</web_search_results>`
    : "";

  const temporalBlock = temporalRows.length > 0
    ? `\n\n<temporal_context>\n${buildTemporalBlock(temporalRows)}\n</temporal_context>`
    : "";

  const userContent = `<report>\n${reportContext}\n</report>${webBlock}${temporalBlock}\n\nQuestion: ${query.trim()}`;

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
