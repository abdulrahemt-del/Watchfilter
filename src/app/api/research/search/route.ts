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

export type EvidenceStrength = "strong" | "moderate" | "limited" | "mixed" | "insufficient" | "none";

export interface ResearchQuestionAnswer {
  question: string;
  questionIndex: number;
  evidenceStrength: EvidenceStrength;
  conclusion: string;
  creatorCount: number;
  evidenceCount: number;
  videoCount: number;
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
}

export interface ResearchImplication {
  statement: string;
  basedOn: string;
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
  questionAnswers: ResearchQuestionAnswer[];
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
interface RawQuestionAnswer {
  questionIndex: number;
  evidenceStrength: string;
  conclusion: string;
  clusters: RawCluster[];
}
interface RawPattern { patternType: string; description: string; creatorCount: number; }
interface RawCreatorStance { creator: string; stance: "agree" | "neutral" | "disagree"; reason: string; }
interface RawSynthesis {
  evidenceQuality: string;
  consensusScore: number;
  confidenceScore: number;
  quotesUsed: number;
  quotesRejected: number;
  questionAnswers: RawQuestionAnswer[];
  patterns: RawPattern[];
  contrarian: { statement: string; evidenceRef: RawRef } | null;
  consensusMap: RawCreatorStance[];
  conclusions: string;
  implications: { statement: string; basedOn: string }[];
  actions: { category: string; title: string; description: string; derivedFrom: string }[];
  evidenceGaps: string;
}

// ── Server-side evidence strength enforcement ─────────────────────────────────
// GPT cannot over-rate weak evidence.

const VALID_STRENGTHS: EvidenceStrength[] = ["strong", "moderate", "limited", "mixed", "insufficient", "none"];

function enforceEvidenceStrength(raw: string, creatorCount: number): EvidenceStrength {
  if (creatorCount === 0) return "none";
  if (creatorCount === 1 && (raw === "strong" || raw === "moderate")) return "limited";
  if (creatorCount === 2 && raw === "strong") return "moderate";
  return VALID_STRENGTHS.includes(raw as EvidenceStrength) ? (raw as EvidenceStrength) : "insufficient";
}

const STRENGTH_SCORE: Record<EvidenceStrength, number> = {
  strong: 85, moderate: 65, limited: 40, mixed: 45, insufficient: 20, none: 0,
};

function capConfidence(score: number, creatorCount: number): number {
  const max =
    creatorCount >= 7 ? 95
    : creatorCount >= 5 ? 85
    : creatorCount >= 3 ? 75
    : creatorCount >= 2 ? 65
    : 55;
  return Math.min(score, max);
}

// ── Call 1: Research framework ─────────────────────────────────────────────────

const FRAMEWORK_SYSTEM = `You are a research director. Given a search query, generate a research framework.

Output:
1. researchObjective — What the user is REALLY asking. Not a restatement. The deeper intent.
2. topic — Clean 2-4 word label.
3. subtopics — 6-10 specific dimensions to investigate within this topic.
4. researchQuestions — 4-6 specific analytical questions the evidence should answer.

RESEARCH QUESTION RULES:
Each question must be:
  - Specific and directly answerable by creator evidence
  - About patterns, behaviors, comparisons, or outcomes — not definitions
  - Capable of receiving an honest "insufficient" answer if evidence is absent

BANNED question patterns:
  "What is X?" — definitional, not analytical
  "Why is X important?" — assumes conclusion
  "How does X help?" — assumes X helps
  "What role does X play?" — vague

GOOD question patterns:
  "Which specific [channels/behaviors/approaches] appear most frequently in [success/failure] accounts?"
  "How do creators who used [A] describe outcomes compared to those who used [B]?"
  "What conditions appear consistently before [specific outcome] across multiple creator accounts?"
  "Which approaches do experienced creators explicitly warn against, and why?"
  "What timelines or milestones appear in successful [X] stories?"

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
    max_tokens: 700,
  });
  return JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}")) as RawFramework;
}

// ── Call 2: Question answering + synthesis ─────────────────────────────────────

function buildSynthesisPrompt(framework: RawFramework): string {
  const questionsBlock = framework.researchQuestions.map((q, i) => `Q${i}: ${q}`).join("\n");

  return [
    "You are an evidence analyst. Your job: answer each research question using ONLY what the evidence shows.",
    "",
    "═══ CRITICAL RULES ═══",
    "",
    "NEVER invent:",
    "  - Percentages or statistics that do not appear verbatim in an evidence quote",
    "  - Causal effects ('X increases Y')",
    "  - Performance improvements ('companies that do X see better results')",
    "  - Outcomes creators did not explicitly describe",
    "",
    "NEVER use these phrases:",
    "  'X increases Y by N%' — unless N% appears verbatim in a creator quote",
    "  'Research shows...' — WatchFilter is not a research database",
    "  'Studies indicate...' — same",
    "  'Companies that do X...' — fabricated population claim",
    "  'Successful founders tend to...' — without specific evidence from specific creators",
    "  Any causal or statistical claim not grounded in a direct quote",
    "",
    "═══ FOR EACH RESEARCH QUESTION ═══",
    `Research Questions:\n${questionsBlock}`,
    "",
    "STEP 1 — EVIDENCE COLLECTION",
    "Which [E] items DIRECTLY answer this question?",
    "Direct = the quote explicitly discusses this specific question topic.",
    "Reject evidence that is merely related, tangential, or about a different sub-topic.",
    "It is correct and expected to find 0 supporting items for some questions.",
    "",
    "STEP 2 — EVIDENCE STRENGTH (apply honestly, never inflate)",
    "STRONG:       3+ creators with direct, explicit evidence addressing this question",
    "MODERATE:     2 creators with direct evidence",
    "LIMITED:      1 creator with direct evidence",
    "MIXED:        2+ creators with conflicting answers to the same question",
    "INSUFFICIENT: Evidence is related but doesn't directly answer the question",
    "NONE:         No evidence addresses this question at all",
    "",
    "STEP 3 — WRITE CONCLUSION",
    "Begin with the strength prefix, then describe what creators actually said:",
    "  'Strong evidence suggests [describe what multiple creators said/showed]...'",
    "  'Moderate evidence suggests [describe what 2 creators said]...'",
    "  'Limited evidence — [Creator Name] discussed this, noting [what they said]...'",
    "  'Evidence is mixed: [Creator A] found [X] while [Creator B] found [Y]...'",
    "  'Evidence is insufficient — creators touched on [related topic] but did not directly address [specific question].'",
    "  'No evidence found on this question in the analyzed content.'",
    "",
    "NUMBERS IN CONCLUSIONS:",
    "  Correct: 'Creator A reported their CAC dropped from $120 to $45 after switching to referrals' (from a quote)",
    "  Wrong:   'Referrals reduce CAC by 63%' (invented — even if the math is right, you cannot state it this way)",
    "",
    "NEVER upgrade evidence strength. If you have 1 creator, the ceiling is LIMITED.",
    "NEVER write a confident conclusion on INSUFFICIENT or NONE evidence.",
    "",
    "═══ PATTERNS ═══",
    "Identify recurring themes across multiple creators — independent of research questions.",
    "Minimum 2 creators per pattern.",
    "Describe what creators specifically said/did — not generic business wisdom.",
    "",
    "═══ OVERALL CONCLUSIONS ═══",
    "What does the totality of answered questions suggest about the research objective?",
    "Be explicit about which questions had insufficient evidence.",
    "No invented statistics. No manufactured certainty.",
    "",
    "═══ CONTRARIAN RULE ═══",
    "Only if a creator explicitly argues against the prevailing evidence.",
    "If none: contrarian = null.",
    "",
    "═══ ACTIONABLE INTELLIGENCE ═══",
    "Each action ties directly to a specific question answer.",
    "Categories: decision / task / experiment / content_opportunity",
    "Actions must be grounded in the evidence — no advice invented from thin air.",
    "",
    "Return ONLY valid JSON:",
    JSON.stringify({
      evidenceQuality: "Strong | Moderate | Limited | Insufficient",
      consensusScore: 6,
      confidenceScore: 60,
      quotesUsed: 10,
      quotesRejected: 7,
      questionAnswers: [
        {
          questionIndex: 0,
          evidenceStrength: "moderate",
          conclusion: "Moderate evidence suggests partnerships appear consistently in early customer acquisition stories — Creator A and Creator B both cited partnership-led growth as their primary first-100-customer strategy.",
          clusters: [
            {
              theme: "Partnership as first channel",
              evidenceRefs: [
                { idx: 0, quote: "Direct verbatim quote from the evidence", whyItSupports: "Why this directly answers the question" },
              ],
            },
          ],
        },
        {
          questionIndex: 2,
          evidenceStrength: "none",
          conclusion: "No evidence found on this question in the analyzed content.",
          clusters: [],
        },
      ],
      patterns: [
        { patternType: "repeated_behavior", description: "Specific behavior observed in 3 creator accounts — not generic", creatorCount: 3 },
      ],
      contrarian: null,
      consensusMap: [
        { creator: "Creator Name", stance: "agree", reason: "Specifically cited X as their primary approach" },
      ],
      conclusions: "2-3 sentences describing what the answered questions collectively suggest. Honest about gaps. No invented statistics.",
      implications: [
        { statement: "Implication following directly from Q0 answer", basedOn: "Q0 — moderate evidence" },
      ],
      actions: [
        { category: "task", title: "Specific executable action tied to evidence", description: "How to act on this finding", derivedFrom: "Q0 moderate evidence on partnerships" },
      ],
      evidenceGaps: "Which questions had insufficient or no evidence, and what additional content would answer them.",
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

  // Framework generation and embedding run in parallel
  const [framework, queryVec] = await Promise.all([
    generateFramework(query),
    embedText(query),
  ]);

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

  const uniqueCreators = [...new Set(topRows.map(r => r.channel_name).filter(Boolean))] as string[];
  const evidenceBlock = buildEvidenceBlock(topRows, topScores, uniqueCreators);

  const userMessage = [
    `Research Objective: "${framework.researchObjective}"`,
    "",
    "Research Questions:",
    ...framework.researchQuestions.map((q, i) => `Q${i}: ${q}`),
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
    temperature: 0.1,
    max_tokens: 4000,
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

  // ── Build question answers with server-side strength enforcement ───────────
  const questionAnswers: ResearchQuestionAnswer[] = framework.researchQuestions.map((q, qi) => {
    const raw_qa = (raw.questionAnswers ?? []).find(a => a.questionIndex === qi);

    const clusters: QuoteCluster[] = (raw_qa?.clusters ?? []).map(cl => ({
      theme: sanitizeText(cl.theme ?? ""),
      sourceRefs: (cl.evidenceRefs ?? []).map(enrichRef),
    }));

    const allRefs = clusters.flatMap(cl => cl.sourceRefs);
    const uniqueCreatorsInAnswer = new Set(allRefs.map(r => r.creator));
    const uniqueVideos = new Set(allRefs.map(r => r.videoId));
    const creatorCount = uniqueCreatorsInAnswer.size;

    // Server enforces: can't rate 1-creator evidence as strong/moderate
    const enforcedStrength = enforceEvidenceStrength(raw_qa?.evidenceStrength ?? "none", creatorCount);

    return {
      question: sanitizeText(q),
      questionIndex: qi,
      evidenceStrength: enforcedStrength,
      conclusion: sanitizeText(raw_qa?.conclusion ?? "No evidence found on this question in the analyzed content."),
      creatorCount,
      evidenceCount: allRefs.length,
      videoCount: uniqueVideos.size,
      clusters,
    };
  });

  // ── Patterns ─────────────────────────────────────────────────────────────────
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
  }));

  const videoIds = new Set(topRows.map(r => r.video_id));
  const creatorsInPool = new Set(topRows.map(r => r.channel_name).filter(Boolean));

  const VALID_QUALITY = ["Strong", "Moderate", "Limited", "Insufficient"] as const;
  const evidenceQuality = VALID_QUALITY.includes(raw.evidenceQuality as typeof VALID_QUALITY[number])
    ? raw.evidenceQuality as ResearchReport["evidenceQuality"]
    : "Moderate";

  // Coverage: fraction of questions with strong/moderate evidence
  const wellAnswered = questionAnswers.filter(a => a.evidenceStrength === "strong" || a.evidenceStrength === "moderate").length;
  const coverageScore = Math.round((wellAnswered / Math.max(1, questionAnswers.length)) * 100);

  // Confidence: average strength score, capped by creator pool size
  const avgStrengthScore = Math.round(
    questionAnswers.reduce((sum, a) => sum + STRENGTH_SCORE[a.evidenceStrength], 0) / Math.max(1, questionAnswers.length)
  );
  const overallConfidence = capConfidence(avgStrengthScore, creatorsInPool.size);

  const report: ResearchReport = {
    query,
    researchObjective: sanitizeText(framework.researchObjective ?? query),
    topic: sanitizeText(framework.topic ?? query),
    subtopics: (framework.subtopics ?? []).map(s => sanitizeText(s)),
    researchQuestions: (framework.researchQuestions ?? []).map(q => sanitizeText(q)),
    evidenceQuality,
    videosMatched: videoIds.size,
    creatorsMatched: creatorsInPool.size,
    quotesUsed: raw.quotesUsed ?? questionAnswers.reduce((n, a) => n + a.evidenceCount, 0),
    quotesRejected: raw.quotesRejected ?? 0,
    coverageScore,
    consensusScore: raw.consensusScore ?? 5,
    confidenceScore: overallConfidence,
    questionAnswers,
    patterns,
    contrarian,
    consensusMap,
    conclusions: sanitizeText(raw.conclusions ?? ""),
    implications: (raw.implications ?? []).map(i => ({
      statement: sanitizeText(i.statement),
      basedOn: sanitizeText(i.basedOn),
    })),
    actions,
    evidenceGaps: sanitizeText(raw.evidenceGaps ?? ""),
    totalIndexed: stats.withEmbeddings,
  };

  return NextResponse.json(report);
}
