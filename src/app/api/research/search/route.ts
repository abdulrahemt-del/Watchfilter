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

export interface ResearchFinding {
  statement: string;
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
}

interface RawRef { idx: number; quote: string; whyItSupports: string; }
interface RawCluster { theme: string; evidenceRefs: RawRef[]; }
interface RawFinding {
  statement: string;
  answersQuestion: number;
  confidenceScore: number;
  clusters: RawCluster[];
}
interface RawPattern {
  patternType: string;
  description: string;
  creatorCount: number;
  evidenceRefs: number[];
}
interface RawCreatorStance { creator: string; stance: "agree" | "neutral" | "disagree"; reason: string; }
interface RawSynthesis {
  evidenceQuality: string;
  consensusScore: number;
  confidenceScore: number;
  quotesUsed: number;
  quotesRejected: number;
  coverageScore: number;
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

// ── Call 1: Framework generation ───────────────────────────────────────────────

const FRAMEWORK_SYSTEM = `You are a research director. Given a search query, generate a research framework.

Your job is to understand WHAT THE USER IS REALLY ASKING — not to restate the query.

Examples:
Query: "distribution channels"
→ researchObjective: "What customer acquisition channels actually worked, and which failed, according to creators with proven track records?"

Query: "founder market fit"
→ researchObjective: "What conditions and behaviors repeatedly appear before founder success, and can they be developed deliberately?"

Query: "pricing"
→ researchObjective: "Which pricing strategies consistently produced strong business outcomes, and under what conditions?"

Rules:
- researchObjective: The deeper intent (1 sentence). NOT the query restated.
- topic: Clean 2-4 word label for the research area.
- subtopics: 6-10 specific dimensions to investigate within this topic.
- researchQuestions: 4-5 specific analytical questions that evidence should answer. They must be answerable, not circular.

BANNED questions (circular / definitional / generic):
- "How important is X?"
- "What is X?"
- "Why does X matter?"
- "What role does X play?"

GOOD questions (specific, answerable, pattern-seeking):
- "Which [specific behaviors] appeared before [specific outcomes]?"
- "How did [approach A] compare to [approach B] across multiple creators?"
- "What conditions correlated with [specific outcome]?"
- "Which [X] failed repeatedly despite being commonly recommended?"

Return ONLY valid JSON:
{"researchObjective":"...","topic":"...","subtopics":["..."],"researchQuestions":["Q0: ...","Q1: ...","Q2: ...","Q3: ...","Q4: ..."]}`;

async function generateFramework(query: string): Promise<RawFramework> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: FRAMEWORK_SYSTEM },
      { role: "user",   content: `Query: "${query}"` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 600,
  });
  return JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}")) as RawFramework;
}

// ── Call 2: Evidence synthesis ─────────────────────────────────────────────────

