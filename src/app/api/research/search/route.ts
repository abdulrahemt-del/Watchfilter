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
  relevanceReason: string;
  isKeyTheme: boolean;
  creators: string[];
  creatorCount: number;
  quoteCount: number;
  representativeQuote: ThemeSource;
  sources: ThemeSource[];
}

export interface RelatedSignal {
  title: string;
  description: string;
  sources: ThemeSource[];
}

export interface ResearchReport {
  query: string;
  topic: string;
  topicIntent: string;
  videosMatched: number;
  creatorsMatched: number;
  quotesMatched: number;
  themes: ResearchTheme[];
  relatedSignals: RelatedSignal[];
  synthesis: string;
  totalIndexed: number;
}

// ── GPT raw types ──────────────────────────────────────────────────────────────

interface RawRef { idx: number; quote: string; }
interface RawTheme {
  title: string;
  description: string;
  relevanceReason: string;
  sourceRefs: RawRef[];
  representativeRefIdx: number;
}
interface RawRelatedSignal {
  title: string;
  description: string;
  sourceRefs: RawRef[];
}
interface RawSynthesis {
  topic: string;
  topicIntent: string;
  themes: RawTheme[];
  relatedSignals: RawRelatedSignal[];
  synthesis: string;
}

// ── System prompt ──────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are a founder intelligence analyst. Your job is to answer the user's specific question using evidence from creator content — not to cluster similar-sounding quotes.

═══ STEP 1: UNDERSTAND THE TOPIC ═══

Before reading evidence, determine what the user is actually trying to learn.

"Founder Market Fit" → domain expertise, customer intimacy, problem familiarity, unfair founder advantages, who should build what
"Pricing Strategy" → how to price, pricing models, price discovery, willingness to pay, value anchoring
"Customer Acquisition" → channels, CAC, conversion, paid vs organic, referrals

Write topicIntent: 2-3 sentences explaining exactly what someone asking this question wants to understand. Be specific to the query — not generic.

═══ STEP 2: RELEVANCE TEST ═══

For every evidence item [E0]-[E19], ask:
"Does this quote directly answer the topic?"

Score 2 → Directly answers the topic → eligible for Key Themes
Score 1 → Related to the topic area but peripheral → Related Signals only
Score 0 → Unrelated or generic business advice → discard entirely

Score-0 examples: general revenue growth stories, vague success advice, topics clearly unrelated to the query.

═══ STEP 3: KEY THEMES ═══

Group score-2 evidence into themes. ONLY score-2 evidence belongs here.

Good titles — specific to THIS query:
"Domain Expertise Reduces Learning Curve" (for founder-market fit)
"Pricing Below Market to Win First Customers" (for pricing strategy)

Bad titles — too generic:
"Mentorship" / "Partnerships" / "Business Growth" / "Success Factors"

Each theme:
- title: 3-6 words, specific to THIS query
- description: What creators specifically say. 2-3 sentences, grounded in evidence.
- relevanceReason: "This answers the query because [specific reason]"
- sourceRefs: ALL score-2 items that fit this theme (verbatim quotes from evidence)
- representativeRefIdx: index into sourceRefs — the clearest, most on-topic quote

═══ STEP 4: RELATED SIGNALS ═══

Group score-1 evidence into named signals.
Describe how each is adjacent to (but not central to) the query.
They must NOT appear in themes or influence synthesis.

Each signal:
- title: What adjacent topic is this?
- description: How is it related to but not an answer for the query? 1-2 sentences.
- sourceRefs: Supporting score-1 items

═══ STEP 5: SYNTHESIS ═══

3-5 sentences that directly answer: "What does the evidence say about [query]?"
Draw ONLY from Key Themes. Do NOT reference Related Signals.
Specific, grounded, no invented statistics.

═══ CRITICAL RULES ═══

Never invent statistics, percentages, or causal claims.
Never invent creator names, video titles, or timestamps.
Never use score-1 or score-0 evidence in Key Themes.
The goal: answer the question using evidence — not collect similar quotes.

Return ONLY valid JSON:
${JSON.stringify({
  topic: "2-4 word topic label",
  topicIntent: "What the user wants to understand. 2-3 specific sentences.",
  themes: [
    {
      title: "Specific theme title for THIS query",
      description: "What creators specifically say. 2-3 sentences.",
      relevanceReason: "This answers the query because...",
      sourceRefs: [{ idx: 0, quote: "Verbatim quote from [E0]" }],
      representativeRefIdx: 0,
    },
  ],
  relatedSignals: [
    {
      title: "Adjacent topic",
      description: "How this is related to but not central to the query.",
      sourceRefs: [{ idx: 5, quote: "Verbatim quote from [E5]" }],
    },
  ],
  synthesis: "3-5 sentences directly answering the user's question using only Key Theme evidence.",
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

  // ── Enrich refs from indexed rows — GPT cannot fabricate source metadata ──────
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

  // ── Build themes — server enforces Key Theme threshold ────────────────────────
  const themes: ResearchTheme[] = (raw.themes ?? []).map(t => {
    const sources = (t.sourceRefs ?? []).map(enrichRef);
    const repIdx = typeof t.representativeRefIdx === "number"
      ? Math.min(t.representativeRefIdx, sources.length - 1)
      : 0;
    const representativeQuote = sources[repIdx] ?? sources[0];
    const uniqueCreators = [...new Set(sources.map(s => s.creator))];
    // Key Theme requires ≥2 creators OR ≥3 quotes; otherwise Emerging Signal
    const isKeyTheme = uniqueCreators.length >= 2 || sources.length >= 3;

    return {
      title: sanitizeText(t.title ?? ""),
      description: sanitizeText(t.description ?? ""),
      relevanceReason: sanitizeText(t.relevanceReason ?? ""),
      isKeyTheme,
      creators: uniqueCreators,
      creatorCount: uniqueCreators.length,
      quoteCount: sources.length,
      representativeQuote,
      sources,
    };
  });

  // Key Themes first (most creators), Emerging Signals after
  themes.sort((a, b) => {
    if (a.isKeyTheme !== b.isKeyTheme) return a.isKeyTheme ? -1 : 1;
    return b.creatorCount - a.creatorCount;
  });

  const relatedSignals: RelatedSignal[] = (raw.relatedSignals ?? []).map(s => ({
    title: sanitizeText(s.title ?? ""),
    description: sanitizeText(s.description ?? ""),
    sources: (s.sourceRefs ?? []).map(enrichRef),
  }));

  const allSources = themes.flatMap(t => t.sources);
  const videoIds = new Set([...allSources.map(s => s.videoId), ...topRows.map(r => r.video_id)]);
  const creatorsInPool = new Set(topRows.map(r => r.channel_name).filter(Boolean));

  const report: ResearchReport = {
    query,
    topic: sanitizeText(raw.topic ?? query),
    topicIntent: sanitizeText(raw.topicIntent ?? ""),
    videosMatched: videoIds.size,
    creatorsMatched: creatorsInPool.size,
    quotesMatched: allSources.length,
    themes,
    relatedSignals,
    synthesis: sanitizeText(raw.synthesis ?? ""),
    totalIndexed: stats.withEmbeddings,
  };

  return NextResponse.json(report);
}
