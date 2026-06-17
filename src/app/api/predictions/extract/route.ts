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
  creator: string;
  topic: string;
  prediction_text: string;
  confidence: number;
  measurable_outcome: string | null;
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch recent research_index rows that haven't been processed yet
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
    if (r.record_date) lines.push(`Date: ${String(r.record_date).slice(0, 10)}`);
    lines.push(`Quote: "${String(r.quote).slice(0, 300)}"`);
    if (r.insight) lines.push(`Insight: ${String(r.insight).slice(0, 150)}`);
    return lines.join("\n");
  }).join("\n\n---\n\n");

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a Prediction Extractor. Identify all forward-looking statements (predictions) from creator evidence.

A prediction is any statement about what will happen in the future.
Examples: "AI agents will replace SDRs", "Short-form content will dominate", "This company will fail".

RULES:
- Only extract GENUINE predictions — concrete claims about future outcomes
- NOT opinions about the present ("this is underrated")
- NOT vague aspirations ("we should all do X")
- Assign confidence based on how firmly the creator stated it (0.0–1.0)
- Generate a measurable_outcome: what would prove this true or false?
- Extract at most 15 predictions total

Return JSON:
{
  "predictions": [
    {
      "creator": "channel_name",
      "topic": "topic area (2-4 words)",
      "prediction_text": "exact normalized prediction statement",
      "confidence": 0.0-1.0,
      "measurable_outcome": "what would prove or disprove this"
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
    const row: PredictionRow = {
      prediction_id: randomUUID(),
      creator: p.creator,
      topic: p.topic ?? "general",
      prediction_text: p.prediction_text,
      created_at: now,
      confidence: Math.max(0, Math.min(1, p.confidence ?? 0.5)),
      measurable_outcome: p.measurable_outcome ?? null,
      evidence_source: "research_index",
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
