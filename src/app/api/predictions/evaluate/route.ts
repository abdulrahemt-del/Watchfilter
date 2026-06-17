import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { db, getPredictionById, updatePredictionScore, type OutcomeTier } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

// Tier weights for weighted accuracy formula
const TIER_WEIGHTS: Record<number, number> = { 1: 1.0, 2: 0.6, 3: 0.3 };

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { prediction_id?: string; evaluate_all?: boolean };
  try { body = await req.json() as typeof body; } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const c = await db();

  let predictionIds: string[] = [];
  if (body.evaluate_all) {
    // Only evaluate predictions where is_evaluable = true and status is pending
    const { rows } = await c.execute({
      sql: `SELECT prediction_id FROM creator_predictions
            WHERE status = 'pending' AND is_evaluable = 1
            LIMIT 20`,
      args: [],
    });
    predictionIds = rows.map(r => r.prediction_id as string);
  } else if (body.prediction_id) {
    predictionIds = [body.prediction_id];
  } else {
    return NextResponse.json({ error: "Provide prediction_id or evaluate_all: true" }, { status: 400 });
  }

  if (!predictionIds.length) return NextResponse.json({ evaluated: 0, message: "No evaluable pending predictions" });

  let evaluated = 0;

  for (const pid of predictionIds) {
    const prediction = await getPredictionById(pid);
    if (!prediction) continue;

    // Skip non-evaluable claims (unlinked chains) — mark as unlinked
    if (!prediction.is_evaluable) {
      await updatePredictionScore(pid, 0, "Claim chain incomplete — speaker or outcome unverifiable.", "unlinked");
      evaluated++;
      continue;
    }

    // Gather later evidence about this topic
    const keywords = prediction.topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const entityKw = prediction.entity_name ? [prediction.entity_name.toLowerCase()] : [];
    const kws = [...new Set([...keywords, ...entityKw])].slice(0, 5);

    const conditions = kws.length > 0
      ? kws.map(() => `(LOWER(quote) LIKE ? OR LOWER(COALESCE(insight,'')) LIKE ?)`).join(" OR ")
      : "1=1";
    const args: string[] = kws.flatMap(kw => [`%${kw}%`, `%${kw}%`]);

    const { rows: evidenceRows } = await c.execute({
      sql: `SELECT quote, insight, channel_name, COALESCE(upload_date, indexed_at) as date
            FROM research_index
            WHERE ${conditions}
            ORDER BY indexed_at DESC
            LIMIT 30`,
      args,
    });

    if (!evidenceRows.length) {
      await updatePredictionScore(pid, 50, "No later evidence found — inconclusive.", "unknown");
      evaluated++;
      continue;
    }

    const evidenceBlock = evidenceRows.map((r, i) =>
      `[E${i + 1}] ${r.channel_name} (${String(r.date ?? "").slice(0, 10)}): "${String(r.quote).slice(0, 200)}"\n${r.insight ? `Insight: ${String(r.insight).slice(0, 120)}` : ""}`
    ).join("\n\n");

    const speakerCtx = prediction.speaker_name
      ? `Speaker: ${prediction.speaker_name} (${prediction.speaker_role})`
      : `Speaker role: ${prediction.speaker_role}`;
    const entityCtx = prediction.entity_name
      ? `Entity: ${prediction.entity_name} (${prediction.entity_type ?? "unknown"})`
      : "";

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Prediction Evaluator using the WatchFilter v3 tier-based scoring system.

OUTCOME TIER CLASSIFICATION:
Tier 1 (weight 1.0) — Highly measurable, independently verifiable:
  - Specific % growth, revenue milestone, launch date, market event
  - Clear binary outcome (happened / did not happen)

Tier 2 (weight 0.6) — Moderately measurable, partially verifiable:
  - Direction-of-travel claim ("X will grow significantly")
  - Qualitative shift with trackable proxies

Tier 3 (weight 0.3) — Vague but evaluable with interpretation:
  - General trend claims ("AI will be everywhere")
  - Directional without specifics

Tier 4 (excluded) — Not evaluable:
  - Opinion, preference, or impossible to verify
  - No measurable signal exists

ACCURACY SCORE 0–100:
  0–30   = Clearly wrong / opposite happened
  31–50  = Likely wrong or no supporting evidence
  51–70  = Uncertain / partial evidence
  71–90  = Largely accurate based on available evidence
  91–100 = Clearly accurate, well-supported

STATUS:
  "accurate"   → score ≥ 70
  "inaccurate" → score ≤ 40
  "unknown"    → score 41–69

If tier = 4, set score = 0, status = "unlinked", evidence = "Prediction is not evaluable — no measurable outcome exists."

Return JSON:
{
  "tier": 1-4,
  "score": 0-100,
  "status": "accurate|inaccurate|unknown|unlinked",
  "evidence": "2-3 sentence assessment citing specific evidence items by [E#]"
}`,
        },
        {
          role: "user",
          content: [
            `Prediction by ${prediction.creator}: "${prediction.prediction_text}"`,
            `Topic: ${prediction.topic}`,
            speakerCtx,
            entityCtx,
            `Attribution: ${prediction.attribution_strength}`,
            `Measurable outcome: ${prediction.measurable_outcome ?? "not specified"}`,
            ``,
            `Later evidence:`,
            evidenceBlock,
          ].filter(Boolean).join("\n"),
        },
      ],
    });

    type EvalResult = { tier?: number; score?: number; status?: string; evidence?: string };
    let result: EvalResult = {};
    try { result = JSON.parse(res.choices[0]?.message?.content ?? "{}") as EvalResult; } catch { /* skip */ }

    const rawTier = result.tier ?? 3;
    const tier: OutcomeTier = ([1, 2, 3, 4].includes(rawTier) ? rawTier : 3) as OutcomeTier;

    let score: number;
    let status: "accurate" | "inaccurate" | "unknown" | "unlinked";

    if (tier === 4) {
      score = 0;
      status = "unlinked";
    } else {
      // Apply tier weight to raw score — weighted accuracy formula
      const rawScore = Math.max(0, Math.min(100, result.score ?? 50));
      const weight = TIER_WEIGHTS[tier] ?? 0.3;
      // Store the weighted score: raw_score × tier_weight (normalized to 0-100)
      score = Math.round(rawScore * weight);
      status = result.status === "accurate" ? "accurate"
        : result.status === "inaccurate" ? "inaccurate"
        : "unknown";
    }

    await updatePredictionScore(pid, score, result.evidence ?? "No evidence summary.", status, tier);
    evaluated++;
  }

  return NextResponse.json({ evaluated, total: predictionIds.length });
}
