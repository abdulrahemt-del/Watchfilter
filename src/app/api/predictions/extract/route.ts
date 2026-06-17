import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { db, upsertPrediction, type PredictionRow, type SpeakerRole, type AttributionStrength } from "@/lib/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

type ExtractedPrediction = {
  creator: string;
  speaker_name: string | null;
  speaker_role: SpeakerRole;
  speaker_confidence: "HIGH" | "MEDIUM" | "LOW";
  entity_name: string | null;
  entity_type: string | null;
  attribution_strength: AttributionStrength;
  topic: string;
  prediction_text: string;
  confidence: number;
  measurable_outcome: string | null;
  is_evaluable: boolean;
};

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
    const lines = [`[E${i + 1}] Creator/Channel: ${r.channel_name}`];
    if (r.video_title) lines.push(`Video: ${r.video_title}`);
    if (r.category) lines.push(`Topic: ${r.category}`);
    if (r.record_date) lines.push(`Date: ${String(r.record_date).slice(0, 10)}`);
    lines.push(`Quote: "${String(r.quote).slice(0, 300)}"`);
    if (r.insight) lines.push(`Insight: ${String(r.insight).slice(0, 150)}`);
    return lines.join("\n");
  }).join("\n\n---\n\n");

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a Structural Attribution Extractor (WatchFilter v3).

CRITICAL RULE — DO NOT MERGE SPEAKERS:
The "creator" field is the CHANNEL NAME (the person running the YouTube channel).
But the SPEAKER who makes a prediction may be:
  - HOST: The channel creator themselves making a direct claim
  - GUEST: An interviewee or guest speaker on the channel
  - THIRD_PARTY: A person/entity referenced in the content but not present

Host commentary on a guest claim is NOT the same claim. Preserve attribution chains.

YOUR TASK: Extract all forward-looking predictions from the evidence. For each prediction, identify the complete Speaker → Claim → Entity → chain.

DEFINITIONS:
- speaker_name: The actual human speaker (may differ from channel name for interviews)
- speaker_role: HOST | GUEST | THIRD_PARTY
- speaker_confidence: How confident you are in the speaker identification (HIGH | MEDIUM | LOW)
- entity_name: The company, person, product, or market the prediction is ABOUT
- entity_type: "person" | "company" | "product" | "market" | "technology" | "unknown"
- attribution_strength:
    EXPLICIT — speaker directly stated this as their own prediction
    IMPLIED — logically inferred from what the speaker said
    PARAPHRASED — the channel host is relaying what someone else said
- is_evaluable: true ONLY if ALL of these hold:
    1. speaker_name is identifiable (not null/unknown)
    2. The prediction has a clear measurable_outcome
    3. attribution_strength is EXPLICIT or IMPLIED (not PARAPHRASED without speaker known)
    4. The outcome can be verified within 6–24 months

EXAMPLES:
- Host says "AI will replace SDRs" → HOST, EXPLICIT, is_evaluable: true
- Host says "My guest thinks crypto will crash" → THIRD_PARTY (the guest), PARAPHRASED, is_evaluable: false
- Interview: Guest says "We'll hit $1M ARR" → GUEST for guest name, EXPLICIT, is_evaluable: true
- Host says "It seems like OpenAI will probably..." → HOST, IMPLIED, is_evaluable: true if measurable

Only extract GENUINE forward-looking predictions — concrete claims about future outcomes.
NOT: opinions about the present, vague aspirations, recommendations.
Extract at most 15 predictions.

Return JSON:
{
  "predictions": [
    {
      "creator": "channel_name_from_evidence",
      "speaker_name": "actual speaker name or null if unknown",
      "speaker_role": "HOST | GUEST | THIRD_PARTY",
      "speaker_confidence": "HIGH | MEDIUM | LOW",
      "entity_name": "entity the prediction is about or null",
      "entity_type": "person | company | product | market | technology | unknown",
      "attribution_strength": "EXPLICIT | IMPLIED | PARAPHRASED",
      "topic": "topic area (2-4 words)",
      "prediction_text": "exact normalized prediction statement",
      "confidence": 0.0-1.0,
      "measurable_outcome": "what would prove or disprove this, or null",
      "is_evaluable": true or false
    }
  ]
}`,
      },
      { role: "user", content: `Evidence:\n\n${evidenceBlock}` },
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
    if (!p.creator || !p.prediction_text) continue;

    const speakerRole: SpeakerRole = ["HOST", "GUEST", "THIRD_PARTY"].includes(p.speaker_role)
      ? p.speaker_role
      : "HOST";
    const attribution: AttributionStrength = ["EXPLICIT", "IMPLIED", "PARAPHRASED"].includes(p.attribution_strength)
      ? p.attribution_strength
      : "IMPLIED";
    const speakerConf = ["HIGH", "MEDIUM", "LOW"].includes(p.speaker_confidence)
      ? p.speaker_confidence
      : "MEDIUM";

    const row: PredictionRow = {
      prediction_id: randomUUID(),
      creator: p.creator,
      topic: p.topic ?? "general",
      prediction_text: p.prediction_text,
      created_at: now,
      confidence: Math.max(0, Math.min(1, p.confidence ?? 0.5)),
      measurable_outcome: p.measurable_outcome ?? null,
      evidence_source: "research_index",
      speaker_name: p.speaker_name ?? null,
      speaker_role: speakerRole,
      speaker_confidence: speakerConf as "HIGH" | "MEDIUM" | "LOW",
      entity_name: p.entity_name ?? null,
      entity_type: p.entity_type ?? null,
      attribution_strength: attribution,
      outcome_tier: null,
      is_evaluable: Boolean(p.is_evaluable),
      prediction_accuracy_score: null,
      evaluation_evidence: null,
      evaluated_at: null,
      status: "pending",
    };

    await upsertPrediction(row);
    stored++;
  }

  return NextResponse.json({ extracted: stored, scanned: rows.length });
}
