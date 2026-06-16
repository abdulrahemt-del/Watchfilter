import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { getDeepResearchEvidence, getAllCreatorProfiles, type DeepResearchRow } from "@/lib/db";
import { authorityTier } from "@/lib/creatorAuthority";
import { webSearch, formatWebResults } from "@/lib/webSearch";

export const runtime = "nodejs";
export const maxDuration = 120;

const openai = new OpenAI();

// ── Public types (consumed by DeepResearchView) ───────────────────────────────

export type AtomicClaim = {
  id: string;
  text: string;
  topic: string;
  stance: "bullish" | "bearish" | "neutral" | "mixed";
  type: "fact" | "opinion" | "prediction" | "recommendation";
  confidence: number;
  creator: string;
  evidence: string;
};

export type DebateCluster = {
  topic: string;
  position_a: { summary: string; creators: string[] };
  position_b: { summary: string; creators: string[] };
  relationship: "direct_opposition" | "partial_disagreement" | "reinterpretation";
  strength: number;
  resolution?: string;
};

export type TrendEntry = {
  title: string;
  description: string;
  why_emerging: string;
  supporting_creators: string[];
  confidence: "High" | "Medium" | "Low";
  emergence_score: number;
};

export type OpportunityEntry = {
  name: string;
  opportunity_score: number;
  why_now: string;
  supporting_evidence: string[];
  counterarguments: string[];
};

export type RiskEntry = {
  trend: string;
  risk_type: "noise" | "overhyped" | "low_confidence";
  reason: string;
};

export type EvidenceItem = {
  claim: string;
  creator: string;
  video: string;
  type: "creator" | "web";
  url?: string;
};

export type InvestmentMemo = {
  topic: string;
  generated_at: string;
  evidence_count: number;
  executive_summary: {
    key_signals: string[];
    market_interpretation: string;
  };
  emerging_trends: TrendEntry[];
  debate_map: DebateCluster[];
  opportunity_ranking: OpportunityEntry[];
  risk_signals: RiskEntry[];
  evidence_appendix: EvidenceItem[];
};

// ── Keyword extractor ─────────────────────────────────────────────────────────

const STOP = new Set(["that","this","with","from","what","about","have","which","been","were","they","their","there","when","then","than","also","into","through","during","before","after","above","below","more","most","some","such","like","just","over","very","will","would","could","should","does","make","made","take","know","look","come","year","time","want","need","good","best","work","used"]);

function extractKeywords(topic: string): string[] {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w))
    .slice(0, 6);
}

// ── Format evidence for LLM ───────────────────────────────────────────────────

function formatEvidence(rows: DeepResearchRow[]): string {
  return rows.map((r, i) => {
    const lines = [`[E${i + 1}] Creator: ${r.channel_name}`];
    if (r.video_title) lines.push(`Video: ${r.video_title}`);
    if (r.category)    lines.push(`Topic tag: ${r.category}`);
    if (r.signal_strength) lines.push(`Signal: ${r.signal_strength}`);
    lines.push(`Quote: "${r.quote.slice(0, 280)}"`);
    if (r.insight)    lines.push(`Insight: ${r.insight.slice(0, 180)}`);
    if (r.contrarian) lines.push(`Contrarian note: ${r.contrarian.slice(0, 140)}`);
    if (r.takeaway)   lines.push(`Takeaway: ${r.takeaway.slice(0, 140)}`);
    return lines.join("\n");
  }).join("\n\n---\n\n");
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

const enc = new TextEncoder();
function sse(event: string, payload: Record<string, unknown>): Uint8Array {
  return enc.encode(`data: ${JSON.stringify({ event, ...payload })}\n\n`);
}

// ── Agent: Explorer — extract atomic claims ───────────────────────────────────

async function runExplorer(topic: string, evidence: string): Promise<AtomicClaim[]> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the Explorer Agent in a multi-agent intelligence system.
Extract atomic claims from creator video evidence.

Each claim must be:
- ONE verifiable idea (never compound)
- Normalized: strip hedges, keep the core assertion
- Grounded only in the provided evidence — no hallucination

Return JSON:
{
  "claims": [
    {
      "id": "c1",
      "text": "normalized claim",
      "topic": "topic tag",
      "stance": "bullish|bearish|neutral|mixed",
      "type": "fact|opinion|prediction|recommendation",
      "confidence": 0.0-1.0,
      "creator": "channel_name",
      "evidence": "brief quote excerpt max 80 chars"
    }
  ]
}`,
      },
      { role: "user", content: `Topic: ${topic}\n\nEvidence:\n${evidence}` },
    ],
  });

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { claims?: unknown };
    return Array.isArray(parsed.claims) ? (parsed.claims as AtomicClaim[]) : [];
  } catch { return []; }
}

// ── Agent: Critic — detect contradictions ─────────────────────────────────────

async function runCritic(claims: AtomicClaim[]): Promise<DebateCluster[]> {
  if (claims.length < 2) return [];

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 1400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the Critic Agent in a multi-agent intelligence system.
Find genuine debates and contradictions between claims.

ONLY flag real contradictions — where claims genuinely oppose, partially disagree, or reinterpret the same trend differently.
Do NOT manufacture disagreement. Do NOT merge unrelated claims.

Return JSON:
{
  "debates": [
    {
      "topic": "...",
      "position_a": { "summary": "...", "creators": ["..."] },
      "position_b": { "summary": "...", "creators": ["..."] },
      "relationship": "direct_opposition|partial_disagreement|reinterpretation",
      "strength": 0.0-1.0
    }
  ]
}`,
      },
      { role: "user", content: `Claims:\n${JSON.stringify(claims, null, 2)}` },
    ],
  });

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { debates?: unknown };
    return Array.isArray(parsed.debates) ? (parsed.debates as DebateCluster[]) : [];
  } catch { return []; }
}

