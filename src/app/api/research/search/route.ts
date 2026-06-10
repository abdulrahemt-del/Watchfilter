import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { loadResearchIndex, getResearchIndexStats, type ResearchRow } from "@/lib/db";
import { embedText, cosineSim } from "@/lib/research/embed";
import { sanitizeText } from "@/lib/utils/sanitize";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

// ── Public types ───────────────────────────────────────────────────────────────

export interface ThemeSource {
  creator: string;
  videoTitle: string;
  videoId: string;
  quote: string;
  timestampStr: string | null;
  signalStrength: string | null;
}

export interface ResearchTheme {
  title: string;
  description: string;
  creators: string[];
  creatorCount: number;
  quoteCount: number;
  representativeQuote: ThemeSource;
  sources: ThemeSource[];
}

export interface ResearchReport {
  query: string;
  topic: string;
  videosMatched: number;
  creatorsMatched: number;
  quotesMatched: number;
  themes: ResearchTheme[];
  agreements: string[];
  disagreements: string[];
  takeaways: string[];
  totalIndexed: number;
}

// ── GPT raw types ──────────────────────────────────────────────────────────────

interface RawRef { idx: number; quote: string; }
interface RawTheme {
  title: string;
  description: string;
  sourceRefs: RawRef[];
  representativeRefIdx: number;
}
interface RawSynthesis {
  topic: string;
  themes: RawTheme[];
  agreements: string[];
  disagreements: string[];
  takeaways: string[];
}

// ── System prompt ──────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are a research assistant summarizing what video creators say about a topic.

Think of yourself as someone who has watched 50+ hours of content and is answering:
"What are creators saying about this topic — and what should a founder do about it?"

═══ YOUR JOB ═══

1. Read all evidence items [E0]-[E19].
2. Group similar evidence into themes.
3. Name each theme clearly and specifically.
4. Describe what creators are actually saying in each theme.
5. List the supporting quotes and which creators said them.

═══ WHAT MAKES A GOOD THEME ═══

Good theme titles (specific, grounded):
  "Customer Service Agent Automation"
  "Context Window Limitations In Production"
  "Referral Programs Outperforming Paid Ads"
  "Founder-Led Sales In Early Stage"

Bad theme titles (too vague):
  "Challenges"
  "Opportunities"
  "AI Is Changing Things"
  "Important Considerations"

A theme should describe a specific idea or pattern that creators keep returning to.
It should be grounded in what creators actually said — not a category label.

═══ THEME ORDERING ═══

Order themes by: how many creators mention them (most first).

═══ WHAT TO INCLUDE IN EACH THEME ═══

- title: 3-6 words, noun phrase, specific
- description: 2-4 sentences describing what creators are saying. What specific ideas, examples, or warnings come up?
- sourceRefs: ALL evidence items that belong to this theme (cite [E] index + quote verbatim from evidence)
- representativeRefIdx: index into sourceRefs — the clearest, most specific quote that captures the theme

═══ AGREEMENTS ═══

Things mentioned by 3+ creators with no significant pushback.
Be specific: not "AI is useful" but "Most creators recommend starting with internal automation before customer-facing agents"

═══ DISAGREEMENTS ═══

Only include if creators explicitly argue different positions on the same point.
Describe the actual disagreement: "[Creator type A] argues X while [Creator type B] argues Y because..."
If no genuine disagreement exists: return []

═══ TAKEAWAYS ═══

3-6 specific actions a founder/operator could take, based directly on what creators said.

Good: "Start with your most repetitive 2-hour task — 4 creators cited this as the best first AI agent use case"
Bad: "Consider using AI agents in your business"

Each takeaway should reference what creators said, not generic advice.

═══ CRITICAL RULES ═══

NEVER invent statistics, percentages, or causal claims.
NEVER invent creator names, video titles, or timestamps — these come from the evidence pool only.
Include ALL relevant evidence — do not reject a quote because it doesn't answer a pre-set question.
A quote is relevant if it says something meaningful about the topic.

