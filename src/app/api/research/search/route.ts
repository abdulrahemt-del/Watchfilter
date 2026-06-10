import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { loadResearchIndex, getResearchIndexStats, type ResearchRow } from "@/lib/db";
import { embedText, cosineSim } from "@/lib/research/embed";
import { sanitizeText } from "@/lib/utils/sanitize";

export const runtime = "nodejs";
export const maxDuration = 90;

const openai = new OpenAI();

// ── Public types ───────────────────────────────────────────────────────────────

export interface SourceRef {
  quote: string;
  whyItSupports: string;
  creator: string;
  videoTitle: string;
  videoId: string;
  timestampStr: string | null;
  signalStrength: string | null;
}

export interface QuoteCluster {
  theme: string;
  sourceRefs: SourceRef[];
}

export interface ResearchHypothesisResult {
  statement: string;
  relatedQuestion: number;
  status: "supported" | "rejected" | "inconclusive";
  supportStrength: number;
  supportingCreators: number;
  contradictingCreators: number;
  rejectionReason: string | null;
}

export interface ResearchFinding {
  statement: string;
  hypothesisIndex: number;
  testedHypothesis: string;
  answersQuestion: number;
  evidenceCount: number;
  creatorCount: number;
  videoCount: number;
  consensusStrength: "Strong" | "Moderate" | "Weak" | "Insufficient";
  confidenceScore: number;
  confidence: "High" | "Moderate" | "Limited";
  clusters: QuoteCluster[];
}

export interface ResearchPattern {
  patternType:
    | "repeated_behavior"
    | "repeated_outcome"
    | "repeated_strategy"
    | "repeated_mistake"
    | "success_factor"
    | "failure_factor";
  description: string;
  creatorCount: number;
}

export interface CreatorStance {
  creator: string;
  stance: "agree" | "neutral" | "disagree";
  reason: string;
}

export interface ContraFinding {
  statement: string;
  sourceRef: SourceRef;
}

export interface ResearchAction {
  category: "decision" | "task" | "experiment" | "content_opportunity";
  title: string;
  description: string;
  derivedFrom: string;
  confidenceScore: number;
}

export interface ResearchImplication {
  statement: string;
  basedOnFindings: string;
}

export interface ResearchReport {
  query: string;
  researchObjective: string;
  topic: string;
  subtopics: string[];
  researchQuestions: string[];
  hypotheses: ResearchHypothesisResult[];
  evidenceQuality: "Strong" | "Moderate" | "Limited" | "Insufficient";
  videosMatched: number;
  creatorsMatched: number;
  quotesUsed: number;
  quotesRejected: number;
  coverageScore: number;
  consensusScore: number;
  confidenceScore: number;
  findings: ResearchFinding[];
  patterns: ResearchPattern[];
  contrarian: ContraFinding | null;
  consensusMap: CreatorStance[];
  conclusions: string;
  implications: ResearchImplication[];
  actions: ResearchAction[];
  evidenceGaps: string;
  totalIndexed: number;
}

// ── GPT raw types ──────────────────────────────────────────────────────────────

interface RawFramework {
  researchObjective: string;
  topic: string;
  subtopics: string[];
  researchQuestions: string[];
  hypotheses: string[];
}

interface RawRef { idx: number; quote: string; whyItSupports: string; }
interface RawCluster { theme: string; evidenceRefs: RawRef[]; }
interface RawFinding {
  statement: string;
  hypothesisIdx: number;
  answersQuestion: number;
  confidenceScore: number;
  clusters: RawCluster[];
}
interface RawHypothesisTested {
  hypothesisIdx: number;
  statement: string;
  relatedQuestion: number;
  supportingRefs: number[];
  contradictingRefs: number[];
  supportStrength: number;
  supportingCreators: number;
  contradictingCreators: number;
  status: "supported" | "rejected" | "inconclusive";
  rejectionReason: string | null;
}
interface RawPattern {
  patternType: string;
  description: string;
  creatorCount: number;
}
interface RawCreatorStance { creator: string; stance: "agree" | "neutral" | "disagree"; reason: string; }
interface RawSynthesis {
  evidenceQuality: string;
  consensusScore: number;
  confidenceScore: number;
  quotesUsed: number;
  quotesRejected: number;
  coverageScore: number;
  hypothesisTesting: RawHypothesisTested[];
  findings: RawFinding[];
  patterns: RawPattern[];
  contrarian: { statement: string; evidenceRef: RawRef } | null;
  consensusMap: RawCreatorStance[];
  conclusions: string;
  implications: { statement: string; basedOnFindings: string }[];
  actions: { category: string; title: string; description: string; derivedFrom: string; confidenceScore: number }[];
  evidenceGaps: string;
}

