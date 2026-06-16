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
  industry: string;
  customer: string;
  pain_point: string;
  why_now: string;
  existing_solutions?: string;
  gap: string;
  opportunity_score: number;
  market_size?: string;
  competition?: string;
  barrier_to_entry?: string;
  founder_fit?: string;
  market_shift?: string;
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

export type RecommendedAction = {
  confidence_level: "HIGH" | "MEDIUM" | "LOW";
  label: string;
  action: string;
  detail: string;
  implementation?: string;
  metrics?: string;
  risks?: string;
  missing_evidence?: string;
  follow_up_queries?: string[];
};

export type InvestmentMemo = {
  topic: string;
  generated_at: string;
  evidence_count: number;
  creator_concentration?: number;
  concentration_level?: "LOW" | "MEDIUM" | "HIGH";
  skew_warning?: string;
  executive_summary: {
    key_signals: string[];
    market_interpretation: string;
  };
  emerging_trends: TrendEntry[];
  debate_map: DebateCluster[];
  opportunity_ranking: OpportunityEntry[];
  risk_signals: RiskEntry[];
  evidence_appendix: EvidenceItem[];
  recommended_actions: RecommendedAction;
};

// ── Confidence classifier (deterministic) ─────────────────────────────────────

function classifyConfidence(
  uniqueCreators: number,
  evidenceCount: number,
  hasExternal: boolean,
): "HIGH" | "MEDIUM" | "LOW" {
  if (uniqueCreators >= 5 && evidenceCount >= 20 && hasExternal) return "HIGH";
  if (uniqueCreators >= 3 && evidenceCount >= 8) return "MEDIUM";
  return "LOW";
}

// ── Creator concentration ─────────────────────────────────────────────────────

function computeConcentration(rows: DeepResearchRow[]): {
  concentration: number;
  level: "LOW" | "MEDIUM" | "HIGH";
  dominantCreator?: string;
} {
  if (rows.length === 0) return { concentration: 0, level: "LOW" };
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.channel_name] = (counts[r.channel_name] ?? 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxCount = entries[0]![1];
  const concentration = maxCount / rows.length;
  const level = concentration > 0.50 ? "HIGH" : concentration >= 0.30 ? "MEDIUM" : "LOW";
  return { concentration, level, dominantCreator: entries[0]![0] };
}

function downgradeConfidence(level: "HIGH" | "MEDIUM" | "LOW"): "HIGH" | "MEDIUM" | "LOW" {
  if (level === "HIGH") return "MEDIUM";
  return "LOW";
}

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

// ── Broad query detection ─────────────────────────────────────────────────────

const BROAD_TRIGGERS = new Set(["opportunity","opportunities","emerging","market","markets","business","businesses","startup","startups","founder","founders","ideas","biggest","best","top","future","invest","investment","build","what should"]);
const INDUSTRY_KEYWORDS = ["ai","artificial intelligence","cybersecurity","security","creator","content","automation","saas","software","healthcare","fintech","finance","education","edtech","b2b","services","productivity","data","analytics","marketing","ecommerce","logistics","real estate","climate","energy","legal","hr","recruiting","devtools","developer"];

