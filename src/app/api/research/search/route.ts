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

export interface ConsensusEntry {
  creator: string;
  reason: string;
}

export interface CreatorConsensus {
  agree: ConsensusEntry[];
  neutral: ConsensusEntry[];
  disagree: ConsensusEntry[];
}

export interface Contrarian {
  creator: string;
  videoTitle: string;
  videoId: string;
  quote: string;
  timestampStr: string | null;
  reason: string;
}

export interface ResearchTheme {
  title: string;
  description: string;
  relevanceReason: string;
  isKeyTheme: boolean;
  creators: string[];
  creatorCount: number;
  quoteCount: number;
  videoCount: number;
  confidence: number;
  consensusStrength: string;
  creatorConsensus: CreatorConsensus;
  contrarians: Contrarian[];
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
interface RawConsensusEntry { creator: string; reason: string; }
interface RawContrarian { idx: number; quote: string; reason: string; }
interface RawTheme {
  title: string;
  description: string;
  relevanceReason: string;
  sourceRefs: RawRef[];
  representativeRefIdx: number;
  creatorConsensus: {
    agree: RawConsensusEntry[];
    neutral: RawConsensusEntry[];
    disagree: RawConsensusEntry[];
  };
  contrarians: RawContrarian[];
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

// ── Confidence scoring ─────────────────────────────────────────────────────────

function calcConfidence(creatorCount: number, quoteCount: number): number {
  const base = creatorCount >= 7 ? 90
             : creatorCount >= 5 ? 82
             : creatorCount >= 3 ? 73
             : creatorCount >= 2 ? 63
             : 52;
  return Math.min(base + Math.floor(quoteCount / 6), 95);
}

function consensusLabel(confidence: number): string {
  return confidence >= 88 ? "High Consensus"
       : confidence >= 78 ? "Strong Evidence"
       : confidence >= 68 ? "Moderate Evidence"
       : "Limited Evidence";
}

// ── System prompt ──────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are a founder intelligence analyst. Identify what the evidence actually says about the query — not what sounds plausible.

═══ STEP 1: DEFINE SCOPE ═══

Before reading evidence, define what IS and IS NOT about this topic.

For "pricing strategy":
  IN SCOPE: how prices are set, pricing models, willingness to pay, price psychology, discounting, value-based pricing
  OUT OF SCOPE: revenue growth stories, marketing ROI, general business advice, mentorship

For "founder market fit":
  IN SCOPE: domain expertise, customer intimacy, problem familiarity, unfair founder advantages, learning speed
  OUT OF SCOPE: general success stories, revenue milestones, marketing tactics, referrals

For any other query, apply the same logic.
Write topicIntent: 2-3 sentences explaining what IS in scope and what would be rejected as out of scope.

═══ STEP 2: STRICT RELEVANCE TEST ═══

For every evidence item [E0]-[E19], ask:
"Does this quote explicitly describe or explain [TOPIC] itself?"

Score 2 → Explicitly addresses the topic → eligible for Key Themes
Score 1 → Mentions topic in passing or is genuinely adjacent → Related Signals only
Score 0 → Does not address the topic → DISCARD

AUTOMATICALLY score 0:
- General revenue or growth stories (unless revenue IS the query)
- Generic entrepreneurship or success advice
- Mentorship, partnerships, referrals (unless that IS the query)
- Any quote that remains generic business advice if you remove the topic word

═══ STEP 3: EVIDENCE QUALITY RULE ═══

Before attaching a quote to a theme, ask:
"Does this quote explicitly support THIS specific theme's finding?"

If the answer is "only loosely" — exclude it even if it scored 2 for the overall topic.
One strong, directly-supporting quote is better than five vague ones.
Every quote in sourceRefs must clearly and explicitly support the theme's specific claim.

═══ STEP 4: KEY THEMES ═══

Build themes using ONLY score-2 evidence that explicitly supports the theme.

Good titles (explicit to THIS topic):
  "Value-Based Pricing Over Cost-Plus" (pricing strategy)
  "Domain Expertise Reduces Founder Learning Curve" (founder market fit)

Bad titles (too generic):
  "Mentorship" / "Business Growth" / "Success Factors" / "Challenges"

Each theme:
- title: 3-6 words, explicit to THIS topic
- description: What do creators specifically say? 2-3 sentences grounded in evidence.
- relevanceReason: "This answers the query because [specific reason tied to the topic]"
- sourceRefs: ONLY quotes that explicitly support this theme's specific claim
- representativeRefIdx: index into sourceRefs (clearest, most directly on-point quote)

═══ STEP 5: CREATOR CONSENSUS MAP ═══

For each theme, classify the relevant creators from the evidence pool:

creatorConsensus:
  agree: creators whose evidence directly supports this theme's finding
  neutral: creators who mention the topic area but don't take a clear position
  disagree: creators whose evidence explicitly contradicts this theme

Rules:
- Use only creator names that appear in the evidence pool — never invent names
- Only classify creators who have evidence relevant to this specific theme
- Keep each reason to 1 sentence maximum

═══ STEP 6: CONTRARIAN VIEWS ═══

contrarians: ONLY include if a creator's evidence EXPLICITLY contradicts this theme.

NEVER include:
- Hypothetical objections ("some might argue...")
- Invented disagreements
- Caveats or nuances that don't actually contradict
- General skepticism not tied to specific evidence

ONLY include when a creator:
- Explicitly advocates the opposite position
- Has a quote that directly contradicts this theme's finding

For each contrarian:
- idx: evidence item index [E0]-[E19] containing the contradicting view
- quote: verbatim from that evidence
- reason: "This contradicts because..."

If no real contradictions exist: contrarians: []

═══ STEP 7: RELATED SIGNALS ═══

Group score-1 evidence only.
If a score-1 item is generic advice with no real connection to the topic: re-score it 0 and discard.
Related Signals must never appear in themes or synthesis.

═══ STEP 8: SYNTHESIS ═══

3-5 sentences directly answering: "What does the evidence say about [TOPIC]?"
Draw ONLY from Key Themes.

Honest language rules:
- If evidence is limited: say "Limited evidence suggests..."
- If findings are mixed: say "Evidence is mixed — some creators argue X while others argue Y"
- If insufficient: "The indexed content does not contain sufficient direct evidence about [topic]"
- Never fabricate certainty. Never invent stronger conclusions than the evidence supports.

Return ONLY valid JSON:
${JSON.stringify({
  topic: "2-4 word label",
  topicIntent: "What IS in scope + what would be rejected. 2-3 sentences.",
  themes: [
    {
      title: "Explicit topic-specific title",
      description: "What creators specifically say. 2-3 sentences.",
      relevanceReason: "This answers the query because...",
      sourceRefs: [{ idx: 0, quote: "Verbatim quote — only if it explicitly supports this theme" }],
      representativeRefIdx: 0,
      creatorConsensus: {
        agree:    [{ creator: "Exact creator name from evidence pool", reason: "1-sentence reason" }],
        neutral:  [{ creator: "Exact creator name", reason: "1-sentence reason" }],
        disagree: [],
      },
      contrarians: [],
    },
  ],
  relatedSignals: [
    {
      title: "Adjacent topic",
      description: "How this relates to but doesn't answer the query.",
      sourceRefs: [{ idx: 5, quote: "Verbatim quote from [E5]" }],
    },
  ],
  synthesis: "Honest 3-5 sentence answer using Key Theme evidence. Use limited/mixed/insufficient language if warranted.",
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
    max_tokens: 5000,
  });

  let raw: RawSynthesis;
  try {
    raw = JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}")) as RawSynthesis;
  } catch {
    return NextResponse.json({ error: "Synthesis failed" }, { status: 500 });
  }

