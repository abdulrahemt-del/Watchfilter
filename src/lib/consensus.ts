import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SavedAnalysis } from "./db/schema";

export const consensusSchema = z.object({
  topic: z.string().describe("The common topic or event these videos all discuss"),
  shared_opinions: z
    .array(
      z.object({
        claim: z.string().describe("A specific claim or conclusion all or most creators agree on"),
        agreed_by: z.array(z.string()).describe("Video titles of creators who hold this view"),
        confidence: z.enum(["high", "medium", "low"]).describe("How strongly and clearly they agree"),
      }),
    )
    .describe("Claims where multiple creators converge"),
  disagreements: z
    .array(
      z.object({
        point: z.string().describe("The specific question or topic where creators diverge"),
        positions: z.array(
          z.object({
            source: z.string().describe("Video title"),
            stance: z.string().describe("Their specific position in 1-2 sentences"),
          }),
        ),
      }),
    )
    .describe("Points where creators take meaningfully different stances"),
  key_predictions: z
    .array(
      z.object({
        prediction: z.string().describe("A specific forward-looking claim made"),
        made_by: z.array(z.string()).describe("Video titles that made this prediction"),
        timeframe: z.string().nullable().describe("When they predict this will happen, null if unspecified"),
      }),
    )
    .describe("Forward-looking claims and predictions made across videos"),
  overall_sentiment: z.object({
    label: z.enum(["bullish", "bearish", "neutral", "mixed"]),
    score: z
      .number()
      .min(-5)
      .max(5)
      .describe("Sentiment score: -5=very bearish, 0=neutral, +5=very bullish"),
    summary: z
      .string()
      .describe("2-3 sentence summary of the overall mood and what drives it"),
  }),
  unique_insights: z
    .array(
      z.object({
        insight: z.string().describe("A standout idea or angle not covered by the others"),
        source: z.string().describe("The video title that raised it"),
      }),
    )
    .describe("Ideas that only one creator surfaced — the most differentiated thinking"),
});

export type ConsensusResult = z.infer<typeof consensusSchema>;

export async function buildConsensus(
  analyses: SavedAnalysis[],
  apiKey: string,
): Promise<ConsensusResult> {
  const openai = new OpenAI({ apiKey });

  const sourceSummaries = analyses
    .map((a, i) => {
      const title = a.title ?? `Video ${i + 1}`;
      const byLine = a.channelName ? ` by ${a.channelName}` : "";
      const points = (a.hard_data_points as Array<{ metric_title?: string; metric?: string } | string>)
        .map((p) => {
          if (typeof p === "string") return p;
          return p.metric_title ?? p.metric ?? "";
        })
        .filter(Boolean)
        .slice(0, 8)
        .map((p) => `  • ${p}`)
        .join("\n");
      const takeaways = (a.actionable_takeaways as Array<{ strategy: string } | string>)
        .map((t) => (typeof t === "string" ? t : t.strategy))
        .map((s) => `  • ${s}`)
        .join("\n");

      return [
        `SOURCE ${i + 1}: "${title}"${byLine}`,
        `Topic: ${a.primary_subject}`,
        `Clickbait score: ${a.clickbait_score}/10`,
        `Key data points:\n${points || "  (none extracted)"}`,
        `Key conclusions:\n${takeaways || "  (none extracted)"}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are a cross-source intelligence analyst. You receive structured summaries from multiple YouTube videos on the same topic. Your job is to identify: what creators agree on, where they genuinely disagree, what predictions they make, the overall sentiment, and the unique insights each brings that others don't. Be specific — attribute claims to their sources by exact video title. Surface real divergences, not superficial ones. If creators all agree, say so clearly.`,
      },
      {
        role: "user",
        content: `Analyze consensus and divergence across these ${analyses.length} videos:\n\n${sourceSummaries}`,
      },
    ],
    response_format: zodResponseFormat(consensusSchema, "consensus_analysis"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    const refusal = completion.choices[0]?.message?.refusal;
    throw new Error(refusal ?? "OpenAI returned no consensus analysis.");
  }
  return parsed;
}
