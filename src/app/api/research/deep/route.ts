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
  consensus_stage?: ConsensusStage;
  consensus_stage_reason?: string;
};

export type OpportunityStage = "EMERGING" | "GROWING" | "SATURATED";
export type ConsensusStage = "EARLY_SIGNAL" | "EMERGING" | "MAINSTREAM" | "SATURATED";

export type FailureMode = {
  description: string;
  failure_risk: "LOW" | "MEDIUM" | "HIGH";
};

export type OpportunityEntry = {
  name: string;
  industry: string;
  customer: string;
  pain_point: string;
  why_now: string;
  existing_solutions?: string;
  gap: string;
  market_friction: string;
  stage: OpportunityStage;
  stage_reason: string;
  opportunity_score: number;
  market_score?: number;
  market_size?: string;
  competition?: string;
  barrier_to_entry?: string;
  founder_fit?: string;
  single_creator_insight?: boolean;
  market_shift?: string;
  failure_modes?: FailureMode[];
  supporting_evidence: string[];
  counterarguments: string[];
};

export type MarketMapEntry = {
  industry: string;
  opportunity: string;
  market_score: number;
  competition: "LOW" | "MEDIUM" | "HIGH";
  founder_fit: "SOLO" | "SMALL TEAM" | "VENTURE";
  stage: OpportunityStage;
  stage_reason: string;
};

export type NarrativeShift = {
  creator: string;
  topic: string;
  from_stance: string;
  to_stance: string;
  shift_confidence: number;
  period: string;
  evidence: string;
};

export type EarlyMover = {
  creator: string;
  topic: string;
  months_ahead?: number;
  description: string;
  predictive_score: number;
};

