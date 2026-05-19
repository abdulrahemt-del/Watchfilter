import { z } from "zod";

export const videoAnalysisSchema = z.object({
  clickbait_score: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe(
      "1 = title matches content exactly; 10 = title is highly misleading vs actual content",
    ),
  primary_subject: z
    .string()
    .describe(
      "Core entity, asset, product, or concept the video is actually about",
    ),
  hard_data_points: z
    .array(
      z.object({
        metric_title: z
          .string()
          .describe(
            "The specific data point as a complete, self-explanatory statement including the number and what it measures (e.g. '22x more memorable than statistics alone')",
          ),
        causal_chain: z
          .string()
          .describe(
            "Step-by-step logical chain showing exactly how the speaker connects their premise to this data point. Format: Step A → Result B → Core Metric. Specific to this video's argument.",
          ),
        direct_quote: z
          .string()
          .describe(
            "The single most high-impact verbatim or near-verbatim quote from the speaker at the exact moment they explain this statistic. Use quotation marks. Never fabricate.",
          ),
        credibility_check: z
          .string()
          .describe(
            "1-to-2 sentences objectively assessing whether this claim is: a verified historical/economic fact, an active policy/institutional statistic, or a speculative prediction by the speaker. Be precise and honest.",
          ),
        exact_timestamp: z
          .string()
          .describe(
            "M:SS or H:MM:SS timestamp from the bracketed transcript where the speaker is actively articulating this point",
          ),
      }),
    )
    .describe("Key quantitative claims with causal chain, direct quote, credibility assessment, and timestamp"),
  actionable_takeaways: z
    .array(
      z.object({
        strategy: z
          .string()
          .describe("High-level strategy conclusion from the video"),
        execution_steps: z
          .array(z.string())
          .min(2)
          .max(3)
          .describe(
            "Specific, tactical steps a professional can implement today",
          ),
      }),
    )
    .min(3)
    .max(4),
  timestamps: z
    .array(
      z.object({
        takeaway_index: z
          .number()
          .int()
          .min(0)
          .describe("0-based index into actionable_takeaways"),
        label: z.string().describe("Short label for the takeaway"),
        time: z
          .string()
          .describe("Estimated position as M:SS or H:MM:SS from transcript"),
      }),
    )
    .min(3)
    .max(4),
});

export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>;

export type TranscriptSegment = {
  text: string;
  offsetMs: number;
  durationMs: number;
};

export type AnalyzeVideoResult = VideoAnalysis & {
  videoId: string;
  title: string | null;
  transcriptCharCount: number;
  transcriptSource: string;
};
