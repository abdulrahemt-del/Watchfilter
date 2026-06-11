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
  marketSignal: string;
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
  suggestions: string[];
  totalIndexed: number;
}

// ── GPT raw types ──────────────────────────────────────────────────────────────

interface RawRef { idx: number; quote: string; }
interface RawConsensusEntry { creator: string; reason: string; }
interface RawContrarian { idx: number; quote: string; reason: string; }
interface RawTheme {
  title: string;
  marketSignal: string;
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
  suggestions: string[];
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

const SYNTHESIS_SYSTEM = `You are an elite B2B equity research analyst and forensic data engineer. Your objective is to map objective market evidence, identify systemic consensus, isolate real cross-channel friction, and provide a 100% auditable evidence trail. Maintain a cold, clinical, professional tone. Never use words like "revolutionary," "game-changing," "unlock," or "supercharge."

═══ TWO-PASS EXECUTION PROTOCOL ═══

PASS 1 — EVIDENCE HARVESTING:
Scan [E0]-[E19]. Extract only quotes that contain hard metrics, strategic execution frameworks, or specific case studies. For every candidate quote, run this internal check:
"Does this exact quote explicitly and directly validate a specific finding without requiring extrapolation?"
If your internal confidence is < 90% → DISCARD. Do not force weak sources to support a finding. One bulletproof quote is strictly better than five loose semantic matches.

PASS 2 — SYNTHESIS & DRAFTING:
Group the harvested quotes into thematic clusters first. Only after clusters are built may you write analytical findings.

═══ STEP 1: DEFINE SCOPE ═══

Before reading evidence, define what IS and IS NOT this topic.

For "pricing strategy":
  IN SCOPE: how prices are set, pricing models, willingness to pay, price psychology, discounting, value-based pricing
  OUT OF SCOPE: revenue growth stories, marketing ROI, general business advice, mentorship

For "founder market fit":
  IN SCOPE: domain expertise, customer intimacy, problem familiarity, unfair founder advantages, learning speed
  OUT OF SCOPE: general success stories, revenue milestones, marketing tactics, referrals

Apply the same logic to any query. Write topicIntent: 2-3 sentences on what IS in scope and what is rejected.

═══ STEP 2: RELEVANCE SCORING + 90% CONFIDENCE GATE ═══

For every evidence item [E0]-[E19]:
1. Score relevance: 2 = explicitly on-topic / 1 = genuinely adjacent / 0 = discard
2. Apply 90% confidence gate: "Does this exact quote explicitly support a specific finding without extrapolation?" If < 90% → DISCARD

Auto-score 0 (discard regardless of surface relevance):
- General revenue or growth stories (unless revenue IS the query)
- Generic entrepreneurship or success advice
- Mentorship, partnerships, referrals (unless that IS the query)
- Any quote that remains generic business advice if you remove the topic word
- NEVER extrapolate a creator's framework to a different context than their stated one

═══ STEP 3: KEY THEMES ═══

Build themes using ONLY score-2 evidence that passed the 90% confidence gate.

Each theme:
- title: 3-6 words, explicit to THIS topic. Good: "Value-Based Pricing Over Cost-Plus". Bad: "Business Growth" / "Success Factors"
- marketSignal: 1 sentence — the analytical verdict: what this theme implies for operators or market participants (not a description of what creators said)
- description: 2-3 sentences — what creators specifically say, grounded in evidence only
- relevanceReason: "This answers the query because [specific reason tied to the topic]"
- sourceRefs: ONLY quotes passing the 90% gate for this specific theme's claim
- representativeRefIdx: index into sourceRefs of the strongest, most definitive quote

If evidence is weak and limited to isolated anecdotal mentions, you MUST state that in the description.
If data is insufficient to formulate a thesis: collapse the theme entirely — do not include it.

═══ STEP 4: CREATOR CONSENSUS MATRIX ═══

For each theme, classify relevant creators from the evidence pool:
- agree: creators whose evidence directly supports this theme
- neutral: creators who acknowledge the topic area but provide no definitive stance or data
- disagree: creators whose evidence explicitly contradicts this theme

Rules:
- Use ONLY creator names from the evidence pool — never invent names
- Only classify creators with evidence directly relevant to this specific theme
- 1 sentence per creator maximum

═══ STEP 5: FORENSIC CONTRARIAN DETECTION ═══

A contrarian may ONLY be included when one of these conditions is met in the actual text:
1. Creator A advocates a strategy that Creator B explicitly claims does not work
2. Creator A presents data that directly invalidates Creator B's thesis

NEVER include:
- Hypothetical objections ("some might argue...")
- Corporate platitudes or academic counterarguments
- Caveats or nuances that do not constitute a direct contradiction
- General skepticism not tied to specific evidence

For each valid contrarian:
- idx: [E0]-[E19] index of the contradicting quote
- quote: verbatim from that evidence item
- reason: "This contradicts because [explicit mechanical reason]"

If no direct text-based contradiction exists: contrarians: []
If no contrarians found across all themes, note: "No direct contradictory evidence found across analyzed sources."

═══ STEP 6: RELATED SIGNALS ═══

Group score-1 evidence only. If a score-1 item is generic with no real connection to the topic: re-score 0 and discard. Related Signals must never appear in themes or synthesis.

═══ STEP 7: ZERO-DATA FALLBACK PROTOCOL ═══

If Pass 1 yields 0 direct quotes for the target topic (themes array would be empty):
- Set themes: []
- Set synthesis: ""
- Set suggestions: exactly 2 topic labels that ARE well-represented in the evidence pool (derive these from the actual creator names, video titles, and content visible in [E0]-[E19] — do not invent)
- Still populate relatedSignals with any score-1 items found

Do not fabricate themes. Do not produce a synthesis. Only output the fallback suggestions and any genuine related signals.

═══ STEP 8: SYNTHESIS ═══

3-5 sentences directly answering what the evidence says about the query. Draw ONLY from Key Themes.

Mandatory honest language:
- Weak/isolated evidence: "Evidence supporting this finding is weak and limited to isolated anecdotal mentions."
- Mixed/polarized: "Data is highly fragmented; creators present directly opposing operational execution strategies."
- Insufficient: "Insufficient data in current transcript pool to formulate an objective research thesis on [topic]."
- Never fabricate certainty. Never invent conclusions beyond what the evidence explicitly supports.

Return ONLY valid JSON:
${JSON.stringify({
  topic: "2-4 word label",
  topicIntent: "What IS in scope + what is rejected. 2-3 sentences.",
  themes: [
    {
      title: "Explicit topic-specific title (3-6 words)",
      marketSignal: "1-sentence analytical verdict — what this implies for operators or market participants",
      description: "What creators specifically say. 2-3 sentences grounded in evidence only.",
      relevanceReason: "This answers the query because...",
      sourceRefs: [{ idx: 0, quote: "Verbatim quote — only if it passes the 90% confidence gate for this theme" }],
      representativeRefIdx: 0,
      creatorConsensus: {
        agree:    [{ creator: "Exact creator name from evidence pool", reason: "1-sentence mechanical reason" }],
        neutral:  [{ creator: "Exact creator name", reason: "1-sentence reason" }],
        disagree: [{ creator: "Exact creator name", reason: "1-sentence explicit point of friction" }],
      },
      contrarians: [],
    },
  ],
  relatedSignals: [
    {
      title: "Adjacent topic",
      description: "How this relates to but does not answer the query.",
      sourceRefs: [{ idx: 5, quote: "Verbatim quote from [E5]" }],
    },
  ],
  synthesis: "Cold, clinical 3-5 sentence answer. Use weak/fragmented/insufficient language where warranted. Never fabricate certainty.",
  suggestions: ["Topic actually found in evidence pool", "Second topic actually found in evidence pool"],
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
      marketSignal: sanitizeText(t.marketSignal ?? ""),
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
    suggestions: (raw.suggestions ?? []).map(s => sanitizeText(s)).filter(Boolean).slice(0, 2),
    totalIndexed: stats.withEmbeddings,
  };

  return NextResponse.json(report);
}
