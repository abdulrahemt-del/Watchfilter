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
  evidenceCount: number;
  creatorCount: number;
  videoCount: number;
  consensusStrength: "Strong" | "Moderate" | "Weak" | "Insufficient";
  confidenceScore: number;
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

// ── GPT raw types (before route enrichment) ────────────────────────────────────

interface RawRef { idx: number; quote: string; whyItSupports: string; }
interface RawCluster { theme: string; evidenceRefs: RawRef[]; }
interface RawFinding {
  statement: string;
  confidenceScore: number;
  clusters: RawCluster[];
}
interface RawCreatorStance { creator: string; stance: "agree" | "neutral" | "disagree"; reason: string; }
interface RawSynthesis {
  topic: string;
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

// ── Prompt ─────────────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = [
  "You are a professional research analyst. Your job is to identify what the evidence actually shows — not to summarize or be helpful.",
  "You behave like an investment analyst or investigative journalist: evidence-first, no speculation.",
  "",
  "═══ EVIDENCE VALIDATION (do this before attaching any quote to a finding) ═══",
  "For every quote you consider attaching, ask: 'Does this quote EXPLICITLY support this finding?'",
  "If the answer is 'partially', 'tangentially', or 'indirectly' — EXCLUDE the quote.",
  "1 strong, direct quote is better than 5 weak ones.",
  "A quote must be attached to AT MOST 1 finding.",
  "",
  "═══ FINDING RULES ═══",
  "- Only state findings that are directly traceable to cited evidence.",
  "- Each finding must have at least 1 cluster with at least 1 directly supporting quote.",
  "- If evidence is weak, say so — reduce confidenceScore accordingly.",
  "- Do not extrapolate beyond what the quotes explicitly say.",
  "- Group supporting quotes into sub-theme clusters (e.g. 'Pricing signals', 'Churn data').",
  "  A cluster is a group of quotes making the SAME specific point under the finding.",
  "",
  "═══ CONTRARIAN RULE (strict) ═══",
  "A contrarian view MAY ONLY appear if a creator in the evidence pool explicitly argues the OPPOSITE strategy or presents contradictory data.",
  "Do NOT generate hypothetical objections. Do NOT invent devil's advocate positions.",
  "If no real disagreement exists in the evidence: set contrarian to null.",
  "",
  "═══ CONSENSUS MAP ═══",
  "Categorize EVERY distinct creator from the evidence pool:",
  "  agree    — creator's evidence directly supports the overall findings",
  "  neutral  — creator's evidence is related but neither confirms nor contradicts",
  "  disagree — creator explicitly argues against the findings or presents opposing data",
  "Each entry must include a 1-sentence reason citing what the creator actually said.",
  "",
  "═══ CONFIDENCE CALIBRATION ═══",
  "  1 directly supporting source  → confidenceScore 30-50, evidenceQuality 'Limited'",
  "  2 directly supporting sources → confidenceScore 50-68, evidenceQuality 'Moderate'",
  "  3+ directly supporting sources → confidenceScore 68-85, evidenceQuality 'Strong'",
  "  No direct support → confidenceScore <30, evidenceQuality 'Insufficient'",
  "  Mixed/contradictory evidence → explicitly state this in evidenceGaps",
  "",
  "Return ONLY valid JSON:",
  JSON.stringify({
    topic: "Specific topic label",
    evidenceQuality: "Strong | Moderate | Limited | Insufficient",
    consensusScore: 7,
    confidenceScore: 72,
    summary: "1-2 sentences of factual synthesis. No claims beyond evidence. If evidence is weak, say so here.",
    findings: [
      {
        statement: "Specific verifiable finding — not vague",
        confidenceScore: 78,
        clusters: [
          {
            theme: "Sub-theme label (e.g. 'Revenue impact')",
            evidenceRefs: [
              { idx: 0, quote: "Verbatim quote from E0 that DIRECTLY supports this finding", whyItSupports: "1 sentence: exactly how this quote proves the finding" },
            ],
          },
        ],
      },
    ],
    contrarian: null,
    consensusMap: [
      { creator: "Creator Name", stance: "agree", reason: "Explicitly stated X in E2" },
      { creator: "Creator Name 2", stance: "neutral", reason: "Discussed related topic but did not address the specific finding" },
    ],
    implications: [
      { statement: "Implication directly following from findings — no speculation", basedOnFindings: "Finding 1" },
    ],
    actions: [
      { title: "Specific action verb + object + measurable outcome", description: "How to execute", derivedFrom: "Finding 1" },
    ],
    evidenceGaps: "What this evidence does NOT cover, what is uncertain, or where evidence is mixed/weak",
  }, null, 2),
].join("\n");

// ── Evidence block ─────────────────────────────────────────────────────────────

function buildEvidenceBlock(rows: ResearchRow[], scores: number[], uniqueCreators: string[]): string {
  const block = rows.slice(0, 20).map((r, i) => [
    `[E${i}] Relevance: ${(scores[i] * 100).toFixed(0)}%`,
    `Creator: ${r.channel_name ?? "Unknown"}`,
    `Video: ${r.video_title ?? "Unknown"}`,
    r.timestamp_str ? `Timestamp: ${r.timestamp_str}` : null,
    r.quote ? `Quote: "${r.quote}"` : null,
    r.insight ? `Insight: ${r.insight}` : null,
    r.why_matters ? `Business implication: ${r.why_matters}` : null,
    r.signal_strength ? `Signal strength: ${r.signal_strength}` : null,
    r.contrarian ? `Contrarian angle noted: ${r.contrarian}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");

  return `Creators in evidence pool: ${uniqueCreators.join(", ")}\n\n${block}`;
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
    max_tokens: 2800,
  });

  let raw: RawSynthesis;
  try {
    raw = JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}")) as RawSynthesis;
  } catch {
    return NextResponse.json({ error: "Synthesis failed" }, { status: 500 });
  }

  // ── Enrich: route fills in creator/video/timestamp from indexed rows ───────
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
    const evidenceCount = allRefs.length;
    const creatorCount = uniqueCreatorsInFinding.size;
    const videoCount = uniqueVideos.size;

    const consensusStrength: ResearchFinding["consensusStrength"] =
      creatorCount >= 4 ? "Strong"
      : creatorCount === 3 ? "Moderate"
      : creatorCount === 2 ? "Weak"
      : evidenceCount > 0 ? "Insufficient"
      : "Insufficient";

    const cs = f.confidenceScore ?? 50;
    const confidence: ResearchFinding["confidence"] =
      cs >= 70 ? "High" : cs >= 50 ? "Moderate" : "Limited";

    return {
      statement: sanitizeText(f.statement ?? ""),
      evidenceCount,
      creatorCount,
      videoCount,
      consensusStrength,
      confidenceScore: cs,
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

  const report: ResearchReport = {
    query,
    topic: sanitizeText(raw.topic ?? query),
    evidenceQuality,
    videosMatched: videoIds.size,
    creatorsMatched: creatorsInPool.size,
    consensusScore: raw.consensusScore ?? 5,
    confidenceScore: raw.confidenceScore ?? 50,
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
