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
        speaker_thesis: z
          .string()
          .describe(
            "A 3-to-4 sentence conversational paragraph summarizing exactly how the speaker explains this data point, their logic, and the context in which they present it. Write in a natural narrative voice — capture the speaker's framing, the 'why it matters' in their argument, and any surrounding context from the video.",
          ),
        strategic_intent: z
          .string()
          .describe(
            "A razor-sharp 2-to-3 sentence breakdown of the speaker's exact psychological or structural motive for using this specific metric. Identify the underlying persuasion mechanic: are they anchoring authority, validating a personal sales funnel, shielding against criticism, building urgency or fear, or justifying a premium valuation? Avoid generic descriptions — name the specific leverage strategy at play.",
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
        metric_context_example: z
          .string()
          .describe(
            "A concrete real-world illustration, analogy, or comparison that immediately grounds this data point for the viewer — a scenario, historical parallel, or practical example that conveys the true scale and significance of the number. Should be 1-2 sentences and feel like how a brilliant friend would explain why this number actually matters in the real world.",
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
    .min(1)
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
  speaker_name: z
    .string()
    .optional()
    .describe(
      "The full name of the primary speaker/host as identified from the transcript or video context (e.g. 'Alex Hormozi', 'Steven Bartlett'). If the speaker's name is never mentioned, use null.",
    ),
  off_script_nuggets: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe(
      "2–3 unexpected, high-value pieces of advice, personal anecdotes, or standalone golden nuggets the speaker drops that do NOT fit neatly within the primary thesis or hard data points — the off-the-cuff insights and mental models that are often the most memorable and immediately usable moments in the video. Each must be a complete, standalone sentence a viewer could quote or act on immediately.",
    ),

  worth_watching: z
    .object({
      score: z
        .number()
        .min(1)
        .max(10)
        .describe(
          "Composite worth-watching score 1–10. Weight: educational_value 30%, uniqueness 25%, practicality 25%, signal density (11 − fluff_ratio) 20%. Adjust ±0.5 for genuine time-sensitivity.",
        ),
      educational_value: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("New accurate knowledge delivered (1=nothing new, 10=highly educational)"),
      uniqueness: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("How distinct vs typical content on this topic (1=clone content, 10=unique perspective)"),
      fluff_ratio: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("Filler vs substance (1=tight/dense, 10=mostly filler and padding)"),
      practicality: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("How immediately actionable the content is (1=purely theoretical, 10=step-by-step actionable)"),
      time_sensitivity: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("Urgency/relevance (1=evergreen, 10=must-watch-today)"),
      verdict: z
        .string()
        .describe(
          "One punchy verdict sentence. Examples: 'Worth your time', 'Mostly repetitive — skip unless new to topic', 'Dense with actionable tactics', 'Hype-heavy, low signal ratio', 'Good background listening'",
        ),
      skip_to: z
        .string()
        .nullable()
        .describe(
          "M:SS or H:MM:SS timestamp where real value begins if opening is padded. null if no significant intro padding.",
        ),
    })
    .describe("Composite worth-watching rating across five dimensions"),
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
  channelName: string | null;
  viewCount: number | null;
  uploadDate: string | null;
  durationSeconds: number | null;
  transcriptCharCount: number;
  transcriptSource: string;
};
