import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { db, upsertPrediction, type PredictionRow } from "@/lib/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

type ExtractedPrediction = {
  creator?: string;
  statement: string;
  normalized_statement: string;
  prediction_key: string;
  prediction_type: string;
  domain: string;
  time_horizon: {
    explicit: boolean;
    target_date: string | null;
    timeframe_text: string | null;
  };
  resolution: {
    metric: string | null;
    threshold: string | null;
    resolution_method: string;
    resolver_sources: string[];
  };
  forecast: {
    direction: string;
    estimated_probability: number;
  };
  scores: {
    falsifiability_score: number;
    specificity_score: number;
    importance_score: number;
  };
  relationships: Array<{
    type: string;
    target_prediction: string;
    confidence: number;
  }>;
  market_consensus: {
    position: "supportive" | "contrarian" | "neutral";
  };
  calibration: {
    confidence_style: "low" | "medium" | "high";
  };
  creator_confidence_signal: {
    explicit_confidence: boolean;
    language_strength: number;
  };
  resolver_priority: "low" | "medium" | "high";
  evaluation: {
    status: "unresolved";
    last_checked_at: null;
    resolver_confidence: null;
  };
  trackable: boolean;
  speaker: string;
  evidence_quote: string;
};

const PREDICTION_TYPES = new Set([
  "technology", "market", "startup", "regulation",
  "finance", "product", "adoption", "macro", "consumer_behavior",
]);

const FORECAST_DIRECTIONS = new Set([
  "increase", "decrease", "adoption", "replacement", "dominance", "failure", "uncertain",
]);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const c = await db();
  const { rows } = await c.execute({
    sql: `
      SELECT ri.quote, ri.insight, ri.channel_name, ri.video_title,
             COALESCE(a.upload_date, ri.indexed_at) AS record_date,
             ri.category
      FROM research_index ri
      LEFT JOIN analyses a ON ri.analysis_id = a.id
      WHERE ri.quote IS NOT NULL AND ri.quote != ''
        AND ri.channel_name IS NOT NULL
      ORDER BY ri.indexed_at DESC
      LIMIT 120
    `,
    args: [],
  });

  if (!rows.length) return NextResponse.json({ extracted: 0, message: "No evidence to scan" });

  const evidenceBlock = rows.map((r, i) => {
    const lines = [`[E${i + 1}] Creator: ${r.channel_name}`];
    if (r.video_title) lines.push(`Video: ${r.video_title}`);
    if (r.category) lines.push(`Topic: ${r.category}`);
    if (r.record_date) lines.push(`Published: ${String(r.record_date).slice(0, 10)}`);
    lines.push(`Quote: "${String(r.quote).slice(0, 300)}"`);
    if (r.insight) lines.push(`Insight: ${String(r.insight).slice(0, 150)}`);
    return lines.join("\n");
  }).join("\n\n---\n\n");

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the WatchFilter Prediction Intelligence Engine v2.1.

Your purpose is to create a long-term, self-improving forecasting dataset that can:
- measure creator accuracy
- resolve predictions over time
- calibrate forecasters
- build relationships between predictions
- track market consensus shifts

A prediction is valuable only if it can eventually be evaluated against reality.

---

# INPUT FORMAT

You will receive a series of evidence blocks labeled [E1], [E2], etc. Each block contains:
- Creator (channel name)
- Video title + topic
- Published date
- Quote (verbatim excerpt)
- Insight (summary)

---

# PREDICTION EXTRACTION RULES

Extract ONLY future-oriented claims.

A prediction must describe:
- something that will happen
- something that will not happen
- a measurable future state
- a market transition
- adoption or decline

Do NOT extract: opinions, aspirations, observations, historical statements, generic beliefs.

BAD: "AI is transformative."
BAD: "Agents are interesting."
GOOD: "AI agents will automate most customer support workflows by 2028."
GOOD: "Open-source models will match frontier models within two years."

---

# NORMALIZATION RULES

Convert predictions into canonical form. Remove hedging (maybe, perhaps, probably, I think, likely).
The normalized statement should maximize future deduplication.

Raw: "I think open-source catches up in a year or two."
Normalized: "Open-source AI models will achieve parity with frontier closed-source models within two years."

---

# PREDICTION FINGERPRINT

Generate a prediction_key for every prediction. This field is REQUIRED.

Rules:
- lowercase only
- snake_case
- remove stop words
- preserve entities and time horizons
- maximize cross-video matching
- different phrasings of the same prediction should generate the same key

Examples:
"Open-source AI catches frontier models within two years." → "open_source_ai_frontier_parity_2_years"
"AI agents replace SaaS by 2030." → "ai_agents_replace_saas_2030"
"Bitcoin reaches $250,000." → "bitcoin_250k_price_target"

---

# RESOLUTION DESIGN

Every prediction should be designed for future resolution.

Prediction: "Bitcoin reaches $250,000."
metric: "price", threshold: "$250,000", resolution_method: "market price data"
resolver_sources: ["market_data", "financial APIs"]

