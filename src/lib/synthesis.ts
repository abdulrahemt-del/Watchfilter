import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SavedAnalysis } from "./db/schema";

// ── Schema ────────────────────────────────────────────────────────────────────

export const synthesisSchema = z.object({
  agreementStrength: z.object({
    score: z.number().min(0).max(100),
    label: z.enum(["Very High", "High", "Moderate", "Low", "Conflicted"]),
    rationale: z.string(),
  }),

  narrativeOverlap: z.array(z.object({
    theme: z.string(),
    summary: z.string(),
    supportedBy: z.array(z.string()),
    strength: z.enum(["Universal", "Majority", "Plurality"]),
  })),

  contrarianAlerts: z.array(z.object({
    topic: z.string(),
    clashDescription: z.string(),
    riskLevel: z.enum(["High", "Medium", "Low"]),
    positions: z.array(z.object({
      source: z.string(),
      channel: z.string().nullable(),
      claim: z.string(),
      evidence: z.string().nullable(),
    })),
  })),

  evidenceAuditTrail: z.array(z.object({
    consensusPoint: z.string(),
    citations: z.array(z.object({
      source: z.string(),
      channel: z.string().nullable(),
      directQuote: z.string().nullable(),
      dataPoint: z.string().nullable(),
    })),
  })),

  unifiedPlaybook: z.array(z.object({
    action: z.string(),
    rationale: z.string(),
    riskNote: z.string().nullable(),
    priority: z.enum(["Critical", "High", "Medium"]),
    supportedBy: z.array(z.string()),
  })),
});

export type SynthesisResult = z.infer<typeof synthesisSchema>;

// ── Data extraction ───────────────────────────────────────────────────────────

function extractPoints(raw: unknown[]): Array<{
  title: string; quote: string | null; insight: string | null;
  contrarian: string | null; takeaway: string | null;
}> {
  return raw.flatMap((p: unknown) => {
    if (!p || typeof p !== "object") return [];
    const r = p as Record<string, unknown>;
    const title =
      (r.metric_title as string | null) ??
      (r.title as string | null) ??
      (r.metric as string | null) ?? "";
    if (!title) return [];
    return [{
      title,
      quote:
        (r.quote as string | null) ??
        (r.direct_quote as string | null) ?? null,
      insight:
        (r.metric_context as string | null) ??
        (r.coreInsight as string | null) ??
        (r.causal_chain as string | null) ?? null,
      contrarian:
        (r.contrarian_view as string | null) ??
        (r.contrarianView as string | null) ?? null,
      takeaway:
        (r.actionable_takeaway as string | null) ??
        (r.actionableTakeaway as string | null) ?? null,
    }];
  });
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildSourceBlock(a: SavedAnalysis, index: number): string {
  const title = a.title ?? `Video ${index + 1}`;
  const channel = a.channelName ?? "Unknown";
  const points = extractPoints(a.hard_data_points as unknown[]);
  const takeaways = (a.actionable_takeaways as Array<{ strategy?: string } | string>)
    .map((t) => (typeof t === "string" ? t : (t.strategy ?? "")))
    .filter(Boolean);

  const pointsText = points.slice(0, 8).map((p) => {
    const lines = [`  • [CLAIM] ${p.title}`];
    if (p.quote)      lines.push(`    [QUOTE] "${p.quote}"`);
    if (p.insight)    lines.push(`    [CONTEXT] ${p.insight}`);
    if (p.contrarian) lines.push(`    [DISSENT] ${p.contrarian}`);
    if (p.takeaway)   lines.push(`    [ACTION] ${p.takeaway}`);
    return lines.join("\n");
  }).join("\n\n");

  return [
    `╔══ SOURCE ${index + 1}: "${title}" — ${channel} ══╗`,
    `Topic: ${a.primary_subject}`,
    `Clickbait score: ${a.clickbait_score}/10`,
    "",
    "Evidence & Data Points:",
    pointsText || "  (none extracted)",
    "",
    "Stated Takeaways:",
    takeaways.map((t) => `  • ${t}`).join("\n") || "  (none stated)",
  ].join("\n");
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildSynthesis(
  analyses: SavedAnalysis[],
  apiKey: string,
): Promise<SynthesisResult> {
  const openai = new OpenAI({ apiKey });

  const sourceSummaries = analyses
    .map((a, i) => buildSourceBlock(a, i))
    .join("\n\n" + "─".repeat(70) + "\n\n");

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are a forensic cross-channel intelligence analyst — the rigor of a Wall Street research desk combined with the pattern recognition of a seasoned venture capitalist. You receive structured intelligence briefings from multiple YouTube videos and perform a forensic cross-examination.

SCORING PROTOCOL:
- agreementStrength.score 0-100: Count distinct conclusions that appear in 2+ sources. Divide by total distinct conclusions × 100. Round to integer.
- Labels: 80–100 = Very High | 60–79 = High | 40–59 = Moderate | 20–39 = Low | 0–19 = Conflicted

CONTRARIAN ALERTS — highest value output:
- Only flag genuine claim-level contradictions, not topic differences.
- Format: "Creator A asserts [specific claim]. Creator B explicitly warns [contradicting specific claim] because [specific reason]."
- Risk level HIGH = contradiction directly affects a financial or strategic decision.

EVIDENCE AUDIT TRAIL:
- Only include consensus points backed by quotes or data points from 2+ sources.
- Never fabricate or paraphrase as quotes — only use text explicitly provided in [QUOTE] fields.
- If no direct quote exists, set directQuote to null and use the [CLAIM] text as dataPoint.

UNIFIED PLAYBOOK:
- Priority "Critical" = independently recommended by 3+ sources.
- Every action must be concrete and specific, not generic advice.
- Include risk notes from any dissenting voices (use [DISSENT] fields).

Attribution: always reference the exact video title as provided, never paraphrase it.`,
      },
      {
        role: "user",
        content: `Perform a forensic cross-examination of these ${analyses.length} intelligence briefings:\n\n${sourceSummaries}`,
      },
    ],
    response_format: zodResponseFormat(synthesisSchema, "synthesis_result"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    const refusal = completion.choices[0]?.message?.refusal;
    throw new Error(refusal ?? "OpenAI returned no synthesis result.");
  }
  return parsed;
}