Return ONLY valid JSON:
${JSON.stringify({
  topic: "Clean topic label (2-4 words)",
  themes: [
    {
      title: "Specific Theme Title",
      description: "What creators are saying about this. What specific ideas, examples, or warnings appear? 2-4 sentences.",
      sourceRefs: [
        { idx: 0, quote: "Verbatim quote from evidence — use the quote exactly as it appears in [E0]" },
        { idx: 3, quote: "Verbatim quote from [E3]" },
      ],
      representativeRefIdx: 0,
    },
  ],
  agreements: [
    "Specific idea mentioned by multiple creators with no disagreement",
  ],
  disagreements: [
    "Creator type A argues X, while Creator type B argues Y — describe the actual disagreement",
  ],
  takeaways: [
    "Specific action based on what creators said — not generic advice",
  ],
}, null, 2)}`;

// ── Evidence block ─────────────────────────────────────────────────────────────

function buildEvidenceBlock(rows: ResearchRow[], scores: number[]): string {
  return rows.slice(0, 20).map((r, i) => [
    `[E${i}] Relevance: ${(scores[i] * 100).toFixed(0)}%`,
    `Creator: ${r.channel_name ?? "Unknown"}`,
    `Video: ${r.video_title ?? "Unknown"}`,
    r.timestamp_str ? `Timestamp: ${r.timestamp_str}` : null,
    r.quote ? `Quote: "${r.quote}"` : null,
    r.insight ? `Insight: ${r.insight}` : null,
    r.why_matters ? `Why it matters: ${r.why_matters}` : null,
    r.signal_strength ? `Signal: ${r.signal_strength}` : null,
    r.contrarian ? `Contrarian angle: ${r.contrarian}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    query?: string;
    filters?: { channel?: string; signalStrength?: string };
  };

  const query = sanitizeText((body.query ?? "").trim());
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const [allRows, stats] = await Promise.all([loadResearchIndex(), getResearchIndexStats()]);

  if (!allRows.length) {
    return NextResponse.json({
      error: "No research data indexed yet. Analyze some videos first.",
      totalIndexed: 0,
    } as Partial<ResearchReport>, { status: 422 });
  }

  const queryVec = await embedText(query);

  let filtered = allRows;
  if (body.filters?.channel) filtered = filtered.filter(r => r.channel_name === body.filters!.channel);
  if (body.filters?.signalStrength) {
    filtered = filtered.filter(r =>
      r.signal_strength?.toLowerCase() === body.filters!.signalStrength!.toLowerCase()
    );
  }

  const scored = filtered
    .filter(r => r.embedding)
    .map(r => ({ row: r, score: cosineSim(queryVec, r.embedding!) }))
    .sort((a, b) => b.score - a.score);

  const topRows = scored.slice(0, 20).map(s => s.row);
  const topScores = scored.slice(0, 20).map(s => s.score);

  if (!topRows.length) {
    return NextResponse.json({
      error: "No relevant evidence found for this query.",
      totalIndexed: stats.withEmbeddings,
    } as Partial<ResearchReport>, { status: 422 });
  }

  const uniqueCreatorsInPool = [...new Set(topRows.map(r => r.channel_name).filter(Boolean))] as string[];
  const evidenceBlock = buildEvidenceBlock(topRows, topScores);

  const userMessage = [
    `Query: "${query}"`,
    `Evidence pool: ${topRows.length} items from ${uniqueCreatorsInPool.length} creators`,
    "",
    evidenceBlock,
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYNTHESIS_SYSTEM },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_tokens: 4000,
  });

  let raw: RawSynthesis;
  try {
    raw = JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}")) as RawSynthesis;
  } catch {
    return NextResponse.json({ error: "Synthesis failed" }, { status: 500 });
  }

  // ── Build themes — enrich all refs from indexed rows (GPT cannot fabricate metadata) ──
  function enrichRef(ref: RawRef): ThemeSource {
    const row = topRows[ref.idx] ?? topRows[0];
    return {
      quote: sanitizeText(ref.quote ?? row.quote ?? ""),
      creator: row.channel_name ?? "Unknown",
      videoTitle: row.video_title ?? "Unknown video",
      videoId: row.video_id,
      timestampStr: row.timestamp_str ?? null,
      signalStrength: row.signal_strength ?? null,
    };
  }

  const themes: ResearchTheme[] = (raw.themes ?? []).map(t => {
    const sources = (t.sourceRefs ?? []).map(enrichRef);
    const repIdx = typeof t.representativeRefIdx === "number"
      ? Math.min(t.representativeRefIdx, sources.length - 1)
      : 0;
    const representativeQuote = sources[repIdx] ?? sources[0];
    const uniqueCreators = [...new Set(sources.map(s => s.creator))];

    return {
      title: sanitizeText(t.title ?? ""),
      description: sanitizeText(t.description ?? ""),
      creators: uniqueCreators,
      creatorCount: uniqueCreators.length,
      quoteCount: sources.length,
      representativeQuote,
      sources,
    };
  });

  // Sort themes by creator count descending (most-discussed first)
  themes.sort((a, b) => b.creatorCount - a.creatorCount);

  const allSources = themes.flatMap(t => t.sources);
  const videoIds = new Set([...allSources.map(s => s.videoId), ...topRows.map(r => r.video_id)]);
  const creatorsInPool = new Set(topRows.map(r => r.channel_name).filter(Boolean));

  const report: ResearchReport = {
    query,
    topic: sanitizeText(raw.topic ?? query),
    videosMatched: videoIds.size,
    creatorsMatched: creatorsInPool.size,
    quotesMatched: allSources.length,
    themes,
    agreements: (raw.agreements ?? []).map(s => sanitizeText(s)),
    disagreements: (raw.disagreements ?? []).map(s => sanitizeText(s)),
    takeaways: (raw.takeaways ?? []).map(s => sanitizeText(s)),
    totalIndexed: stats.withEmbeddings,
  };

  return NextResponse.json(report);
}