// ── Hard confidence caps by creator count ─────────────────────────────────────

function capConfidence(score: number, creatorCount: number): number {
  const max =
    creatorCount >= 7 ? 95
    : creatorCount >= 5 ? 85
    : creatorCount >= 3 ? 75
    : creatorCount >= 2 ? 65
    : 55;
  return Math.min(score, max);
}

// ── Enforce hypothesis status server-side ──────────────────────────────────────
// GPT cannot override these rules.

function enforceHypothesisStatus(raw: RawHypothesisTested): ResearchHypothesisResult["status"] {
  if (raw.supportingCreators === 0 || raw.supportStrength < 20) return "rejected";
  if (raw.supportingCreators < 2) return "inconclusive";
  if (raw.supportStrength < 40) return "inconclusive";
  return "supported";
}

// ── Call 1: Research design + hypothesis generation ────────────────────────────

const RESEARCH_DESIGN_SYSTEM = `You are a research director generating a research design before any evidence is seen.

Given a search query, output:
1. researchObjective — What the user is REALLY asking (1 sentence, not a restatement of the query)
2. topic — Clean 2-4 word label
3. subtopics — 6-10 specific dimensions to investigate
4. researchQuestions — 4-5 specific analytical questions (not circular, not definitional)
5. hypotheses — 5-10 testable claims that COULD answer the research objective

HYPOTHESIS RULES:
Hypotheses are testable claims. They can be proven or disproven by evidence.
They must be specific. They must make a claim about behavior, outcome, frequency, or comparison.

BANNED hypothesis patterns:
  "X is important" / "X matters" / "X helps" / "X is key"
  Any hypothesis that cannot be falsified

GOOD hypothesis examples (for query "distribution channels"):
  "Partnerships consistently produce the first 100 customers more often than paid advertising"
  "Content marketing requires 6+ months before generating measurable acquisition returns"
  "Product-led growth shows stronger unit economics than sales-led models at early stage"
  "Cold outreach achieves higher conversion for enterprise than SMB across creator accounts"
  "Referral programs consistently generate the highest-LTV customers relative to other channels"
  "Paid advertising becomes effective only after achieving product-market fit"
  "Community-based distribution outperforms influencer marketing for B2B products"

Return ONLY valid JSON:
{"researchObjective":"...","topic":"...","subtopics":["..."],"researchQuestions":["Q0: ...","Q1: ...","Q2: ...","Q3: ...","Q4: ..."],"hypotheses":["H0: ...","H1: ...","H2: ...","H3: ...","H4: ...","H5: ..."]}`;

async function generateResearchDesign(query: string): Promise<RawFramework> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: RESEARCH_DESIGN_SYSTEM },
      { role: "user",   content: `Query: "${query}"` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 800,
  });
  return JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}")) as RawFramework;
}

// ── Call 2: Hypothesis testing + synthesis ─────────────────────────────────────

