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

export interface EvidenceItem {
  id: string;
  videoId: string;
  videoTitle: string | null;
  channelName: string | null;
  uploadDate: string | null;
  type: string;
  quote: string | null;
  timestampStr: string | null;
  insight: string | null;
  whyMatters: string | null;
  takeaway: string | null;
  signalStrength: string | null;
  contrarian: string | null;
  category: string | null;
  score: number;
}

export interface ResearchReport {
  query: string;
  topic: string;
  videosMatched: number;
  creatorsMatched: number;
  consensusScore: number;
  confidenceScore: number;
  summary: string;
  keyFindings: string[];
  consensus: string;
  contrarian: string;
  patterns: string[];
  implications: string[];
  actions: { title: string; description: string }[];
  evidence: EvidenceItem[];
  totalIndexed: number;
}

const SYNTHESIS_SYSTEM = [
  "You are a senior business intelligence analyst. You synthesize insights from a private research database of expert founder, investor, and operator video transcripts.",
  "",
  "Given a user query and supporting evidence, produce a structured research report.",
  "",
  "Rules:",
  "- Be specific. Name patterns, quote data, reference creator consensus.",
  "- Every claim must be traceable to the evidence provided.",
  "- consensusScore: 0-10 (how strongly do creators agree?)",
  "- confidenceScore: 0-100 (how well does evidence answer the query?)",
  "- keyFindings: 3-5 sharp, insight-dense sentences. Not vague.",
  "- patterns: 3-5 recurring observations across multiple creators.",
  "- implications: 2-3 strategic implications for a founder/operator.",
  "- actions: 2-4 concrete tasks derived from the evidence.",
  "",
  "Return ONLY JSON:",
  JSON.stringify({
    topic: "Short topic label",
    summary: "2-3 sentence executive summary of what the evidence shows",
    consensusScore: 8,
    confidenceScore: 85,
    keyFindings: ["Finding 1", "Finding 2", "Finding 3"],
    consensus: "What most creators agree on (1-2 sentences)",
    contrarian: "Any dissenting views or edge-case caveats (1 sentence, or empty string if none)",
    patterns: ["Pattern 1", "Pattern 2", "Pattern 3"],
    implications: ["Implication 1", "Implication 2"],
    actions: [
      { title: "Action verb + object + outcome", description: "How to execute" },
    ],
  }, null, 2),
].join("\n");

function buildEvidenceBlock(rows: ResearchRow[], scores: number[]): string {
  return rows.slice(0, 25).map((r, i) => [
    `EVIDENCE ${i + 1} (similarity: ${(scores[i] * 100).toFixed(0)}%)`,
    `Creator: ${r.channel_name ?? "Unknown"}`,
    `Video: ${r.video_title ?? "Unknown"}`,
    r.timestamp_str ? `Timestamp: ${r.timestamp_str}` : null,
    r.quote ? `Quote: "${r.quote}"` : null,
    r.insight ? `Insight: ${r.insight}` : null,
    r.why_matters ? `Why it matters: ${r.why_matters}` : null,
    r.signal_strength ? `Signal: ${r.signal_strength}` : null,
    r.contrarian ? `Contrarian: ${r.contrarian}` : null,
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    query?: string;
    filters?: { channel?: string; signalStrength?: string };
  };

  const query = sanitizeText((body.query ?? "").trim());
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  // Load all indexed rows and stats in parallel
  const [allRows, stats] = await Promise.all([
    loadResearchIndex(),
    getResearchIndexStats(),
  ]);

  if (!allRows.length) {
    return NextResponse.json({
      error: "No research data indexed yet. Analyze some videos first.",
      totalIndexed: 0,
    } as Partial<ResearchReport>, { status: 422 });
  }

  // Apply filters
  let filtered = allRows;
  if (body.filters?.channel) {
    filtered = filtered.filter(r => r.channel_name === body.filters!.channel);
  }
  if (body.filters?.signalStrength) {
    filtered = filtered.filter(r =>
      r.signal_strength?.toLowerCase() === body.filters!.signalStrength!.toLowerCase()
    );
  }

  // Embed the query and rank rows by cosine similarity
  const queryVec = await embedText(query);
  const scored = filtered
    .filter(r => r.embedding)
    .map(r => ({ row: r, score: cosineSim(queryVec, r.embedding!) }))
    .sort((a, b) => b.score - a.score);

  const topRows = scored.slice(0, 25).map(s => s.row);
  const topScores = scored.slice(0, 25).map(s => s.score);

  if (!topRows.length) {
    return NextResponse.json({
      error: "No relevant evidence found for this query.",
      totalIndexed: stats.withEmbeddings,
    } as Partial<ResearchReport>, { status: 422 });
  }

  const evidenceBlock = buildEvidenceBlock(topRows, topScores);
  const userMessage = `Query: "${query}"\n\nEvidence from ${stats.withEmbeddings} indexed data points across your video library:\n\n${evidenceBlock}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYNTHESIS_SYSTEM },
      { role: "user",   content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 1200,
  });

  let synthesis: {
    topic: string;
    summary: string;
    consensusScore: number;
    confidenceScore: number;
    keyFindings: string[];
    consensus: string;
    contrarian: string;
    patterns: string[];
    implications: string[];
    actions: { title: string; description: string }[];
  };

  try {
    synthesis = JSON.parse(sanitizeText(completion.choices[0].message.content ?? "{}"));
  } catch {
    return NextResponse.json({ error: "Synthesis failed" }, { status: 500 });
  }

  // Count unique videos and creators in top evidence
  const videoIds = new Set(topRows.map(r => r.video_id));
  const creators = new Set(topRows.map(r => r.channel_name).filter(Boolean));

  const evidence: EvidenceItem[] = topRows.map((r, i) => ({
    id: r.id,
    videoId: r.video_id,
    videoTitle: r.video_title,
    channelName: r.channel_name,
    uploadDate: r.upload_date,
    type: r.type,
    quote: r.quote,
    timestampStr: r.timestamp_str,
    insight: r.insight,
    whyMatters: r.why_matters,
    takeaway: r.takeaway,
    signalStrength: r.signal_strength,
    contrarian: r.contrarian,
    category: r.category,
    score: topScores[i],
  }));

  const report: ResearchReport = {
    query,
    topic: synthesis.topic ?? query,
    videosMatched: videoIds.size,
    creatorsMatched: creators.size,
    consensusScore: synthesis.consensusScore ?? 7,
    confidenceScore: synthesis.confidenceScore ?? 70,
    summary: synthesis.summary ?? "",
    keyFindings: synthesis.keyFindings ?? [],
    consensus: synthesis.consensus ?? "",
    contrarian: synthesis.contrarian ?? "",
    patterns: synthesis.patterns ?? [],
    implications: synthesis.implications ?? [],
    actions: synthesis.actions ?? [],
    evidence,
    totalIndexed: stats.withEmbeddings,
  };

  return NextResponse.json(report);
}