  // ── Enrich helpers — GPT cannot fabricate source metadata ─────────────────────

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

  function enrichContrarian(c: RawContrarian): Contrarian {
    const row = topRows[c.idx] ?? topRows[0];
    return {
      creator: row.channel_name ?? "Unknown",
      videoTitle: row.video_title ?? "Unknown video",
      videoId: row.video_id,
      quote: sanitizeText(c.quote ?? row.quote ?? ""),
      timestampStr: row.timestamp_str ?? null,
      reason: sanitizeText(c.reason ?? ""),
    };
  }

  // ── Build themes ───────────────────────────────────────────────────────────────

  const allThemes: ResearchTheme[] = (raw.themes ?? []).map(t => {
    const sources = (t.sourceRefs ?? []).map(enrichRef);
    const repIdx = typeof t.representativeRefIdx === "number"
      ? Math.min(t.representativeRefIdx, sources.length - 1)
      : 0;
    const representativeQuote = sources[repIdx] ?? sources[0];
    const uniqueCreators = [...new Set(sources.map(s => s.creator))];
    const uniqueVideos = [...new Set(sources.map(s => s.videoId))];
    const isKeyTheme = uniqueCreators.length >= 2 || sources.length >= 3;
    const confidence = calcConfidence(uniqueCreators.length, sources.length);

    const rawConsensus = t.creatorConsensus ?? { agree: [], neutral: [], disagree: [] };
    const creatorConsensus: CreatorConsensus = {
      agree:    (rawConsensus.agree    ?? []).map(e => ({ creator: sanitizeText(e.creator ?? ""), reason: sanitizeText(e.reason ?? "") })),
      neutral:  (rawConsensus.neutral  ?? []).map(e => ({ creator: sanitizeText(e.creator ?? ""), reason: sanitizeText(e.reason ?? "") })),
      disagree: (rawConsensus.disagree ?? []).map(e => ({ creator: sanitizeText(e.creator ?? ""), reason: sanitizeText(e.reason ?? "") })),
    };

    return {
      title: sanitizeText(t.title ?? ""),
      description: sanitizeText(t.description ?? ""),
      relevanceReason: sanitizeText(t.relevanceReason ?? ""),
      isKeyTheme,
      creators: uniqueCreators,
      creatorCount: uniqueCreators.length,
      quoteCount: sources.length,
      videoCount: uniqueVideos.length,
      confidence,
      consensusStrength: consensusLabel(confidence),
      creatorConsensus,
      contrarians: (t.contrarians ?? []).map(enrichContrarian),
      representativeQuote,
      sources,
    };
  });

  const keyThemes = allThemes
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
    synthesis: keyThemes.length > 0 ? sanitizeText(raw.synthesis ?? "") : "",
    totalIndexed: stats.withEmbeddings,
  };

  return NextResponse.json(report);
}