// ── Agent: Synthesizer + Scorer ───────────────────────────────────────────────

async function runSynthesizer(
  topic: string,
  claims: AtomicClaim[],
  debates: DebateCluster[],
  webContext: string,
  authorityMap: Record<string, string>,
  evidenceCount: number,
): Promise<InvestmentMemo> {
  const authorityCtx = Object.entries(authorityMap)
    .map(([n, t]) => `${n}: ${t}`)
    .join(", ");

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.15,
    max_tokens: 2800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the Synthesizer and Scorer Agent in a Bloomberg Terminal-grade creator intelligence system.

Build a complete Investment Intelligence Memo. Rules:
- Truth structure over narrative fluency
- Contradictions over consensus — disagreement IS intelligence
- Emergence over popularity
- Evidence over plausibility
- Label weak findings: LOW CONFIDENCE / SPECULATIVE

Scoring (range 0.0–1.0):
  emergence_score     = velocity + creator breadth + topic novelty
  consensus_score     = agreement weighted by authority tier (High > Medium > Low)
  contradiction_pressure = strength of opposing camps
  opportunity_score   = emergence_score × contradiction_pressure × (1 − consensus_score)

Return JSON exactly matching this schema:
{
  "executive_summary": {
    "key_signals": ["3–6 one-line signals"],
    "market_interpretation": "2–3 sentence synthesis"
  },
  "emerging_trends": [
    {
      "title": "string",
      "description": "string",
      "why_emerging": "string",
      "supporting_creators": ["string"],
      "confidence": "High|Medium|Low",
      "emergence_score": 0.0-1.0
    }
  ],
  "debate_map": [
    {
      "topic": "string",
      "position_a": { "summary": "string", "creators": ["string"] },
      "position_b": { "summary": "string", "creators": ["string"] },
      "relationship": "direct_opposition|partial_disagreement|reinterpretation",
      "strength": 0.0-1.0,
      "resolution": "string or null"
    }
  ],
  "opportunity_ranking": [
    {
      "name": "string",
      "opportunity_score": 0.0-1.0,
      "why_now": "string",
      "supporting_evidence": ["string"],
      "counterarguments": ["string"]
    }
  ],
  "risk_signals": [
    { "trend": "string", "risk_type": "noise|overhyped|low_confidence", "reason": "string" }
  ],
  "evidence_appendix": [
    { "claim": "string", "creator": "string", "video": "string", "type": "creator|web", "url": "string|null" }
  ]
}`,
      },
      {
        role: "user",
        content: `Topic: ${topic}

Creator Authority: ${authorityCtx || "No profiles synced yet"}

Atomic Claims (${claims.length}):
${JSON.stringify(claims, null, 2)}

Detected Debates (${debates.length}):
${JSON.stringify(debates, null, 2)}

External Web Validation:
${webContext || "None available"}`,
      },
    ],
  });

  const now = new Date().toISOString();
  const fallback: InvestmentMemo = {
    topic,
    generated_at: now,
    evidence_count: evidenceCount,
    executive_summary: { key_signals: [], market_interpretation: "Synthesis failed — try again." },
    emerging_trends: [],
    debate_map: debates,
    opportunity_ranking: [],
    risk_signals: [],
    evidence_appendix: [],
  };

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<InvestmentMemo>;
    return {
      ...fallback,
      executive_summary: parsed.executive_summary ?? fallback.executive_summary,
      emerging_trends:    parsed.emerging_trends ?? [],
      debate_map:         parsed.debate_map ?? debates,
      opportunity_ranking: parsed.opportunity_ranking ?? [],
      risk_signals:       parsed.risk_signals ?? [],
      evidence_appendix:  parsed.evidence_appendix ?? [],
    };
  } catch { return fallback; }
}

// ── POST handler (SSE stream) ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { topic: string };
  try {
    body = await req.json() as { topic: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { topic } = body;
  if (!topic?.trim()) return NextResponse.json({ error: "Missing topic" }, { status: 400 });

  const keywords = extractKeywords(topic.trim());

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, payload: Record<string, unknown>) =>
        controller.enqueue(sse(event, payload));

      try {
        // ── Stage 1: Retriever — library evidence + creator authority ──────────
        emit("stage", { agent: "Retriever", message: "Querying creator library…" });

        const [evidenceRows, profiles] = await Promise.all([
          getDeepResearchEvidence(keywords),
          getAllCreatorProfiles(),
        ]);

        const authorityMap: Record<string, string> = {};
        for (const p of profiles) authorityMap[p.channel_name] = authorityTier(p.authority_score);

        const creatorSet = new Set(evidenceRows.map(r => r.channel_name));
        emit("stage", {
          agent: "Retriever",
          message: evidenceRows.length > 0
            ? `Found ${evidenceRows.length} evidence points across ${creatorSet.size} creator${creatorSet.size !== 1 ? "s" : ""}`
            : "No creator evidence found — will rely on web search",
        });

        // ── Stage 2: Explorer — extract atomic claims ──────────────────────────
        emit("stage", { agent: "Explorer", message: "Extracting atomic claims…" });

        const claims = evidenceRows.length > 0
          ? await runExplorer(topic.trim(), formatEvidence(evidenceRows))
          : [];

        emit("stage", {
          agent: "Explorer",
          message: claims.length > 0
            ? `Extracted ${claims.length} atomic claim${claims.length !== 1 ? "s" : ""}`
            : "Insufficient evidence for claim extraction",
        });

        // ── Stage 3: Critic — contradiction detection ──────────────────────────
        emit("stage", { agent: "Critic", message: "Detecting contradictions and debates…" });

        const debates = await runCritic(claims);

        emit("stage", {
          agent: "Critic",
          message: debates.length > 0
            ? `Found ${debates.length} debate cluster${debates.length !== 1 ? "s" : ""}`
            : "No significant contradictions detected",
        });

        // ── Stage 4: Retriever — web validation ────────────────────────────────
        emit("stage", { agent: "Retriever", message: "Validating against external sources…" });

        const webRaw = await webSearch(`${topic.trim()} market analysis trends`, 4);
        const webContext = webRaw.length > 0 ? formatWebResults(webRaw) : "";

        emit("stage", {
          agent: "Retriever",
          message: webRaw.length > 0
            ? `Found ${webRaw.length} external source${webRaw.length !== 1 ? "s" : ""}`
            : "No external sources returned",
        });

        // ── Stage 5: Synthesizer + Scorer ─────────────────────────────────────
        emit("stage", { agent: "Synthesizer", message: "Building Investment Intelligence Memo…" });
        emit("stage", { agent: "Scorer", message: "Computing emergence, consensus, and opportunity scores…" });

        const memo = await runSynthesizer(
          topic.trim(),
          claims,
          debates,
          webContext,
          authorityMap,
          evidenceRows.length,
        );

        emit("stage", {
          agent: "Synthesizer",
          message: `Memo ready — ${memo.emerging_trends.length} trend${memo.emerging_trends.length !== 1 ? "s" : ""}, ${memo.opportunity_ranking.length} opportunit${memo.opportunity_ranking.length !== 1 ? "ies" : "y"}`,
        });

        emit("complete", { memo });

      } catch (err) {
        emit("error", { message: err instanceof Error ? err.message : "Pipeline failed" });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
