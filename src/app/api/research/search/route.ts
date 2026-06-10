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
  answersQuestion: number;       // index into researchQuestions[]
  evidenceCount: number;
  creatorCount: number;
  videoCount: number;
  consensusStrength: "Strong" | "Moderate" | "Weak" | "Insufficient";
  confidenceScore: number;       // hard-capped by creator count server-side
  confidence: "High" | "Moderate" | "Limited";
  clusters: QuoteCluster[];
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
  title: string;
  description: string;
  derivedFrom: string;
}

export interface ResearchImplication {
  statement: string;
  basedOnFindings: string;
}

export interface ResearchReport {
  query: string;
  topic: string;
  researchQuestions: string[];
  evidenceQuality: "Strong" | "Moderate" | "Limited" | "Insufficient";
  videosMatched: number;
  creatorsMatched: number;
  consensusScore: number;
  confidenceScore: number;
  summary: string;
  findings: ResearchFinding[];
  contrarian: ContraFinding | null;
  consensusMap: CreatorStance[];
  implications: ResearchImplication[];
  actions: ResearchAction[];
  evidenceGaps: string;
  totalIndexed: number;
}

// ── GPT raw types ──────────────────────────────────────────────────────────────

interface RawRef { idx: number; quote: string; whyItSupports: string; }
interface RawCluster { theme: string; evidenceRefs: RawRef[]; }
interface RawFinding {
  statement: string;
  answersQuestion: number;
  confidenceScore: number;
  clusters: RawCluster[];
}
interface RawCreatorStance { creator: string; stance: "agree" | "neutral" | "disagree"; reason: string; }
interface RawSynthesis {
  topic: string;
  researchQuestions: string[];
  evidenceQuality: string;
  consensusScore: number;
  confidenceScore: number;
  summary: string;
  findings: RawFinding[];
  contrarian: { statement: string; evidenceRef: RawRef } | null;
  consensusMap: RawCreatorStance[];
  implications: { statement: string; basedOnFindings: string }[];
  actions: { title: string; description: string; derivedFrom: string }[];
  evidenceGaps: string;
}

// ── Hard confidence caps by creator count ─────────────────────────────────────
// These are enforced server-side — GPT cannot override them.

function capConfidence(score: number, creatorCount: number): number {
  const max =
    creatorCount >= 7 ? 95
    : creatorCount >= 5 ? 85
    : creatorCount >= 3 ? 75
    : creatorCount >= 2 ? 65
    : 55;
  return Math.min(score, max);
}

