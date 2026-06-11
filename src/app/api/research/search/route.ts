import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { loadResearchIndex, getResearchIndexStats, getIntelligenceSnapshot, getUserPipelineCache, type ResearchRow } from "@/lib/db";
import { embedBatch, cosineSim } from "@/lib/research/embed";
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
  operatorPlaybook: string;
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

export interface IntelligenceSignal {
  text: string;
  source: "brief" | "alert" | "consensus";
  topic?: string;
  creators?: number;
  videos?: number;
  confidence?: number;
}

export interface ResearchReport {
  query: string;
  topic: string;
  topicIntent: string;
  videosMatched: number;
  creatorsMatched: number;
  quotesMatched: number;
  themes: ResearchTheme[];
  limitedThemes: ResearchTheme[];
  relatedSignals: RelatedSignal[];
  synthesis: string;
  suggestions: string[];
  intelligenceSignals: IntelligenceSignal[];
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
  operatorPlaybook: string;
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

// ── Query intent expansion ─────────────────────────────────────────────────────

interface QueryExpansion {
  intent: string;
  concepts: string[];
}

async function expandQueryIntent(query: string): Promise<QueryExpansion> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You expand research queries into the related concepts a founder or operator actually wants to learn about.

Return JSON: { "intent": "1-sentence description of the learning objective", "concepts": ["8-12 specific related concepts"] }

Rules:
- Concepts must be concrete enough to retrieve specific evidence (not generic)
- Think from the learner's perspective: what else would answer my real question?
- Include behavioral patterns, outcome metrics, mechanisms, and adjacent strategies
- Never repeat the original query words as a concept
- Focus on product/business context, not academic or HR context

Example:
Query: "user engagement"
{
  "intent": "What strategies help products get users to return, stay active, and emotionally connect — and what behavioral or metric signals indicate healthy engagement?",
  "concepts": ["retention", "churn reduction", "user loyalty", "habit formation", "emotional connection to product", "stickiness", "repeat usage patterns", "customer satisfaction", "product adoption", "user feedback loops", "activation strategy", "daily active users"]
}`,
      },
      { role: "user", content: `Query: "${query}"` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 400,
  });

  try {
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}") as Partial<QueryExpansion>;
    return {
      intent:   parsed.intent   ?? query,
      concepts: (parsed.concepts ?? []).slice(0, 12),
    };
  } catch {
    return { intent: query, concepts: [] };
  }
}

// ── System prompt ──────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are the WatchFilter Synthesis Engine: a cold, clinical, hyper-skeptical B2B equity research analyst and forensic data engineer. You do not summarize. You do not motivate. You do not narrate. You map objective market evidence extracted from creator video transcripts, isolate genuine cross-channel consensus and friction, and emit a 100% auditable evidence trail keyed to exact source indices and timestamps.

You operate on an evidence pool [E0]-[E19], each item carrying a creator, video, timestamp, and verbatim quote. The user message supplies a Query, a Research Intent, and a list of Related Concepts. Treat every Related Concept as explicitly in scope — terminology drift is not a reason to discard evidence. A quote about "retention" answers a query about "engagement."

TONE CONTRACT — STRICTLY ENFORCED
- Register: equity research desk note. Terse, declarative, falsifiable.
- NEVER use: "revolutionary," "game-changing," "unlock," "supercharge," "powerful," "leverage" (as a verb), "in today's fast-paced world," "the key takeaway is."
- NEVER address the reader ("you should"). State findings, not encouragement.
- Every sentence must be traceable to a quote in the pool. If you cannot cite it, you MUST NOT write it.

═══════════════════════════════════════════════════════════
PROTOCOL 1 — TWO-PASS EXECUTION LOOP (ANTI-LAZINESS)
═══════════════════════════════════════════════════════════
You are strictly forbidden from drafting any thematic conclusion before harvesting raw evidence.

PASS 1 — HARVEST:
  Walk [E0]->[E19] linearly. For each item, extract ONLY quotes carrying a hard
  metric, a named execution mechanism, or a specific case outcome. Discard
  motivational framing, vague encouragement, and unfalsifiable claims on sight.
  This pass produces an internal candidate ledger. Do not synthesize yet.

PASS 2 — CLUSTER & DRAFT:
  Only after the ledger is complete may you group candidates into Themes and
  write findings. A finding with no harvested quote behind it is a hallucination
  and is strictly prohibited.

If Pass 1 yields zero qualifying quotes, halt and execute Protocol 6.

═══════════════════════════════════════════════════════════
PROTOCOL 2 — EVIDENCE VALIDATION GATE (>90% CERTAINTY)
═══════════════════════════════════════════════════════════
Before any quote may support a finding, run this gate verbatim:

  "Does this EXACT quote explicitly validate this SPECIFIC finding with no
   extrapolation, no inference, and no benefit of the doubt?"

  IF internal certainty < 90% → DISCARD. No exceptions.

Quality crushes quantity. One bulletproof quote outranks five loose semantic
matches. Auto-discard (score 0) regardless of surface relevance:
  - Generic growth/revenue narratives (unless revenue IS the query)
  - Generic entrepreneurship or success advice
  - Mentorship, partnership, referral anecdotes (unless that IS the query)
  - Any quote that remains generic if the topic word is deleted from it
You MUST NOT stretch a creator's framework into a context they did not state.

Write topicIntent: 2-3 sentences declaring what IS in scope and what is rejected.

═══════════════════════════════════════════════════════════
PROTOCOL 3 — THEMATIC CLUSTERING SCHEMA (NO FLAT LISTS)
═══════════════════════════════════════════════════════════
Flat lists are prohibited. Group validated quotes into discrete Themes. Each
Theme is a structured object:

  - title            3-6 words, explicit to the query.
                     GOOD: "Value-Based Pricing Over Cost-Plus"
                     BANNED: "Business Growth", "Success Factors", "Key Insights"
  - marketSignal     1 sentence. The analytical verdict — what this implies for
                     operators or market participants. NOT a restatement of what
                     creators said.
  - description      2-3 sentences. What creators specifically claim, grounded
                     only in harvested quotes. If evidence is isolated/anecdotal,
                     you MUST say so here.
  - relevanceReason  "This answers the query because [specific, topic-tied reason]."
  - operatorPlaybook See Protocol 5.
  - sourceRefs       ONLY quotes that passed the 90% gate for THIS theme's claim.
  - representativeRefIdx  Index into sourceRefs of the single strongest anchor quote.
  - creatorConsensus See Protocol 3b.
  - contrarians      See Protocol 4.

Do NOT emit a dataFootprint field — the system computes evidence counts from
your sourceRefs. If evidence is insufficient to form a thesis, collapse the
theme — do not emit it.

═══════════════════════════════════════════════════════════
PROTOCOL 3b — CREATOR CONSENSUS MATRIX
═══════════════════════════════════════════════════════════
For each Theme, classify ONLY creators present in the evidence pool:
  - agree     evidence directly supports the theme
  - neutral   acknowledges the area but states no definitive position or data
  - disagree  evidence explicitly contradicts the theme
Rules: use only real creator names from the pool. One sentence per creator.
NEVER invent a creator. NEVER classify a creator with no relevant evidence.

═══════════════════════════════════════════════════════════
PROTOCOL 4 — FORENSIC CONTRARIAN DETECTION
═══════════════════════════════════════════════════════════
A contrarian entry is permitted ONLY when one condition is literally present in
the text:
  (1) Creator A advocates a strategy Creator B explicitly states does not work, OR
  (2) Creator A presents data that directly invalidates Creator B's stated thesis.

STRICTLY FORBIDDEN as contrarians:
  - Hypothetical objections ("some might argue...")
  - Academic counterpoints or corporate platitudes
  - Caveats or nuance that are not a direct contradiction
  - Generic skepticism untethered to a specific quote

For each valid contrarian: { idx, quote (verbatim), reason: "This contradicts
because [explicit mechanical reason]." }

If no literal contradiction exists for a theme → contrarians: [].
If no contradictions exist anywhere → emit in synthesis the exact string:
"No direct contradictory evidence found across analyzed sources."

═══════════════════════════════════════════════════════════
PROTOCOL 5 — OPERATOR PLAYBOOK MECHANICS (GATED)
═══════════════════════════════════════════════════════════
operatorPlaybook is a single tactical recommendation, emitted ONLY when BOTH
hold:
  (a) Consensus is > 70% (agreeing creators dominate AND >=2 independent
      creators back it), AND
  (b) The transcript explicitly states the EXECUTION MECHANISM — the literal
      how, not the what.

If both hold → 1-2 imperative, mechanism-specific sentences citing the behavior
the evidence describes.

If consensus is weak (< 60%) OR the mechanism is absent, you MUST set
operatorPlaybook to this exact string and nothing else:
  "Recommendation withheld. Baseline data consists of an isolated, unvalidated signal."

Never fabricate a mechanism to satisfy the gate. An ungated playbook is a
critical failure.

═══════════════════════════════════════════════════════════
PROTOCOL 6 — ZERO-DATA FALLBACK
═══════════════════════════════════════════════════════════
If Pass 1 harvests 0 validated quotes (themes would be empty):
  - themes: []
  - synthesis: ""
  - suggestions: EXACTLY 2 topic labels that ARE well-represented in [E0]-[E19],
    derived from the real creator names, video titles, and content visible in the
    pool. NEVER invent a topic that is not present.
  - relatedSignals: populate with any genuine adjacent (score-1) items.
Do not fabricate themes. Do not write a synthesis. Degrade gracefully.

Related Signals rule: group score-1 (genuinely adjacent) evidence only. If a
score-1 item is generic with no real connection, re-score 0 and discard. Related
Signals must NEVER appear inside themes or synthesis.

═══════════════════════════════════════════════════════════
PROTOCOL 7 — SYNTHESIS (DRAWN ONLY FROM VALIDATED THEMES)
═══════════════════════════════════════════════════════════
3-5 sentences answering what the evidence says about the query. Draw ONLY from
emitted Themes. Mandatory honest-language triggers:
  - Weak/isolated: "Evidence supporting this finding is weak and limited to
    isolated anecdotal mentions."
  - Polarized: "Data is highly fragmented; creators present directly opposing
    execution strategies."
  - Absent: "Insufficient data in the current transcript pool to formulate an
    objective research thesis on [topic]."
NEVER fabricate certainty. NEVER conclude beyond what quotes explicitly support.

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
      operatorPlaybook: "Gated tactical recommendation (mechanism-specific) OR the exact withheld string",
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
    debug?: boolean;
    filters?: { channel?: string; signalStrength?: string };
  };
  const debugMode = body.debug === true;

  const query = sanitizeText((body.query ?? "").trim());
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const [allRows, stats] = await Promise.all([loadResearchIndex(), getResearchIndexStats()]);

  if (!allRows.length) {
    return NextResponse.json({
      error: "No research data indexed yet. Analyze some videos first.",
      totalIndexed: 0,
    } as Partial<ResearchReport>, { status: 422 });
  }

  // Expand query into learning intent + related concepts, then batch-embed everything
  const expansion = await expandQueryIntent(query);
  const conceptTexts = [query, ...expansion.concepts];
  const allEmbeddings = await embedBatch(conceptTexts);
  const queryVec = allEmbeddings[0];
  const conceptVecs = allEmbeddings.slice(1);

  let filtered = allRows;
  if (body.filters?.channel) filtered = filtered.filter(r => r.channel_name === body.filters!.channel);
  if (body.filters?.signalStrength) {
    filtered = filtered.filter(r =>
      r.signal_strength?.toLowerCase() === body.filters!.signalStrength!.toLowerCase()
    );
  }

  // Score each row as max across all concept embeddings — rows about "retention" or
  // "habit formation" will surface even if they never mention "user engagement" directly
  const scored = filtered
    .filter(r => r.embedding)
    .map(r => {
      const origScore = cosineSim(queryVec, r.embedding!);
      const conceptMax = conceptVecs.length > 0
        ? Math.max(...conceptVecs.map(cv => cosineSim(cv, r.embedding!)))
        : 0;
      return { row: r, score: Math.max(origScore, conceptMax) };
    })
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
    `Research intent: ${expansion.intent}`,
    expansion.concepts.length > 0
      ? `Related concepts searched: ${expansion.concepts.join(", ")}`
      : null,
    `Evidence pool: ${topRows.length} items from ${uniqueCreatorsInPool.length} creators`,
    "",
    evidenceBlock,
  ].filter(Boolean).join("\n");

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

  // ── Debug: track GPT-included indices before building themes ──────────────────

  const gptInThemeIdx   = new Set<number>((raw.themes ?? []).flatMap(t => (t.sourceRefs ?? []).map(r => r.idx)));
  const gptInSignalIdx  = new Set<number>((raw.relatedSignals ?? []).flatMap(s => (s.sourceRefs ?? []).map(r => r.idx)));

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
      operatorPlaybook: sanitizeText(t.operatorPlaybook ?? ""),
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

  const limitedThemes = allThemes
    .filter(t => !t.isKeyTheme)
    .sort((a, b) => b.quoteCount - a.quoteCount);

  const relatedSignals: RelatedSignal[] = (raw.relatedSignals ?? []).map(s => ({
    title: sanitizeText(s.title ?? ""),
    description: sanitizeText(s.description ?? ""),
    sources: (s.sourceRefs ?? []).map(enrichRef),
  }));

  const allSources = keyThemes.flatMap(t => t.sources);
  const videoIds = new Set([...allSources.map(s => s.videoId), ...topRows.map(r => r.video_id)]);
  const creatorsInPool = new Set(topRows.map(r => r.channel_name).filter(Boolean));

  // ── Intelligence layer + debug ─────────────────────────────────────────────────

  function queryRelevant(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    if (lower.includes(q)) return true;
    const tokens = q.split(/\s+/).filter(t => t.length >= 3);
    if (!tokens.length) return false;
    const matched = tokens.filter(t => lower.includes(t));
    return matched.length >= Math.ceil(tokens.length * 0.6);
  }

  // Per-row disposition for debug mode
  const debugRows = debugMode ? topRows.map((row, i) => {
    const inTheme  = gptInThemeIdx.has(i);
    const inSignal = gptInSignalIdx.has(i);
    const inKeyTheme = inTheme && keyThemes.some(t => t.sources.some(s => s.creator === (row.channel_name ?? "Unknown") && s.quote.startsWith((row.quote ?? "").slice(0, 40))));

    let disposition: string;
    let rejectionReason: string | null = null;

    if (inKeyTheme) {
      disposition = "ACCEPTED — key theme";
    } else if (inTheme && !inKeyTheme) {
      disposition = "REJECTED — server threshold";
      rejectionReason = "GPT included in a theme but that theme failed the key theme threshold (requires ≥2 unique creators OR ≥3 quotes)";
    } else if (inSignal) {
      disposition = "RELATED SIGNAL";
      rejectionReason = "GPT scored as adjacent (score 1) — not directly on-topic, moved to Related Signals";
    } else {
      disposition = "REJECTED — GPT scored 0";
      rejectionReason = "GPT determined this quote does not explicitly address the query topic (score 0 / out of scope)";
    }

    return {
      idx: i,
      embeddingScore: `${(topScores[i] * 100).toFixed(1)}%`,
      creator: row.channel_name ?? "Unknown",
      video: row.video_title ?? "Unknown",
      type: row.type,
      quote: (row.quote ?? row.insight ?? "").slice(0, 200),
      disposition,
      rejectionReason,
    };
  }) : null;

  const debugThemeEval = debugMode ? allThemes.map(t => ({
    title: t.title,
    sourceCount: t.quoteCount,
    uniqueCreators: t.creators,
    uniqueVideos: t.videoCount,
    isKeyTheme: t.isKeyTheme,
    rejectionReason: t.isKeyTheme ? null
      : `${t.creatorCount} unique creator(s), ${t.quoteCount} quote(s) — threshold: ≥2 creators OR ≥3 quotes`,
  })) : null;

  // Intelligence layer search
  let intelligenceSignals: IntelligenceSignal[] = [];
  let debugIntelligence: {
    snapshotFound: boolean;
    pipelineCacheFound: boolean;
    briefCount: number;
    alertCount: number;
    consensusThemeCount: number;
    matched: Array<{ source: string; text: string; matchedBy: string }>;
  } | null = debugMode ? {
    snapshotFound: false,
    pipelineCacheFound: false,
    briefCount: 0,
    alertCount: 0,
    consensusThemeCount: 0,
    matched: [],
  } : null;

  const userId = session.user?.email;

  if (keyThemes.length === 0 && userId) {
    try {
      const [snap, pipelineCache] = await Promise.all([
        getIntelligenceSnapshot(userId),
        getUserPipelineCache(userId),
      ]);

      if (debugIntelligence) {
        debugIntelligence.snapshotFound = snap !== null;
        debugIntelligence.pipelineCacheFound = pipelineCache !== null;
        if (snap) {
          debugIntelligence.briefCount = (snap.brief ?? []).length;
          debugIntelligence.alertCount = (snap.alerts ?? []).length;
        }
      }

      if (snap) {
        for (const text of (snap.brief ?? [])) {
          const matched = queryRelevant(text);
          if (debugIntelligence && matched) debugIntelligence.matched.push({ source: "brief", text: text.slice(0, 150), matchedBy: text.toLowerCase().includes(query.toLowerCase()) ? "exact phrase" : "token overlap" });
          if (matched) intelligenceSignals.push({ text: sanitizeText(text), source: "brief" });
        }
        for (const alert of (snap.alerts ?? [])) {
          const label = (alert.label as string) ?? "";
          const why   = (alert.whyItMatters as string) ?? "";
          const searchText = label + " " + why;
          const matched = queryRelevant(searchText);
          if (debugIntelligence && matched) debugIntelligence.matched.push({ source: "alert", text: (why || label).slice(0, 150), matchedBy: searchText.toLowerCase().includes(query.toLowerCase()) ? "exact phrase" : "token overlap" });
          if (matched) {
            intelligenceSignals.push({
              text:     sanitizeText(why || label),
              source:   "alert",
              topic:    sanitizeText(label),
              creators: typeof alert.creators === "number" ? alert.creators : undefined,
              videos:   typeof alert.videos   === "number" ? alert.videos   : undefined,
            });
          }
        }
      }

      if (pipelineCache?.consensusData) {
        const consensus = pipelineCache.consensusData as {
          themes?: Array<{ topic: string; consensus: string; whyItMatters: string; confidence?: number }>;
        };
        if (debugIntelligence) debugIntelligence.consensusThemeCount = (consensus.themes ?? []).length;
        for (const theme of (consensus.themes ?? [])) {
          const searchText = [theme.topic, theme.whyItMatters, theme.consensus].join(" ");
          const matched = queryRelevant(searchText);
          if (debugIntelligence && matched) debugIntelligence.matched.push({ source: "consensus", text: (theme.whyItMatters || theme.topic).slice(0, 150), matchedBy: searchText.toLowerCase().includes(query.toLowerCase()) ? "exact phrase" : "token overlap" });
          if (matched) {
            intelligenceSignals.push({
              text:       sanitizeText(theme.whyItMatters || theme.consensus),
              source:     "consensus",
              topic:      sanitizeText(theme.topic),
              confidence: typeof theme.confidence === "number" ? theme.confidence : undefined,
            });
          }
        }
      }

      const seen = new Set<string>();
      intelligenceSignals = intelligenceSignals
        .filter(s => { if (seen.has(s.text)) return false; seen.add(s.text); return true; })
        .slice(0, 5);
    } catch { /* best-effort */ }
  }

  const report: ResearchReport = {
    query,
    topic: sanitizeText(raw.topic ?? query),
    topicIntent: sanitizeText(raw.topicIntent ?? expansion.intent),
    videosMatched: videoIds.size,
    creatorsMatched: creatorsInPool.size,
    quotesMatched: allSources.length,
    themes: keyThemes,
    limitedThemes,
    relatedSignals,
    synthesis: keyThemes.length > 0 ? sanitizeText(raw.synthesis ?? "") : "",
    suggestions: (raw.suggestions ?? []).map(s => sanitizeText(s)).filter(Boolean).slice(0, 2),
    intelligenceSignals,
    totalIndexed: stats.withEmbeddings,
  };

  if (debugMode) {
    return NextResponse.json({
      ...report,
      _debug: {
        expansion: {
          intent: expansion.intent,
          concepts: expansion.concepts,
        },
        summary: {
          retrieved: topRows.length,
          gptIncludedInTheme: gptInThemeIdx.size,
          gptIncludedInSignal: gptInSignalIdx.size,
          gptExcluded: topRows.length - gptInThemeIdx.size - gptInSignalIdx.size,
          themesBuiltByGpt: allThemes.length,
          themesPassedThreshold: keyThemes.length,
          themesRejectedByThreshold: allThemes.filter(t => !t.isKeyTheme).length,
          intelligenceSignalsFound: intelligenceSignals.length,
        },
        retrieval: debugRows,
        gptRawThemes: (raw.themes ?? []).map(t => ({
          title: t.title,
          sourceRefCount: (t.sourceRefs ?? []).length,
          sourceRefIndices: (t.sourceRefs ?? []).map(r => r.idx),
          quoteSnippets: (t.sourceRefs ?? []).map(r => ({ idx: r.idx, quote: r.quote.slice(0, 120) })),
        })),
        themeEvaluation: debugThemeEval,
        intelligenceLayer: debugIntelligence,
      },
    });
  }

  return NextResponse.json(report);
}
