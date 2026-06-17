import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { db, getPredictionById, updatePredictionScore } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { prediction_id?: string; evaluate_all?: boolean };
  try { body = await req.json() as typeof body; } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const c = await db();

  // Build list of predictions to evaluate
  let predictionIds: string[] = [];
  if (body.evaluate_all) {
    const { rows } = await c.execute({
      sql: `SELECT prediction_id FROM creator_predictions WHERE status = 'pending' LIMIT 20`,
      args: [],
    });
    predictionIds = rows.map(r => r.prediction_id as string);
  } else if (body.prediction_id) {
    predictionIds = [body.prediction_id];
  } else {
    return NextResponse.json({ error: "Provide prediction_id or evaluate_all: true" }, { status: 400 });
  }

  if (!predictionIds.length) return NextResponse.json({ evaluated: 0, message: "No pending predictions" });

  let evaluated = 0;
  for (const pid of predictionIds) {
    const prediction = await getPredictionById(pid);
    if (!prediction) continue;

    // Gather later evidence about this topic from the library
    const keywords = prediction.topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const kws = keywords.slice(0, 4);
    const conditions = kws.length > 0
      ? kws.map(() => `(LOWER(quote) LIKE ? OR LOWER(COALESCE(insight,'')) LIKE ?)`).join(" OR ")
      : "1=1";
    const args: string[] = kws.flatMap(kw => [`%${kw}%`, `%${kw}%`]);

    const { rows: evidenceRows } = await c.execute({
      sql: `
        SELECT quote, insight, channel_name, COALESCE(upload_date, indexed_at) as date
        FROM research_index
        WHERE ${conditions}
        ORDER BY indexed_at DESC
        LIMIT 30
      `,
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

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Prediction Evaluator. Assess whether a creator's prediction has come true based on later evidence.

Score 0–100:
  0–30   = clearly wrong / opposite happened
  31–50  = likely wrong or no evidence of happening
  51–70  = uncertain / partial evidence
  71–90  = largely accurate based on evidence
  91–100 = clearly accurate, well-supported

Status: "accurate" (score ≥70), "inaccurate" (score ≤40), "unknown" (41–69)

Return JSON: { "score": 0-100, "status": "accurate|inaccurate|unknown", "evidence": "2-3 sentence assessment citing specific evidence" }`,
        },
        {
          role: "user",
          content: `Prediction by ${prediction.creator}: "${prediction.prediction_text}"\nTopic: ${prediction.topic}\nMeasurable outcome: ${prediction.measurable_outcome ?? "not specified"}\n\nLater evidence:\n${evidenceBlock}`,
        },
      ],
    });

    type EvalResult = { score?: number; status?: string; evidence?: string };
    let result: EvalResult = {};
    try { result = JSON.parse(res.choices[0]?.message?.content ?? "{}") as EvalResult; } catch { /* skip */ }

    const score = Math.max(0, Math.min(100, result.score ?? 50));
    const status = result.status === "accurate" ? "accurate"
      : result.status === "inaccurate" ? "inaccurate"
      : "unknown";

    await updatePredictionScore(pid, score, result.evidence ?? "No evidence summary.", status);
    evaluated++;
  }

  return NextResponse.json({ evaluated, total: predictionIds.length });
}