// ── Prompt ─────────────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = [
  "You are a research analyst. Your job is not to summarize what creators said — it is to discover what the evidence collectively suggests.",
  "You think like an investigative journalist or investment analyst: find patterns, relationships, causal claims, and repeated behaviors.",
  "",
  "═══ STEP 1: GENERATE RESEARCH QUESTIONS ═══",
  "Before generating findings, generate 4–5 specific analytical questions the evidence might answer.",
  "These questions must be specific to the query — not generic.",
  "",
  "Example query: 'founder market fit'",
  "Good questions:",
  "  Q0: What specific behaviors distinguish founders who demonstrate strong market fit?",
  "  Q1: Does prior industry experience measurably predict market fit outcomes?",
  "  Q2: What is the observed timeline for developing genuine founder-market fit?",
  "  Q3: Can founders without natural market fit compensate through deliberate means?",
  "  Q4: What evidence from successful companies correlates with founder-market fit?",
  "",
  "Bad questions (too generic — do not use):",
  "  'How important is founder market fit?' (circular)",
  "  'What is founder market fit?' (definitional, not analytical)",
  "",
  "═══ STEP 2: VALIDATE EVIDENCE ═══",
  "For each evidence item, ask: 'Does this quote EXPLICITLY support a finding?' Partial/indirect support → exclude.",
  "1 strong, direct quote beats 5 weak ones.",
  "",
  "═══ STEP 3: GENERATE FINDINGS ═══",
  "Each finding must:",
  "  a) Answer one of the research questions you generated (cite by index 0–4)",
  "  b) Reveal a pattern, relationship, causal claim, repeated behavior, or strategic insight",
  "  c) Be directly traceable to cited evidence",
  "  d) Group supporting quotes into sub-theme clusters",
  "",
  "BANNED GENERIC CONCLUSIONS — never write unless evidence specifically proves it:",
  "  'X matters' / 'X is important' / 'X helps' / 'Adaptability is key'",
  "  'Successful founders are [trait]' without behavioral evidence",
  "  'Engagement matters' / 'Mentorship helps' without specific proof",
  "  Any conclusion that could apply to any business topic without the evidence",
  "",
  "GOOD FINDING EXAMPLES:",
  "  'Founders in the evidence pool who built in markets they previously worked in for 3+ years raised Series A 2x faster'",
  "  'Three creators independently identified the same 90-day milestone pattern before declaring product-market fit'",
  "  'Evidence shows a consistent relationship between founder-led sales and early retention — not present in non-founder-led sales teams'",
  "",
  "═══ CONFIDENCE CALIBRATION ═══",
  "Set confidenceScore as follows (server will enforce hard caps, but set them correctly):",
  "  1 creator  → max 55",
  "  2 creators → max 65",
  "  3–4 creators → max 75",
  "  5–6 creators → max 85",
  "  7+ creators → max 95",
  "If evidence is mixed or contradictory, reduce confidence further.",
  "If evidence is insufficient, say so in evidenceGaps — do not fabricate certainty.",
  "",
  "═══ CONTRARIAN RULE ═══",
  "Only include if a creator explicitly argues the OPPOSITE. No hypothetical objections. No devil's advocate.",
  "If no real disagreement exists: contrarian = null.",
  "",
  "═══ CONSENSUS MAP ═══",
  "Categorize every distinct creator: agree / neutral / disagree.",
  "Each entry must cite what the creator actually said (1 sentence).",
  "",
  "Return ONLY valid JSON:",
  JSON.stringify({
    topic: "Specific topic label",
    researchQuestions: [
      "Q0: Specific analytical question",
      "Q1: Specific analytical question",
      "Q2: Specific analytical question",
      "Q3: Specific analytical question",
    ],
    evidenceQuality: "Strong | Moderate | Limited | Insufficient",
    consensusScore: 7,
    confidenceScore: 72,
    summary: "1-2 sentences of factual synthesis. What does the evidence collectively suggest? Honest about weak evidence.",
    findings: [
      {
        statement: "Specific finding that reveals a pattern, relationship, or causal claim — not generic",
        answersQuestion: 0,
        confidenceScore: 62,
        clusters: [
          {
            theme: "Sub-theme label",
            evidenceRefs: [
              { idx: 0, quote: "Verbatim quote that DIRECTLY proves the finding", whyItSupports: "How this quote proves the finding" },
            ],
          },
        ],
      },
    ],
    contrarian: null,
    consensusMap: [
      { creator: "Creator Name", stance: "agree", reason: "Cited specific X in E2" },
    ],
    implications: [
      { statement: "Implication directly following from findings — no speculation", basedOnFindings: "Finding 1" },
    ],
    actions: [
      { title: "Specific action verb + object + measurable outcome", description: "How to execute", derivedFrom: "Finding 1" },
    ],
    evidenceGaps: "What this evidence does NOT cover, what is uncertain, or where it is mixed/insufficient",
  }, null, 2),
].join("\n");

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

  let filtered = allRows;
  if (body.filters?.channel) filtered = filtered.filter(r => r.channel_name === body.filters!.channel);
  if (body.filters?.signalStrength) {
    filtered = filtered.filter(r =>
      r.signal_strength?.toLowerCase() === body.filters!.signalStrength!.toLowerCase()
    );
  }

  const queryVec = await embedText(query);
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
  const userMessage = `Query: "${query}"\n\nEvidence pool (${topRows.length} items, ${uniqueCreators.length} creators):\n\n${evidenceBlock}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYNTHESIS_SYSTEM },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_tokens: 3000,
  });

  let raw: RawSynthesis;
  try {
    raw = JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}")) as RawSynthesis;
  } catch {
    return NextResponse.json({ error: "Synthesis failed" }, { status: 500 });
  }

  // ── Enrich refs: route fills creator/video/timestamp from indexed rows ──────
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

    // Hard server-side confidence cap — GPT cannot produce inflated confidence
    const rawScore = f.confidenceScore ?? 50;
    const cappedScore = capConfidence(rawScore, creatorCount);
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

  const contrarian: ContraFinding | null = raw.contrarian
    ? { statement: sanitizeText(raw.contrarian.statement ?? ""), sourceRef: enrichRef(raw.contrarian.evidenceRef) }
    : null;

  const consensusMap: CreatorStance[] = (raw.consensusMap ?? []).map(s => ({
    creator: sanitizeText(s.creator ?? ""),
    stance: (["agree", "neutral", "disagree"].includes(s.stance) ? s.stance : "neutral") as CreatorStance["stance"],
    reason: sanitizeText(s.reason ?? ""),
  }));

  const videoIds = new Set(topRows.map(r => r.video_id));
  const creatorsInPool = new Set(topRows.map(r => r.channel_name).filter(Boolean));

  const VALID_QUALITY = ["Strong", "Moderate", "Limited", "Insufficient"] as const;
  const evidenceQuality = VALID_QUALITY.includes(raw.evidenceQuality as typeof VALID_QUALITY[number])
    ? raw.evidenceQuality as ResearchReport["evidenceQuality"]
    : "Moderate";

  // Overall report confidence also capped
  const overallConfidence = capConfidence(raw.confidenceScore ?? 50, creatorsInPool.size);

  const report: ResearchReport = {
    query,
    topic: sanitizeText(raw.topic ?? query),
    researchQuestions: (raw.researchQuestions ?? []).map(q => sanitizeText(q)),
    evidenceQuality,
    videosMatched: videoIds.size,
    creatorsMatched: creatorsInPool.size,
    consensusScore: raw.consensusScore ?? 5,
    confidenceScore: overallConfidence,
    summary: sanitizeText(raw.summary ?? ""),
    findings,
    contrarian,
    consensusMap,
    implications: (raw.implications ?? []).map(i => ({
      statement: sanitizeText(i.statement),
      basedOnFindings: sanitizeText(i.basedOnFindings),
    })),
    actions: (raw.actions ?? []).map(a => ({
      title: sanitizeText(a.title),
      description: sanitizeText(a.description),
      derivedFrom: sanitizeText(a.derivedFrom),
    })),
    evidenceGaps: sanitizeText(raw.evidenceGaps ?? ""),
    totalIndexed: stats.withEmbeddings,
  };

  return NextResponse.json(report);
}