function isBroadQuery(q: string): boolean {
  const lower = q.toLowerCase();
  const hasBroadTrigger = [...BROAD_TRIGGERS].some(kw => lower.includes(kw));
  const specificKeywords = extractKeywords(q);
  return hasBroadTrigger && specificKeywords.length <= 3;
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

RELEVANCE FILTER (mandatory):
- Each claim must have query_relevance_score ≥ 0.75 to the user's topic.
- Compute relevance using keyword overlap and topical alignment.
- REJECT claims that discuss unrelated topics (e.g. if topic is "short form content", reject claims about investing, ETFs, real estate, unrelated finance).
- Only surface evidence directly relevant to the user's query.
- The Evidence Appendix must not contain unrelated claims.

Each claim must be:
- ONE verifiable idea (never compound)
- Normalized: strip hedges, keep the core assertion
- Grounded only in the provided evidence — no hallucination
- query_relevance_score ≥ 0.75 (drop anything below)

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
      "evidence": "brief quote excerpt max 80 chars",
      "query_relevance_score": 0.0-1.0
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

async function runCritic(topic: string, claims: AtomicClaim[]): Promise<DebateCluster[]> {
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

TOPIC CONSTRAINT (mandatory):
- Debates MUST be constrained to the active query topic: "${topic}"
- Before computing contradictions, assess topic_similarity(query, claim).
- REJECT claims with topic_similarity < 0.80 — do not use them in any debate.
- Only compare claims within the same topic cluster.
- Cross-topic contradictions are PROHIBITED.
- If a creator discusses investing/ETFs/real estate/unrelated finance but the query is about content formats, those claims must be excluded.
- If no valid on-topic debate exists, return an empty debates array.

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
      { role: "user", content: `Query topic: ${topic}\n\nClaims:\n${JSON.stringify(claims, null, 2)}` },
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
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW",
  concentrationLevel: "LOW" | "MEDIUM" | "HIGH",
  broadQuery: boolean,
): Promise<InvestmentMemo> {
  const authorityCtx = Object.entries(authorityMap)
    .map(([n, t]) => `${n}: ${t}`)
    .join(", ");

  const confidenceInstructions = {
    HIGH: `Confidence level: HIGH (≥5 creators, ≥20 evidence, external validation exists).
Output recommended_actions with:
  label: "▶ Recommended Action"
  action: concrete strategic action (what to do right now)
  detail: why it matters + expected impact
  implementation: specific implementation suggestion`,
    MEDIUM: `Confidence level: MEDIUM (≥3 creators, ≥8 evidence).
Output recommended_actions with:
  label: "◐ Suggested Experiment"
  action: a small test or experiment to run
  detail: what to monitor and how long to run it
  metrics: specific metrics to track
  risks: what could go wrong`,
    LOW: `Confidence level: LOW (limited evidence).
Output recommended_actions with:
  label: "◌ Research Hypothesis"
  action: what this signal suggests + what is still unknown
  detail: what evidence is missing to validate this
  missing_evidence: specific gaps in the data
  follow_up_queries: 2-3 specific research queries to strengthen the signal`,
  }[confidenceLevel];

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.15,
    max_tokens: 3200,
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

PIPELINE ORDER (mandatory): Evidence → Cluster by industry/topic → Synthesize → Score → Output opportunity
- First, mentally cluster the claims by industry or topic area
- Then synthesize insights within each cluster
- Then score opportunities based on cross-cluster evidence
- Only THEN output the opportunity_ranking
${broadQuery ? `
BROAD QUERY MODE: The user asked a broad question. You MUST:
- Identify at least 5 distinct industry clusters from the evidence (e.g. AI, Cybersecurity, Creator Economy, Fintech, Healthcare)
- Return the best opportunity from EACH cluster — do not anchor on the first topic retrieved
- Set industry field to the cluster name for each opportunity
- Do NOT return multiple opportunities from the same industry
- Title the executive_summary as "Top Opportunities by Industry"
` : ""}

OPPORTUNITY GENERATION RULES (mandatory):
- name must be a SPECIFIC actionable product/service/strategy (e.g. "AI monitoring dashboard for SMB cybersecurity")
- REJECT generic names: ✗ "AI Tool" ✗ "Content Analytics" ✗ "SaaS Platform"
- Every opportunity MUST include: industry, customer, pain_point, why_now, gap
- Also include when available: existing_solutions, market_size, competition, barrier_to_entry, founder_fit

CREATOR DIVERSITY RULES (mandatory):
- Creator concentration level: ${concentrationLevel}
- Any trend or opportunity supported by ONLY 1 creator must be labeled "SINGLE-CREATOR INSIGHT" in its title
- High-confidence trends (confidence: "High") require ≥ 3 supporting_creators — if fewer, downgrade to "Medium"
- If concentration is HIGH, no trend or opportunity may claim high confidence without cross-creator validation

${confidenceInstructions}

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
      "name": "specific product/service/strategy name — NOT a generic category",
      "industry": "e.g. Cybersecurity, Creator Economy, Fintech, Healthcare",
      "customer": "specific customer segment (e.g. 'SMBs under 50 employees', 'solo content creators')",
      "pain_point": "concrete problem they face right now",
      "why_now": "what market shift makes this timing right",
      "existing_solutions": "what's already out there and why it fails",
      "gap": "what remains unsolved that this opportunity addresses",
      "opportunity_score": 0.0-1.0,
      "market_size": "Large|Medium|Small",
      "competition": "High|Medium|Low",
      "barrier_to_entry": "High|Medium|Low",
      "founder_fit": "e.g. 'Strong for solo technical founders' or 'Best for teams with domain expertise'",
      "supporting_evidence": ["string"],
      "counterarguments": ["string"]
    }
  ],
  "risk_signals": [
    { "trend": "string", "risk_type": "noise|overhyped|low_confidence", "reason": "string" }
  ],
  "evidence_appendix": [
    { "claim": "string", "creator": "string", "video": "string", "type": "creator|web", "url": "string|null" }
  ],
  "recommended_actions": {
    "confidence_level": "${confidenceLevel}",
    "label": "string",
    "action": "string",
    "detail": "string",
    "implementation": "string or null",
    "metrics": "string or null",
    "risks": "string or null",
    "missing_evidence": "string or null",
    "follow_up_queries": ["string"] or null
  }
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
  const fallbackRecommendation: RecommendedAction = {
    confidence_level: confidenceLevel,
    label: "◌ Research Hypothesis",
    action: "Run additional research to strengthen the evidence base.",
    detail: "Insufficient evidence to generate a concrete recommendation.",
    follow_up_queries: [`Run Deep Research on ${topic}`, "Search for creators discussing this topic"],
  };

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
    recommended_actions: fallbackRecommendation,
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
      recommended_actions: parsed.recommended_actions ?? fallbackRecommendation,
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

  const trimmedTopic = topic.trim();
  const broadQuery = isBroadQuery(trimmedTopic);
  const keywords = broadQuery
    ? INDUSTRY_KEYWORDS.slice(0, 12)
    : extractKeywords(trimmedTopic);

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
        const { concentration, level: concentrationLevel, dominantCreator } = computeConcentration(evidenceRows);
        const skewWarning = concentrationLevel === "HIGH"
          ? `Research may be skewed toward a single creator (${dominantCreator ?? "unknown"}: ${Math.round(concentration * 100)}% of evidence).`
          : undefined;

        emit("stage", {
          agent: "Retriever",
          message: evidenceRows.length > 0
            ? `Found ${evidenceRows.length} evidence points across ${creatorSet.size} creator${creatorSet.size !== 1 ? "s" : ""} — concentration: ${concentrationLevel} (${Math.round(concentration * 100)}%)`
            : "No creator evidence found — will rely on web search",
        });

        // ── Stage 2: Explorer — extract atomic claims ──────────────────────────
        emit("stage", { agent: "Explorer", message: "Extracting atomic claims…" });

        const claims = evidenceRows.length > 0
          ? await runExplorer(trimmedTopic, formatEvidence(evidenceRows))
          : [];

        emit("stage", {
          agent: "Explorer",
          message: claims.length > 0
            ? `Extracted ${claims.length} atomic claim${claims.length !== 1 ? "s" : ""}`
            : "Insufficient evidence for claim extraction",
        });

        // ── Stage 3: Critic — contradiction detection ──────────────────────────
        emit("stage", { agent: "Critic", message: "Detecting contradictions and debates…" });

        const debates = await runCritic(trimmedTopic, claims);

        emit("stage", {
          agent: "Critic",
          message: debates.length > 0
            ? `Found ${debates.length} debate cluster${debates.length !== 1 ? "s" : ""}`
            : "No significant contradictions detected",
        });

        // ── Stage 4: Retriever — web validation ────────────────────────────────
        emit("stage", { agent: "Retriever", message: "Validating against external sources…" });

        const webRaw = await webSearch(`${trimmedTopic} market analysis trends`, 4);
        const webContext = webRaw.length > 0 ? formatWebResults(webRaw) : "";

        emit("stage", {
          agent: "Retriever",
          message: webRaw.length > 0
            ? `Found ${webRaw.length} external source${webRaw.length !== 1 ? "s" : ""}`
            : "No external sources returned",
        });

        // ── Stage 5: Synthesizer + Scorer ─────────────────────────────────────
        const rawConfidence = classifyConfidence(
          creatorSet.size,
          evidenceRows.length,
          webRaw.length > 0,
        );
        const confidenceLevel = concentrationLevel === "HIGH"
          ? downgradeConfidence(rawConfidence)
          : rawConfidence;

        emit("stage", { agent: "Synthesizer", message: "Building Investment Intelligence Memo…" });
        emit("stage", {
          agent: "Scorer",
          message: `Computing scores — ${confidenceLevel} confidence tier (${creatorSet.size} creators, ${evidenceRows.length} evidence points, diversity: ${concentrationLevel})${concentrationLevel === "HIGH" ? " ⚠ HIGH concentration" : ""}`,
        });

        const memo = await runSynthesizer(
          trimmedTopic,
          claims,
          debates,
          webContext,
          authorityMap,
          evidenceRows.length,
          confidenceLevel,
          concentrationLevel,
          broadQuery,
        );

        const finalMemo: InvestmentMemo = {
          ...memo,
          creator_concentration: concentration,
          concentration_level: concentrationLevel,
          skew_warning: skewWarning,
        };

        emit("stage", {
          agent: "Synthesizer",
          message: `Memo ready — ${finalMemo.emerging_trends.length} trend${finalMemo.emerging_trends.length !== 1 ? "s" : ""}, ${finalMemo.opportunity_ranking.length} opportunit${finalMemo.opportunity_ranking.length !== 1 ? "ies" : "y"}`,
        });

        emit("complete", { memo: finalMemo });

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