function buildSynthesisPrompt(framework: RawFramework): string {
  return [
    "You are a research analyst. You have a research framework and a pool of evidence.",
    "Your job: discover what the evidence collectively suggests — not summarize what individual creators said.",
    "",
    `RESEARCH OBJECTIVE: ${framework.researchObjective}`,
    "",
    "RESEARCH QUESTIONS:",
    ...framework.researchQuestions.map((q, i) => `  Q${i}: ${q}`),
    "",
    "═══ PHASE A: EVIDENCE VALIDATION ═══",
    "For each [E0]-[E19], ask: Does this quote DIRECTLY answer one of the research questions above?",
    "ACCEPT: Quote explicitly demonstrates a specific behavior, outcome, strategy, or decision relevant to a question.",
    "REJECT: Quote is merely related, tangential, or about a different topic (e.g., retention quote for distribution query).",
    "Track: quotesUsed (accepted), quotesRejected (discarded).",
    "A report with 5 strong quotes beats a report with 15 weak ones.",
    "",
    "═══ PHASE B: PATTERN DISCOVERY ═══",
    "Before generating findings, identify patterns across multiple creators:",
    "  repeated_behavior — same action appears in 2+ creator stories",
    "  repeated_outcome  — same result observed across 2+ creators",
    "  repeated_strategy — same approach used by 2+ creators",
    "  repeated_mistake  — same error made by 2+ creators",
    "  success_factor    — condition present in most success stories",
    "  failure_factor    — condition present in most failure stories",
    "",
    "Pattern rules:",
    "  - Minimum 2 creators for a pattern",
    "  - Pattern description must be specific (not 'consistency matters')",
    "  - Good: 'Founders who did weekly customer calls shipped features with 2x higher retention'",
    "  - Bad: 'Customer feedback is important'",
    "",
    "═══ PHASE C: GENERATE FINDINGS ═══",
    "Each finding must:",
    "  a) Answer one research question (cite by index 0-4)",
    "  b) Emerge from validated evidence only",
    "  c) Reveal a pattern, relationship, causal claim, or repeated behavior",
    "  d) State what the evidence suggests — not what individual creators said",
    "  e) Group supporting quotes into sub-theme clusters",
    "",
    "BANNED findings (do not generate):",
    "  'X is important' / 'X matters' / 'Adaptability is key'",
    "  'Successful founders are [trait]' without behavioral evidence",
    "  Any claim that could apply to any business topic without the evidence",
    "",
    "GOOD findings:",
    "  'Partnerships consistently outperformed paid acquisition for early traction in this evidence set — 6 creators cited partnerships as their first 100 customers'",
    "  'Evidence shows a consistent relationship between founder-led sales and sub-90-day time-to-first-revenue'",
    "",
    "═══ PHASE D: CONCLUSIONS ═══",
    "Write 2-3 sentences answering the research objective.",
    "State what a rational observer should conclude from the totality of evidence.",
    "Be honest: if evidence is limited or mixed, say so.",
    "Do NOT write: 'In conclusion, X is important and should be considered.'",
    "DO write: 'The evidence consistently points to Y as the primary driver of Z, though only 3 creators address this directly, limiting confidence.'",
    "",
    "═══ PHASE E: ACTIONABLE INTELLIGENCE ═══",
    "Categorize each action:",
    "  decision        — a choice to make now based on findings",
    "  task            — a specific executable action tied to a finding",
    "  experiment      — a test to run to validate a finding",
    "  content_opportunity — a content angle inspired by findings",
    "",
    "Each action: specific, tied to evidence, includes a confidenceScore.",
    "",
    "═══ CONFIDENCE CALIBRATION ═══",
    "Hard caps (server enforces these, but set them correctly):",
    "  1 creator → max 55 | 2 → max 65 | 3-4 → max 75 | 5-6 → max 85 | 7+ → max 95",
    "Reduce further if evidence is mixed or contradictory.",
    "",
    "═══ CONTRARIAN RULE ═══",
    "Only include if a creator explicitly argues the OPPOSITE of the main finding.",
    "If no real disagreement exists: contrarian = null.",
    "Never invent a devil's advocate position.",
    "",
    "Return ONLY valid JSON:",
    JSON.stringify({
      evidenceQuality: "Strong | Moderate | Limited | Insufficient",
      consensusScore: 7,
      confidenceScore: 72,
      quotesUsed: 14,
      quotesRejected: 3,
      coverageScore: 80,
      findings: [
        {
          statement: "Specific finding that reveals a pattern from the evidence — not generic advice",
          answersQuestion: 0,
          confidenceScore: 65,
          clusters: [
            {
              theme: "Sub-theme label",
              evidenceRefs: [
                { idx: 0, quote: "Direct quote proving the finding", whyItSupports: "How this proves it" },
              ],
            },
          ],
        },
      ],
      patterns: [
        {
          patternType: "repeated_behavior",
          description: "Specific behavior observed across N creators — not generic",
          creatorCount: 4,
          evidenceRefs: [0, 3, 7],
        },
      ],
      contrarian: null,
      consensusMap: [
        { creator: "Creator Name", stance: "agree", reason: "What they specifically said" },
      ],
      conclusions: "2-3 sentences: what a rational observer should conclude from this evidence. Honest about limitations.",
      implications: [
        { statement: "Specific implication following directly from findings", basedOnFindings: "Finding 1" },
      ],
      actions: [
        { category: "task", title: "Specific action + measurable outcome", description: "How to execute", derivedFrom: "Finding 1", confidenceScore: 78 },
      ],
      evidenceGaps: "What this evidence does NOT answer, and what additional research would strengthen these findings.",
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

  // ── Call 1: Generate research framework ──────────────────────────────────────
  // Run framework generation and embedding in parallel — they don't depend on each other
  const [framework, queryVec] = await Promise.all([
    generateFramework(query),
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

  // ── Call 2: Evidence synthesis ───────────────────────────────────────────────
  const uniqueCreators = [...new Set(topRows.map(r => r.channel_name).filter(Boolean))] as string[];
  const evidenceBlock = buildEvidenceBlock(topRows, topScores, uniqueCreators);

  const userMessage = [
    `Research Objective: "${framework.researchObjective}"`,
    `Research Questions:`,
    ...framework.researchQuestions.map((q, i) => `  Q${i}: ${q}`),
    "",
    `Evidence Pool (${topRows.length} items from ${uniqueCreators.length} creators):`,
    "",
    evidenceBlock,
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: buildSynthesisPrompt(framework) },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_tokens: 3500,
  });

  let raw: RawSynthesis;
  try {
    raw = JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}")) as RawSynthesis;
  } catch {
    return NextResponse.json({ error: "Synthesis failed" }, { status: 500 });
  }

  // ── Enrich refs ──────────────────────────────────────────────────────────────
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

  // ── Build findings ───────────────────────────────────────────────────────────
  const findings: ResearchFinding[] = (raw.findings ?? []).map(f => {
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

    return {
      statement: sanitizeText(f.statement ?? ""),
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

  // ── Build patterns ───────────────────────────────────────────────────────────
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

  // ── Build remaining ──────────────────────────────────────────────────────────
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

  // Compute coverageScore: fraction of research questions that have at least one finding
  const questionsCovered = new Set(findings.map(f => f.answersQuestion));
  const coverageScore = framework.researchQuestions.length > 0
    ? Math.round((questionsCovered.size / framework.researchQuestions.length) * 100)
    : (raw.coverageScore ?? 0);

  const overallConfidence = capConfidence(raw.confidenceScore ?? 50, creatorsInPool.size);

  const report: ResearchReport = {
    query,
    researchObjective: sanitizeText(framework.researchObjective ?? query),
    topic: sanitizeText(framework.topic ?? query),
    subtopics: (framework.subtopics ?? []).map(s => sanitizeText(s)),
    researchQuestions: (framework.researchQuestions ?? []).map(q => sanitizeText(q)),
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
