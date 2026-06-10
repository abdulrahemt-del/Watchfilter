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

// ── Output types ───────────────────────────────────────────────────────────────

export interface SourceRef {
  quote: string;
  whyItSupports: string;
  // populated by route from the indexed row — not from GPT
  creator: string;
  videoTitle: string;
  videoId: string;
  timestampStr: string | null;
  signalStrength: string | null;
}

export interface ResearchFinding {
  statement: string;
  sourceRefs: SourceRef[];
  sourceCount: number;
  confidence: "High" | "Moderate" | "Limited";
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
  evidenceQuality: "Strong" | "Moderate" | "Limited";
  videosMatched: number;
  creatorsMatched: number;
  consensusScore: number;
  confidenceScore: number;
  summary: string;
  findings: ResearchFinding[];
  contrarian: ContraFinding | null;
  implications: ResearchImplication[];
  actions: ResearchAction[];
  evidenceGaps: string;
  totalIndexed: number;
}

// ── GPT raw shape (before route enriches source metadata) ─────────────────────

interface RawEvidenceRef {
  idx: number;
  quote: string;
  whyItSupports: string;
}

interface RawFinding {
  statement: string;
  evidenceRefs: RawEvidenceRef[];
}

interface RawContrarian {
  statement: string;
  evidenceRef: RawEvidenceRef;
}

interface RawSynthesis {
  topic: string;
  evidenceQuality: string;
  consensusScore: number;
  confidenceScore: number;
  summary: string;
  findings: RawFinding[];
  contrarian: RawContrarian | null;
  implications: { statement: string; basedOnFindings: string }[];
  actions: { title: string; description: string; derivedFrom: string }[];
  evidenceGaps: string;
}

// ── Prompt ─────────────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = [
  "You are a senior research analyst producing evidence-first intelligence reports.",
  "Every claim you make MUST cite specific evidence from the items below using their [E{idx}] labels.",
  "Never assert anything that is not directly supported by cited evidence.",
  "",
  "REPORT RULES:",
  "1. Each finding must reference 1+ evidence items by idx. Include the most compelling verbatim quote.",
  "2. whyItSupports must explain in 1 sentence HOW the quote proves the finding — not just restate it.",
  "3. If only 1 source supports a finding, mark confidence as 'Limited' and say so.",
  "4. If 2 sources agree independently, mark 'Moderate'. If 3+, mark 'High'.",
  "5. Contrarian: only include if evidence actually shows a dissenting view — do not fabricate one.",
  "6. evidenceGaps: be honest about what the evidence does NOT cover.",
  "7. Do not write findings that go beyond what the evidence shows.",
  "8. summary must be 1-2 sentences of factual synthesis, no speculation.",
  "",
  "CONFIDENCE CALIBRATION:",
  "  1 source → confidenceScore 35-55, evidenceQuality 'Limited'",
  "  2 sources → confidenceScore 55-70, evidenceQuality 'Moderate'",
  "  3+ independent sources → confidenceScore 70-90, evidenceQuality 'Strong'",
  "  4+ with high signal → consensusScore 8-10",
  "",
  "Return ONLY valid JSON in exactly this shape:",
  JSON.stringify({
    topic: "Short specific topic label",
    evidenceQuality: "Strong | Moderate | Limited",
    consensusScore: 7,
    confidenceScore: 72,
    summary: "1-2 sentence factual synthesis. No claims beyond evidence.",
    findings: [
      {
        statement: "Specific, verifiable finding — not vague",
        evidenceRefs: [
          { idx: 0, quote: "Verbatim quote from E0", whyItSupports: "1 sentence: how this proves the finding" },
          { idx: 3, quote: "Verbatim quote from E3", whyItSupports: "1 sentence: how this proves the finding" },
        ],
      },
    ],
    contrarian: {
      statement: "Dissenting view, if evidence supports one",
      evidenceRef: { idx: 5, quote: "Verbatim quote", whyItSupports: "Why this is a valid counterpoint" },
    },
    implications: [
      { statement: "Strategic implication directly following from findings", basedOnFindings: "Findings 1 and 2" },
    ],
    actions: [
      { title: "Specific action verb + object + outcome", description: "How to execute", derivedFrom: "Finding 1" },
    ],
    evidenceGaps: "What this evidence does not cover or what remains uncertain",
  }, null, 2),
].join("\n");