function buildTestingPrompt(framework: RawFramework): string {
  const hypothesesBlock = framework.hypotheses.map((h, i) => `H${i}: ${h}`).join("\n");
  const questionsBlock = framework.researchQuestions.map((q, i) => `Q${i}: ${q}`).join("\n");

  return [
    "You are a hypothesis-driven research analyst.",
    "Your job: TEST each hypothesis against evidence. Then generate findings ONLY from hypotheses that survive.",
    "",
    "═══ RESEARCH DESIGN ═══",
    `Research Objective: ${framework.researchObjective}`,
    "",
    "Research Questions:",
    questionsBlock,
    "",
    "Hypotheses to test:",
    hypothesesBlock,
    "",
    "═══ PHASE A: HYPOTHESIS TESTING ═══",
    "For each hypothesis H0-H{n}, examine the evidence pool and determine:",
    "",
    "1. SUPPORTING EVIDENCE: Which [E] items DIRECTLY support this hypothesis?",
    "   Direct = the quote explicitly demonstrates the claim in the hypothesis.",
    "   Indirect / related / merely-mentioned = does NOT count as support.",
    "",
    "2. CONTRADICTING EVIDENCE: Which [E] items explicitly argue AGAINST this hypothesis?",
    "",
    "3. SUPPORTING CREATORS: Count distinct creators in the supporting refs.",
    "",
    "4. SUPPORT STRENGTH: Score 0-100.",
    "   0  = no evidence",
    "   20 = tangentially mentioned once",
    "   40 = 1 creator with direct evidence",
    "   60 = 2 creators with direct evidence",
    "   75 = 3-4 creators with strong direct evidence",
    "   90 = 5+ creators with strong direct evidence",
    "",
    "5. VERDICT:",
    "   SUPPORTED    = supportingCreators ≥ 2 AND supportStrength ≥ 40 AND not fatally contradicted",
    "   INCONCLUSIVE = supportingCreators = 1 OR contradicting evidence exists without a clear winner",
    "   REJECTED     = supportingCreators = 0 OR evidence directly refutes the hypothesis",
    "",
    "   Note: rejectionReason must explain WHY — not just say 'insufficient evidence'.",
    "   Good: 'Only 1 creator cited partnerships, and another explicitly said cold outreach outperformed it for them'",
    "   Bad:  'Not enough evidence'",
    "",
    "═══ PHASE B: FINDINGS (SUPPORTED HYPOTHESES ONLY) ═══",
    "Generate a finding for each SUPPORTED hypothesis.",
    "Do NOT generate findings for REJECTED or INCONCLUSIVE hypotheses.",
    "",
    "A finding is NOT a quote summary.",
    "A finding answers: 'What does the evidence collectively suggest about this hypothesis?'",
    "It must contain one of:",
    "  - A causal or correlational claim ('X appears before Y across N cases')",
    "  - A frequency observation ('7 of 8 creators who did X reported Y')",
    "  - A comparative outcome ('Channel A outperformed Channel B in N creator accounts')",
    "  - A pattern ('Founders who did X consistently reported Y within Z timeframe')",
    "",
    "BANNED finding patterns:",
    "  'X is important' / 'X matters' / 'X helps' / 'Adaptability is key'",
    "  Generic business advice that could apply to any topic without the evidence",
    "",
    "Each finding must include clusters of supporting evidence organized by sub-theme.",
    "",
    "═══ PHASE C: PATTERNS ═══",
    "Identify patterns that emerge across multiple creators — independent of hypotheses.",
    "Minimum 2 creators per pattern. Specific, not generic.",
    "",
    "═══ PHASE D: CONCLUSIONS ═══",
    "What does the totality of SUPPORTED hypotheses and patterns suggest?",
    "State what a rational observer should conclude.",
    "Be honest about what remains unanswered.",
    "",
    "═══ CONFIDENCE CALIBRATION ═══",
    "Hard caps by creator count (server enforces, but set correctly):",
    "  1 creator → max 55 | 2 → max 65 | 3-4 → max 75 | 5-6 → max 85 | 7+ → max 95",
    "",
    "═══ CONTRARIAN RULE ═══",
    "Only if a creator explicitly argues the opposite of a supported hypothesis.",
    "Never invent disagreement. If none: contrarian = null.",
    "",
    "═══ ACTIONABLE INTELLIGENCE ═══",
    "Categories: decision / task / experiment / content_opportunity",
    "Each action ties directly to a supported finding.",
    "",
    "Return ONLY valid JSON:",
    JSON.stringify({
      evidenceQuality: "Strong | Moderate | Limited | Insufficient",
      consensusScore: 7,
      confidenceScore: 65,
      quotesUsed: 12,
      quotesRejected: 5,
      coverageScore: 60,
      hypothesisTesting: [
        {
          hypothesisIdx: 0,
          statement: "Partnerships consistently produce first 100 customers more often than paid ads",
          relatedQuestion: 0,
          supportingRefs: [0, 3, 7],
          contradictingRefs: [],
          supportStrength: 72,
          supportingCreators: 3,
          contradictingCreators: 0,
          status: "supported",
          rejectionReason: null,
        },
        {
          hypothesisIdx: 1,
          statement: "SEO is the primary scalable channel for founders without large networks",
          relatedQuestion: 2,
          supportingRefs: [5],
          contradictingRefs: [12],
          supportStrength: 28,
          supportingCreators: 1,
          contradictingCreators: 1,
          status: "rejected",
          rejectionReason: "Only 1 creator mentioned SEO, and another explicitly argued it took 18 months to produce results — making it impractical for early-stage acquisition",
        },
      ],
      findings: [
        {
          statement: "Evidence confirms across 3 creators: partnerships produced the first 100 customers faster than any other channel tested",
          hypothesisIdx: 0,
          answersQuestion: 0,
          confidenceScore: 68,
          clusters: [
            {
              theme: "Partnership acceleration",
              evidenceRefs: [
                { idx: 0, quote: "Direct quote proving the finding", whyItSupports: "Why this proves the hypothesis" },
              ],
            },
          ],
        },
      ],
      patterns: [
        {
          patternType: "repeated_behavior",
          description: "Specific repeated behavior observed across N creators — not generic",
          creatorCount: 3,
        },
      ],
      contrarian: null,
      consensusMap: [
        { creator: "Creator Name", stance: "agree", reason: "What they specifically said" },
      ],
      conclusions: "2-3 sentences: what a rational observer should conclude from supported hypotheses. Honest about rejected/inconclusive hypotheses and what remains unknown.",
      implications: [
        { statement: "Implication flowing directly from a supported hypothesis", basedOnFindings: "H0 finding" },
      ],
      actions: [
        { category: "task", title: "Specific action + measurable outcome", description: "How to execute", derivedFrom: "H0 finding", confidenceScore: 72 },
      ],
      evidenceGaps: "Which hypotheses were rejected or inconclusive, and what additional evidence would resolve them.",
    }, null, 2),
  ].join("\n");
}

