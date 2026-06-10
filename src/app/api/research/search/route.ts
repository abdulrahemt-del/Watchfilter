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

const SYNTHESIS_SYSTEM = `You are a founder intelligence analyst. Your job is to answer the user's specific question using ONLY evidence that explicitly addresses the topic — not loosely related business content.

═══ STEP 1: DEFINE SCOPE ═══

Before reading evidence, define what IS and IS NOT about this topic.

For "pricing strategy":
  IN SCOPE: how prices are set, pricing models (premium/freemium/usage-based), price positioning, willingness to pay, price psychology, discounting, value-based pricing
  OUT OF SCOPE: revenue growth stories, marketing ROI, acquisition costs, general business advice, mentorship, partnerships

For "founder market fit":
  IN SCOPE: domain expertise, customer intimacy, problem familiarity, unfair founder advantages, who should build what, learning speed
  OUT OF SCOPE: general success stories, revenue milestones, marketing tactics, referrals, partnerships

For any other query, apply the same logic: define what explicitly IS the topic vs. what is only adjacent.

Write topicIntent: 2-3 sentences explaining what IS in scope and what would be rejected as out of scope.

═══ STEP 2: STRICT RELEVANCE TEST ═══

For every evidence item [E0]-[E19], ask ONE question:
"Does this quote explicitly describe or explain [TOPIC] itself?"

NOT: "Is this useful business advice?"
NOT: "Is this loosely connected to the topic area?"
ONLY: "Does this quote explicitly and directly address [TOPIC]?"

Score 2 → Explicitly addresses the topic → eligible for Key Themes
Score 1 → Mentions topic in passing or is genuinely adjacent → Related Signals only
Score 0 → Does not address the topic → DISCARD

AUTOMATICALLY score 0 (discard without exception):
- General revenue or growth stories (unless revenue IS the query)
- Marketing performance data (unless marketing IS the query)
- Generic entrepreneurship or success advice
- Mentorship, partnerships, referrals — unless the query is specifically about these
- Any quote that remains generic business advice if you remove the topic word

═══ STEP 3: KEY THEMES ═══

Build themes using ONLY score-2 evidence.

Good titles — must explicitly reference the topic concept:
  "Value-Based Pricing Over Cost-Plus" (pricing strategy)
  "Freemium as Market Entry Tactic" (pricing strategy)
  "Domain Expertise Reduces Founder Learning Curve" (founder market fit)

Bad titles — rejected automatically:
  "Mentorship" / "Partnerships" / "Business Growth" / "Success Factors" / "Challenges"

Each theme:
- title: 3-6 words, explicit to THIS topic
- description: What do creators specifically say? 2-3 sentences grounded in evidence.
- relevanceReason: "This answers the query because [specific reason tied to the topic]"
- sourceRefs: ALL score-2 items for this theme (verbatim quotes)
- representativeRefIdx: index into sourceRefs (clearest, most on-topic)

If score-2 evidence is thin (1 creator, 1-2 quotes), still include the theme — the server decides if it qualifies as a Key Theme. Your job is accurate scoring, not suppression.

═══ STEP 4: RELATED SIGNALS ═══

Group score-1 evidence only. These are observations that mention the topic in passing.
If score-1 evidence is generic business advice with no real connection to the topic, re-score it 0 and discard.

Each signal:
- title: What adjacent topic is this?
- description: How does it relate to (but not directly answer) the query? 1-2 sentences.
- sourceRefs: Supporting items

═══ STEP 5: SYNTHESIS ═══

3-5 sentences directly answering: "What does the evidence say about [TOPIC]?"
Draw ONLY from Key Themes. Never reference Related Signals.
If themes is empty, write: "The indexed content does not contain sufficient direct evidence about [topic]. Try indexing more videos on this subject."

═══ CRITICAL RULES ═══

Never invent statistics, percentages, or causal claims.
Never include evidence just because it sounds topically adjacent.
The test is always: "Does this EXPLICITLY address [TOPIC]?" — not "Is this somewhat related?"
One well-supported Key Theme is better than five weak themes.

Return ONLY valid JSON:
${JSON.stringify({
  topic: "2-4 word topic label",
  topicIntent: "What IS in scope for this query + what would be rejected as out of scope. 2-3 sentences.",
  themes: [
    {
      title: "Explicit topic-specific theme title",
      description: "What creators specifically say. 2-3 sentences.",
      relevanceReason: "This answers the query because...",
      sourceRefs: [{ idx: 0, quote: "Verbatim quote from [E0]" }],
      representativeRefIdx: 0,
    },
  ],
  relatedSignals: [
    {
      title: "Adjacent topic that mentions the subject in passing",
      description: "How this is related to but does not directly answer the query.",
      sourceRefs: [{ idx: 5, quote: "Verbatim quote from [E5]" }],
    },
  ],
  synthesis: "3-5 sentences directly answering the user's question using Key Theme evidence only. Or the no-evidence message if themes is empty.",
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

  // Only Key Themes in the response — below-threshold themes are discarded
  const keyThemes = themes
    .filter(t => t.isKeyTheme)
    .sort((a, b) => b.creatorCount - a.creatorCount);

  const relatedSignals: RelatedSignal[] = (raw.relatedSignals ?? []).map(s => ({
    title: sanitizeText(s.title ?? ""),
    description: sanitizeText(s.description ?? ""),
    sources: (s.sourceRefs ?? []).map(enrichRef),
  }));

  const allSources = keyThemes.flatMap(t => t.sources);
  const videoIds = new Set([...allSources.map(s => s.videoId), ...topRows.map(r => r.video_id)]);
  const creatorsInPool = new Set(topRows.map(r => r.channel_name).filter(Boolean));

  const report: ResearchReport = {
    query,
    topic: sanitizeText(raw.topic ?? query),
    topicIntent: sanitizeText(raw.topicIntent ?? ""),
    videosMatched: videoIds.size,
    creatorsMatched: creatorsInPool.size,
    quotesMatched: allSources.length,
    themes: keyThemes,
    relatedSignals,
    synthesis: sanitizeText(raw.synthesis ?? ""),
    totalIndexed: stats.withEmbeddings,
  };

  return NextResponse.json(report);
}