Prediction: "AI SDRs replace outbound sales."
metric: "market adoption", threshold: "majority adoption"
resolution_method: "industry reports and surveys"
resolver_sources: ["research papers", "market reports", "company announcements"]

If impossible to resolve: trackable = false

---

# RESOLUTION STATE

Newly extracted predictions MUST default evaluation to:
{ "status": "unresolved", "last_checked_at": null, "resolver_confidence": null }

Never infer future evaluation outcomes. These values are updated by the automatic resolver only.

---

# RELATIONSHIP EXTRACTION

Each relationship must include a confidence score (0.0–1.0).
Only emit relationships with confidence >= 0.7.
If no high-confidence relationships exist, output an empty array [].

"supports": Prediction A becoming true makes Prediction B more likely.
"contradicts": Predictions cannot both be true simultaneously.
"depends_on": Prediction B requires Prediction A first.

Only include relationships strongly implied by transcript context. Never invent weak relationships.

Example:
{ "type": "supports", "target_prediction": "model prices collapse globally", "confidence": 0.89 }
{ "type": "depends_on", "target_prediction": "reliable autonomous agents exist at scale", "confidence": 0.92 }

---

# RESOLVER PRIORITY

Assign resolver_priority based on prediction type. This field is REQUIRED.

HIGH:
- price targets
- adoption forecasts
- market share predictions
- technology replacement predictions
- regulation predictions with dates

MEDIUM:
- growth forecasts
- trend predictions
- company success predictions

LOW:
- vague social trends
- broad future statements

Examples:
"Bitcoin reaches $250,000" → high
"AI becomes more useful" → low
"AI agents replace SaaS" → high

---

# MARKET CONSENSUS

supportive: Aligns with mainstream creator consensus.
contrarian: Opposes common creator beliefs.
neutral: Insufficient evidence to classify.

Do NOT estimate ecosystem-wide truth — only classify relative positioning.

---

# FORECAST PROBABILITY

estimated_probability (0–100) represents the creator's implied confidence level.

"certainly" → 90+
"likely" → 60–80
"might" → 30–50
uncertain default → 50

direction must be one of: increase | decrease | adoption | replacement | dominance | failure | uncertain

---

# CALIBRATION

confidence_style:
- low: Hedged language (maybe, might, possibly)
- medium: Moderate certainty (likely, expected to)
- high: Strong certainty (will, inevitable, certain)

---

# SCORING

falsifiability_score (0–1): Can it clearly become true or false?
specificity_score (0–1): Does it contain numbers, dates, thresholds, measurable outcomes?
importance_score (0–1): How significant if correct?

---

# CREATOR CALIBRATION SEED

Extract creator_confidence_signal for every prediction.

language_strength range: 0.0–1.0
"I am certain" → 0.95 | "This will happen" → 0.90 | "I think" → 0.55 | "Maybe" → 0.25

explicit_confidence = true ONLY IF the creator uses: certain, definitely, guaranteed, no doubt, impossible, inevitable.
Otherwise: explicit_confidence = false.

---

# TRACKABILITY RULE

trackable = true ONLY IF:
  falsifiability_score >= 0.7 AND specificity_score >= 0.6
Never override this rule.

---

# EVIDENCE RULE

Extract a short verbatim quote. Maximum 25 words. Do not paraphrase.

---

# NO HALLUCINATION

Never invent dates, thresholds, metrics, relationships, or probabilities not supported by text.
Use transcript/evidence only.

---

# QUALITY STANDARD

Objective: maximize future evaluability, resolution quality, creator calibration, relationship mapping.
Extract at most 15 predictions total. Prioritize quality over count.
When uncertain: prefer omission over invention.

---

# REQUIRED OUTPUT

Return ONLY valid JSON:

{
  "predictions": [
    {
      "creator": "channel name from evidence block",
      "statement": "verbatim or near-verbatim original statement",
      "normalized_statement": "canonical, hedge-free prediction statement",
      "prediction_key": "snake_case_stable_identifier",
      "prediction_type": "technology|market|startup|regulation|finance|product|adoption|macro|consumer_behavior",
      "domain": "concise domain (e.g. AI Agents, Open-source AI)",
      "time_horizon": {
        "explicit": true or false,
        "target_date": "YYYY or YYYY-MM or null",
        "timeframe_text": "e.g. within two years or null"
      },
      "resolution": {
        "metric": "what to measure or null",
        "threshold": "what value proves/disproves it or null",
        "resolution_method": "how to verify",
        "resolver_sources": ["list of source types"]
      },
      "forecast": {
        "direction": "increase|decrease|adoption|replacement|dominance|failure|uncertain",
        "estimated_probability": 0-100
      },
      "scores": {
        "falsifiability_score": 0.0-1.0,
        "specificity_score": 0.0-1.0,
        "importance_score": 0.0-1.0
      },
      "relationships": [
        {
          "type": "supports|contradicts|depends_on",
          "target_prediction": "normalized statement of related prediction",
          "confidence": 0.0-1.0
        }
      ],
      "market_consensus": {
        "position": "supportive|contrarian|neutral"
      },
      "calibration": {
        "confidence_style": "low|medium|high"
      },
      "creator_confidence_signal": {
        "explicit_confidence": true or false,
        "language_strength": 0.0-1.0
      },
      "resolver_priority": "low|medium|high",
      "evaluation": {
        "status": "unresolved",
        "last_checked_at": null,
        "resolver_confidence": null
      },
      "trackable": true or false,
      "speaker": "speaker name or channel name",
      "evidence_quote": "verbatim excerpt max 25 words"
    }
  ]
}`,
      },
      { role: "user", content: `Evidence blocks:\n\n${evidenceBlock}` },
    ],
  });

  let predictions: ExtractedPrediction[] = [];
  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { predictions?: unknown };
    predictions = Array.isArray(parsed.predictions) ? (parsed.predictions as ExtractedPrediction[]) : [];
  } catch {
    return NextResponse.json({ error: "LLM parse failed" }, { status: 500 });
  }

  const now = new Date().toISOString();
  let stored = 0;

  for (const p of predictions) {
    if (!p.statement && !p.normalized_statement) continue;

    const scores = p.scores ?? { falsifiability_score: 0, specificity_score: 0, importance_score: 0 };
    const falsifiability = Math.max(0, Math.min(1, scores.falsifiability_score ?? 0));
    const specificity    = Math.max(0, Math.min(1, scores.specificity_score ?? 0));
    const importance     = Math.max(0, Math.min(1, scores.importance_score ?? 0));
    const trackable      = falsifiability >= 0.7 && specificity >= 0.6;

    const predType = PREDICTION_TYPES.has(p.prediction_type) ? p.prediction_type : "technology";

    const forecastDir = FORECAST_DIRECTIONS.has(p.forecast?.direction) ? p.forecast.direction : "uncertain";
    const forecastProb = Math.max(0, Math.min(100, p.forecast?.estimated_probability ?? 50));

    const consensusPos = (["supportive", "contrarian", "neutral"] as const).includes(p.market_consensus?.position)
      ? p.market_consensus.position
      : "neutral";

    const calibStyle = (["low", "medium", "high"] as const).includes(p.calibration?.confidence_style)
      ? p.calibration.confidence_style
      : "medium";

    const row: PredictionRow = {
      prediction_id: randomUUID(),
      creator: p.creator ?? "Unknown",
      topic: p.domain ?? predType,
      prediction_text: p.normalized_statement || p.statement,
      created_at: now,
      confidence: Math.max(0, Math.min(1, forecastProb / 100)),
      measurable_outcome: p.resolution?.resolution_method ?? null,
      evidence_source: "research_index",
      // v3 attribution (defaults)
      speaker_name: p.speaker ?? null,
      speaker_role: "HOST",
      speaker_confidence: calibStyle === "high" ? "HIGH" : calibStyle === "low" ? "LOW" : "MEDIUM",
      entity_name: null,
      entity_type: null,
      attribution_strength: "EXPLICIT",
      outcome_tier: null,
      is_evaluable: trackable,
      // evaluation
      prediction_accuracy_score: null,
      evaluation_evidence: null,
      evaluated_at: null,
      status: "pending",
      // v1 fields
      normalized_statement: p.normalized_statement ?? null,
      prediction_type: predType,
      domain: p.domain ?? null,
      time_horizon: p.time_horizon ?? null,
      resolution: p.resolution ? {
        metric: p.resolution.metric ?? null,
        threshold: p.resolution.threshold ?? null,
        resolution_method: p.resolution.resolution_method,
        resolver_sources: Array.isArray(p.resolution.resolver_sources) ? p.resolution.resolver_sources : [],
      } : null,
      falsifiability_score: falsifiability,
      specificity_score: specificity,
      importance_score: importance,
      trackable,
      evidence_quote: p.evidence_quote ?? null,
      // v2 fields
      forecast: { direction: forecastDir, estimated_probability: forecastProb },
      relationships: Array.isArray(p.relationships)
        ? p.relationships
            .filter(r => typeof r.confidence === "number" && r.confidence >= 0.7 && ["supports", "contradicts", "depends_on"].includes(r.type))
            .map(r => ({ type: r.type as "supports" | "contradicts" | "depends_on", target_prediction: r.target_prediction, confidence: r.confidence }))
        : [],
      market_consensus_position: consensusPos,
      calibration_confidence_style: calibStyle,
      prediction_key: p.prediction_key ?? null,
      resolver_priority: (p.resolver_priority === "low" || p.resolver_priority === "medium" || p.resolver_priority === "high") ? p.resolver_priority : "medium",
      creator_confidence_signal: p.creator_confidence_signal ? {
        explicit_confidence: Boolean(p.creator_confidence_signal.explicit_confidence),
        language_strength: Math.max(0, Math.min(1, p.creator_confidence_signal.language_strength ?? 0)),
      } : { explicit_confidence: false, language_strength: 0.5 },
      evaluation: { status: "unresolved", last_checked_at: null, resolver_confidence: null },
      resolved_at: null,
      resolver_notes: null,
    };

    await upsertPrediction(row);
    stored++;
  }

  return NextResponse.json({ extracted: stored, scanned: rows.length });
}