export type ResearchGap = {
  missing_perspective: string;
  why_matters: string;
  recommended_type?: string;
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
  creator_count?: number;
  creator_concentration?: number;
  concentration_level?: "LOW" | "MEDIUM" | "HIGH";
  skew_warning?: string;
  executive_summary: {
    key_signals: string[];
    market_interpretation: string;
  };
  market_map?: MarketMapEntry[];
  emerging_trends: TrendEntry[];
  debate_map: DebateCluster[];
  opportunity_ranking: OpportunityEntry[];
  narrative_shifts?: NarrativeShift[];
  early_movers?: EarlyMover[];
  research_gaps?: ResearchGap[];
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
    max_tokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are WatchFilter — a hybrid intelligence system that transforms multi-creator discourse and external sources into structured market hypotheses, debate maps, and opportunity signals.

You do NOT generate financial advice. You DO generate structured, evidence-grounded market intelligence.

PRIMARY OBJECTIVE: Separate narrative signals from real-world validated signals, then synthesize them into testable market opportunities.

CORE PRINCIPLE: Never treat creator consensus as market truth.
- Creator content = hypothesis generation input only (high bias, high signal for sentiment, NOT evidence of market reality)
- External sources = primary grounding layer for factual claims (required for opportunity validation)

INFORMATION LAYERS (mandatory separation in all outputs):
  CNL = Creator Narrative Layer — podcasts, YouTube, newsletters → beliefs, opinions, mental models, narrative trends. Label: "What people are saying"
  ERL = External Reality Layer — industry reports, academic research, financial data, market reports. Label: "What is verifiably true"
  MBL = Market Behavior Layer — adoption trends, product usage, pricing signals, company formation, funding. Label: "What people are doing"

EXTRACTION RULES:
  Step 1 — Tag each atomic claim as CNL / ERL / MBL + confidence (low/medium/high) + type (opinion/fact/inference/numeric)
  Step 2 — Bias check: if >40% of evidence comes from one creator → mark "HIGH BIAS RISK", downweight conclusions. Never allow clustered ecosystems to define "market consensus".
  Step 3 — Debate detection: only TRUE disagreements count toward contradiction_pressure (not pseudo-disagreements or framing conflicts).

VALIDATION RULES:
  A claim is "validated" only if: supported by ≥1 ERL source OR ≥2 independent MBL signals. Otherwise: mark "UNVALIDATED HYPOTHESIS".
  Never upgrade creator opinions into validated facts.
  No opportunity may claim HIGH confidence without ERL support.

CORE SCORING (range 0.0–1.0):
  emergence_score       = velocity + creator breadth + topic novelty
  pain_severity         = urgency × cost × frequency of the problem
  market_size_score     = addressable market breadth (0–1)
  founder_accessibility = ease of entry for a solo/small founder
  competition_inverse   = 1 − competition_density
  opportunity_score     = emergence × contradiction_pressure × (1 − consensus)
  market_score          = 0.30×emergence + 0.25×pain_severity + 0.20×market_size_score + 0.15×founder_accessibility + 0.10×competition_inverse

PIPELINE (mandatory): Evidence → Cluster by industry → Synthesize per cluster → Score → Output
${broadQuery ? `
BROAD QUERY MODE — return one best opportunity per industry cluster. Identify ≥5 distinct industries. Do NOT anchor on first topic retrieved.
` : ""}

OPPORTUNITY STAGE (mandatory per opportunity):
  🟢 EMERGING  — rising mentions, low competition, fragmented consensus
  🟡 GROWING   — increasing adoption, moderate competition, strengthening consensus
  🔴 SATURATED — high competition, strong consensus, declining novelty

CONSENSUS LIFECYCLE (mandatory per trend):
  Classify each trend into its lifecycle stage:
  🔵 EARLY_SIGNAL  — ≤2 creators, low mention frequency, fragmented or no consensus
  🟢 EMERGING      — growing mentions, 3+ creators, contradiction density dropping
  🟡 MAINSTREAM    — strong creator agreement, broad adoption language, moderate novelty
  🔴 SATURATED     — high consensus, declining novelty, late-majority language
  Output: consensus_stage + consensus_stage_reason per trend.
  Prefer opportunities in EARLY_SIGNAL and EMERGING stages — these are pre-consensus alpha.

COUNTERFACTUAL INTELLIGENCE (mandatory per opportunity):
  Every opportunity must answer: "What would make this wrong?"
  Generate at least 1, up to 3 failure_modes per opportunity.
  Assign failure_risk: LOW | MEDIUM | HIGH per mode.
  Examples: "AI costs fall slower than expected", "Regulation limits adoption", "Incumbent responds aggressively"
  Strong opportunities: high upside + LOW failure_risk across most modes.

MARKET FRICTION (mandatory per opportunity):
- Every opportunity must answer: "Why doesn't this already exist?"
- Examples: enterprise-only tools, SMB underservice, recent cost drop, new regulation, AI reduced dev cost
- No opportunity without market_friction

OPPORTUNITY VALIDATION:
- Reject opportunities unless ≥ 3 creators support OR explicitly label "SINGLE-CREATOR INSIGHT"
- creator concentration: ${concentrationLevel} — HIGH concentration: no High confidence without cross-creator validation
- evidence topical relevance must be >0.75

OPPORTUNITY RULES:
- name = SPECIFIC product/service (e.g. "AI-powered compliance monitoring for healthcare SMBs")
- REJECT: ✗ "AI Tool" ✗ "SaaS Platform" ✗ generic category names
- Must include: industry, customer, pain_point, why_now, gap, market_friction, stage

CREATOR DIVERSITY:
- Concentration level: ${concentrationLevel}
- Single-creator opportunities: set single_creator_insight: true
- High-confidence trends require ≥3 supporting_creators, else downgrade to "Medium"

NARRATIVE SHIFTS — detect temporal stance changes:
- Only include if shift_confidence > 0.70
- Infer from evidence: contrarian notes, changing language, disagreement patterns
- Example: "Sentiment toward AI agencies shifted from cautious to bullish"

EARLY MOVERS — creators who discussed a trend before broad adoption:
- Infer from evidence recency signals, quote language ("I've been saying this for months")
- predictive_score = consistency × early_adoption_signal

RESEARCH GAPS — always identify:
- Missing industry perspectives (e.g. no cybersecurity operators, no healthcare founders)
- If graph density is weak, flag: "Additional creator coverage may materially improve results"

${confidenceInstructions}

Return JSON exactly:
{
  "executive_summary": {
    "key_signals": ["3–6 signals"],
    "market_interpretation": "2–3 sentence synthesis"
  },
  "market_map": [
    {
      "industry": "string",
      "opportunity": "specific opportunity name",
      "market_score": 0.0-1.0,
      "competition": "LOW|MEDIUM|HIGH",
      "founder_fit": "SOLO|SMALL TEAM|VENTURE",
      "stage": "EMERGING|GROWING|SATURATED",
      "stage_reason": "1 sentence"
    }
  ],
  "emerging_trends": [
    {
      "title": "string",
      "description": "string",
      "why_emerging": "string",
      "supporting_creators": ["string"],
      "confidence": "High|Medium|Low",
      "emergence_score": 0.0-1.0,
      "consensus_stage": "EARLY_SIGNAL|EMERGING|MAINSTREAM|SATURATED",
      "consensus_stage_reason": "1 sentence"
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
      "name": "specific product/service — NOT generic",
      "industry": "string",
      "customer": "specific segment",
      "pain_point": "concrete problem",
      "why_now": "market shift reason",
      "existing_solutions": "what exists and why it fails",
      "gap": "what remains unsolved",
      "market_friction": "why this doesn't already exist",
      "stage": "EMERGING|GROWING|SATURATED",
      "stage_reason": "1 sentence explaining the stage",
      "opportunity_score": 0.0-1.0,
      "market_score": 0.0-1.0,
      "market_size": "Large|Medium|Small",
      "competition": "High|Medium|Low",
      "barrier_to_entry": "High|Medium|Low",
      "founder_fit": "descriptive string",
      "single_creator_insight": false,
      "failure_modes": [
        { "description": "string", "failure_risk": "LOW|MEDIUM|HIGH" }
      ],
      "supporting_evidence": ["string"],
      "counterarguments": ["string"]
    }
  ],
  "narrative_shifts": [
    {
      "creator": "string",
      "topic": "string",
      "from_stance": "string",
      "to_stance": "string",
      "shift_confidence": 0.0-1.0,
      "period": "string (e.g. 'last 6 months')",
      "evidence": "quote or signal supporting this shift"
    }
  ],
  "early_movers": [
    {
      "creator": "string",
      "topic": "string",
      "months_ahead": 0,
      "description": "string",
      "predictive_score": 0.0-1.0
    }
  ],
  "research_gaps": [
    {
      "missing_perspective": "string (e.g. 'cybersecurity operators')",
      "why_matters": "string",
      "recommended_type": "domain expert|practitioner|investor"
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
      executive_summary:  parsed.executive_summary ?? fallback.executive_summary,
      market_map:         parsed.market_map ?? [],
      emerging_trends:    parsed.emerging_trends ?? [],
      debate_map:         parsed.debate_map ?? debates,
      opportunity_ranking: parsed.opportunity_ranking ?? [],
      narrative_shifts:   (parsed.narrative_shifts ?? []).filter(s => s.shift_confidence > 0.70),
      early_movers:       parsed.early_movers ?? [],
      research_gaps:      parsed.research_gaps ?? [],
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
          creator_count: creatorSet.size,
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