// ── Evidence block for GPT ────────────────────────────────────────────────────

function buildEvidenceBlock(rows: ResearchRow[], scores: number[]): string {
  return rows.slice(0, 20).map((r, i) => [
    `[E${i}] Relevance: ${(scores[i] * 100).toFixed(0)}%`,
    `Creator: ${r.channel_name ?? "Unknown"}`,
    `Video: ${r.video_title ?? "Unknown"}`,
    r.timestamp_str ? `Timestamp: ${r.timestamp_str}` : null,
    r.quote ? `Quote: "${r.quote}"` : null,
    r.insight ? `Insight: ${r.insight}` : null,
    r.why_matters ? `Business implication: ${r.why_matters}` : null,
    r.signal_strength ? `Signal strength: ${r.signal_strength}` : null,
    r.contrarian ? `Contrarian angle: ${r.contrarian}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");
}

// ── Route ─────────────────────────────────────────────────────────────────────

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

  // Use top 20 — keeps evidence block focused; GPT references by idx
  const topRows = scored.slice(0, 20).map(s => s.row);
  const topScores = scored.slice(0, 20).map(s => s.score);

  if (!topRows.length) {
    return NextResponse.json({
      error: "No relevant evidence found for this query.",
      totalIndexed: stats.withEmbeddings,
    } as Partial<ResearchReport>, { status: 422 });
  }

  const evidenceBlock = buildEvidenceBlock(topRows, topScores);
  const userMessage = `Query: "${query}"\n\nYour evidence pool (${topRows.length} items from ${stats.withEmbeddings} total indexed):\n\n${evidenceBlock}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYNTHESIS_SYSTEM },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 2000,
  });

  let raw: RawSynthesis;
  try {
    raw = JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}")) as RawSynthesis;
  } catch {
    return NextResponse.json({ error: "Synthesis failed" }, { status: 500 });
  }

  // ── Enrich each evidence reference with source metadata from indexed rows ──
  // GPT provides idx; route fills in creator/video/timestamp — GPT cannot fabricate these.
  function enrichRef(ref: RawEvidenceRef): SourceRef {
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
    const refs = (f.evidenceRefs ?? []).map(enrichRef);
    const uniqueCreators = new Set(refs.map(r => r.creator)).size;
    const confidence: ResearchFinding["confidence"] =
      uniqueCreators >= 3 ? "High" : uniqueCreators === 2 ? "Moderate" : "Limited";
    return {
      statement: sanitizeText(f.statement ?? ""),
      sourceRefs: refs,
      sourceCount: uniqueCreators,
      confidence,
    };
  });

  const contrarian: ContraFinding | null = raw.contrarian
    ? { statement: sanitizeText(raw.contrarian.statement ?? ""), sourceRef: enrichRef(raw.contrarian.evidenceRef) }
    : null;

  const videoIds = new Set(topRows.map(r => r.video_id));
  const creators = new Set(topRows.map(r => r.channel_name).filter(Boolean));

  const report: ResearchReport = {
    query,
    topic: sanitizeText(raw.topic ?? query),
    evidenceQuality: (["Strong", "Moderate", "Limited"].includes(raw.evidenceQuality) ? raw.evidenceQuality : "Moderate") as ResearchReport["evidenceQuality"],
    videosMatched: videoIds.size,
    creatorsMatched: creators.size,
    consensusScore: raw.consensusScore ?? 5,
    confidenceScore: raw.confidenceScore ?? 50,
    summary: sanitizeText(raw.summary ?? ""),
    findings,
    contrarian,
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