// ── Evidence block ─────────────────────────────────────────────────────────────

function buildEvidenceBlock(rows: ResearchRow[], scores: number[], uniqueCreators: string[]): string {
  const items = rows.slice(0, 20).map((r, i) => [
    `[E${i}] Relevance: ${(scores[i] * 100).toFixed(0)}%`,
    `Creator: ${r.channel_name ?? "Unknown"}`,
    `Video: ${r.video_title ?? "Unknown"}`,
    r.timestamp_str ? `Timestamp: ${r.timestamp_str}` : null,
    r.quote ? `Quote: "${r.quote}"` : null,
    r.insight ? `Insight: ${r.insight}` : null,
    r.why_matters ? `Business implication: ${r.why_matters}` : null,
    r.signal_strength ? `Signal: ${r.signal_strength}` : null,
    r.contrarian ? `Contrarian angle: ${r.contrarian}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");

  return `Creators in pool: ${uniqueCreators.join(", ")}\n\n${items}`;
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

  // Call 1 and embedding run in parallel — neither depends on the other
  const [framework, queryVec] = await Promise.all([
    generateResearchDesign(query),
    embedText(query),
  ]);

  // ── Vector search ────────────────────────────────────────────────────────────
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

  // ── Call 2: Hypothesis testing + synthesis ───────────────────────────────────
  const uniqueCreators = [...new Set(topRows.map(r => r.channel_name).filter(Boolean))] as string[];
  const evidenceBlock = buildEvidenceBlock(topRows, topScores, uniqueCreators);

  const userMessage = [
    `Research Objective: "${framework.researchObjective}"`,
    "",
    "Hypotheses to test:",
    ...framework.hypotheses.map((h, i) => `H${i}: ${h}`),
    "",
    "Research Questions (for context):",
    ...framework.researchQuestions.map((q, i) => `Q${i}: ${q}`),
    "",
    `Evidence Pool (${topRows.length} items from ${uniqueCreators.length} creators):`,
    "",
    evidenceBlock,
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: buildTestingPrompt(framework) },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 4000,
  });

  let raw: RawSynthesis;
  try {
    raw = JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}")) as RawSynthesis;
  } catch {
    return NextResponse.json({ error: "Synthesis failed" }, { status: 500 });
  }

  // ── Enrich refs: route fills creator/video/timestamp from indexed rows ────────
  function enrichRef(ref: RawRef): SourceRef {
    const row = topRows[ref.idx] ?? topRows[0];
    return {
      quote: sanitizeText(ref.quote ?? row.quote ?? ""),
      whyItSupports: sanitizeText(ref.whyItSupports ?? ""),
      creator: row.channel_name ?? "Unknown",
      videoTitle: row.video_title ?? "Unknown video",
      videoId: row.video_id,
      timestampStr: row.timestamp_str ?? null,
      signalStrength: row.signal_strength ?? null,
    };
  }

  // ── Build hypothesis results with server-side status enforcement ──────────────
  const hypotheses: ResearchHypothesisResult[] = (raw.hypothesisTesting ?? []).map(h => {
    const enforcedStatus = enforceHypothesisStatus(h);
    const cappedStrength = capConfidence(h.supportStrength ?? 0, h.supportingCreators ?? 0);
    return {
      statement: sanitizeText(h.statement ?? framework.hypotheses[h.hypothesisIdx] ?? ""),
      relatedQuestion: typeof h.relatedQuestion === "number" ? h.relatedQuestion : 0,
      status: enforcedStatus,
      supportStrength: cappedStrength,
      supportingCreators: h.supportingCreators ?? 0,
      contradictingCreators: h.contradictingCreators ?? 0,
      rejectionReason: h.rejectionReason ? sanitizeText(h.rejectionReason) : null,
    };
  });

  // Only findings whose hypothesis passed server-side enforcement are kept
  const supportedIndices = new Set(
    hypotheses.map((h, i) => ({ h, i }))
      .filter(({ h }) => h.status === "supported")
      .map(({ i }) => i)
  );

  // ── Build findings (only from supported hypotheses) ───────────────────────────
  const findings: ResearchFinding[] = (raw.findings ?? [])
    .filter(f => supportedIndices.has(f.hypothesisIdx))
    .map(f => {
      const clusters: QuoteCluster[] = (f.clusters ?? []).map(cl => ({
        theme: sanitizeText(cl.theme ?? ""),
        sourceRefs: (cl.evidenceRefs ?? []).map(enrichRef),
      }));

      const allRefs = clusters.flatMap(cl => cl.sourceRefs);
      const uniqueCreatorsInFinding = new Set(allRefs.map(r => r.creator));
      const uniqueVideos = new Set(allRefs.map(r => r.videoId));
      const creatorCount = uniqueCreatorsInFinding.size;

      const consensusStrength: ResearchFinding["consensusStrength"] =
        creatorCount >= 4 ? "Strong"
        : creatorCount === 3 ? "Moderate"
        : creatorCount === 2 ? "Weak"
        : "Insufficient";

      const cappedScore = capConfidence(f.confidenceScore ?? 50, creatorCount);
      const confidence: ResearchFinding["confidence"] =
        cappedScore >= 70 ? "High" : cappedScore >= 50 ? "Moderate" : "Limited";

      const hypothesisStatement = hypotheses[f.hypothesisIdx]?.statement
        ?? framework.hypotheses[f.hypothesisIdx]
        ?? "";

      return {
        statement: sanitizeText(f.statement ?? ""),
        hypothesisIndex: f.hypothesisIdx,
        testedHypothesis: sanitizeText(hypothesisStatement),
        answersQuestion: typeof f.answersQuestion === "number" ? f.answersQuestion : 0,
        evidenceCount: allRefs.length,
        creatorCount,
        videoCount: uniqueVideos.size,
        consensusStrength,
        confidenceScore: cappedScore,
        confidence,
        clusters,
      };
    });

  // ── Build remaining ──────────────────────────────────────────────────────────
  const VALID_PATTERN_TYPES = new Set([
    "repeated_behavior", "repeated_outcome", "repeated_strategy",
    "repeated_mistake", "success_factor", "failure_factor",
  ]);

  const patterns: ResearchPattern[] = (raw.patterns ?? []).map(p => ({
    patternType: VALID_PATTERN_TYPES.has(p.patternType)
      ? p.patternType as ResearchPattern["patternType"]
      : "repeated_behavior",
    description: sanitizeText(p.description ?? ""),
    creatorCount: typeof p.creatorCount === "number" ? p.creatorCount : 0,
  }));

  const contrarian: ContraFinding | null = raw.contrarian
    ? { statement: sanitizeText(raw.contrarian.statement ?? ""), sourceRef: enrichRef(raw.contrarian.evidenceRef) }
    : null;

  const consensusMap: CreatorStance[] = (raw.consensusMap ?? []).map(s => ({
    creator: sanitizeText(s.creator ?? ""),
    stance: (["agree", "neutral", "disagree"].includes(s.stance) ? s.stance : "neutral") as CreatorStance["stance"],
    reason: sanitizeText(s.reason ?? ""),
  }));

  const VALID_ACTION_CATEGORIES = new Set(["decision", "task", "experiment", "content_opportunity"]);
  const actions: ResearchAction[] = (raw.actions ?? []).map(a => ({
    category: VALID_ACTION_CATEGORIES.has(a.category)
      ? a.category as ResearchAction["category"]
      : "task",
    title: sanitizeText(a.title ?? ""),
    description: sanitizeText(a.description ?? ""),
    derivedFrom: sanitizeText(a.derivedFrom ?? ""),
    confidenceScore: typeof a.confidenceScore === "number" ? a.confidenceScore : 60,
  }));

  const videoIds = new Set(topRows.map(r => r.video_id));
  const creatorsInPool = new Set(topRows.map(r => r.channel_name).filter(Boolean));

  const VALID_QUALITY = ["Strong", "Moderate", "Limited", "Insufficient"] as const;
  const evidenceQuality = VALID_QUALITY.includes(raw.evidenceQuality as typeof VALID_QUALITY[number])
    ? raw.evidenceQuality as ResearchReport["evidenceQuality"]
    : "Moderate";

  // Coverage = fraction of research questions that have at least one finding
  const questionsCovered = new Set(findings.map(f => f.answersQuestion));
  const coverageScore = framework.researchQuestions.length > 0
    ? Math.round((questionsCovered.size / framework.researchQuestions.length) * 100)
    : 0;

  const overallConfidence = capConfidence(raw.confidenceScore ?? 50, creatorsInPool.size);

  const report: ResearchReport = {
    query,
    researchObjective: sanitizeText(framework.researchObjective ?? query),
    topic: sanitizeText(framework.topic ?? query),
    subtopics: (framework.subtopics ?? []).map(s => sanitizeText(s)),
    researchQuestions: (framework.researchQuestions ?? []).map(q => sanitizeText(q)),
    hypotheses,
    evidenceQuality,
    videosMatched: videoIds.size,
    creatorsMatched: creatorsInPool.size,
    quotesUsed: raw.quotesUsed ?? findings.reduce((n, f) => n + f.evidenceCount, 0),
    quotesRejected: raw.quotesRejected ?? 0,
    coverageScore,
    consensusScore: raw.consensusScore ?? 5,
    confidenceScore: overallConfidence,
    findings,
    patterns,
    contrarian,
    consensusMap,
    conclusions: sanitizeText(raw.conclusions ?? ""),
    implications: (raw.implications ?? []).map(i => ({
      statement: sanitizeText(i.statement),
      basedOnFindings: sanitizeText(i.basedOnFindings),
    })),
    actions,
    evidenceGaps: sanitizeText(raw.evidenceGaps ?? ""),
    totalIndexed: stats.withEmbeddings,
  };

  return NextResponse.json(report);
}
