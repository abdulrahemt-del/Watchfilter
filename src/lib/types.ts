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
            "The specific data point or number as a complete, self-explanatory statement (e.g. '22x more memorable than statistics alone', '90% of decisions are subconscious')",
          ),
        speaker_thesis: z
          .string()
          .describe(
            "3-to-4 sentences explaining EXACTLY how the speaker connects this number to their overarching argument — name the specific concepts, frameworks, or examples they actually raised",
          ),
        direct_quote: z
          .string()
          .describe(
            "A powerful direct quote or close paraphrase from the speaker explaining or reacting to this specific statistic — use quotation marks if verbatim",
          ),
        exact_timestamp: z
          .string()
          .describe(
            "M:SS or H:MM:SS timestamp from the bracketed transcript markers where the speaker is actively articulating this point",
          ),
      }),
    )
    .describe("Key quantitative claims with deep speaker-anchored thesis, direct quote, and timestamp"),
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
