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
            "KEY INSIGHT — what does this data point REVEAL about the speaker's business model, market position, or strategy? 3-4 sentences of interpretation. Do NOT restate the quote or paraphrase what was said. Instead: what does this number mean? What does it tell a founder or investor about competitive dynamics or business logic? Use the speaker's actual name throughout. Write as a business analyst extracting insight, not a narrator describing what was said.",
          ),
        strategic_intent: z
          .string()
          .describe(
            "3-4 sentences in two parts. PART 1 — CONTEXT (1-2 sentences): What was the speaker discussing immediately before introducing this metric? What story, personal experience, question, or topic thread led to this exact moment? Give enough narrative that a reader who hasn't watched the video understands the setup — name the situation, not just the topic. PART 2 — RHETORICAL ANALYSIS (2 sentences): WHY the speaker deployed this metric at this exact point. Name the specific persuasion mechanic precisely: anchoring a success outcome before presenting the method? Using a loss statistic to trigger loss-aversion before a pitch? Citing a personal revenue figure to justify a premium price point? State exactly what the speaker is doing and why it works psychologically. BANNED PHRASES: 'establishes credibility', 'positions themselves', 'highlights the importance', 'demonstrates expertise', 'emphasizes success'.",
          ),
        causal_chain: z
          .string()
          .describe(
            "Reconstruct the actual business logic the speaker asserts. Format strictly as linked steps: Premise → Mechanism → Outcome → Metric. Each step must be a 3-6 word phrase describing a real mechanism, not just an outcome. BAD: 'Hard Work → Success → $30M Revenue'. GOOD: 'Weak Offer Redesigned → Conversion Rate Improved → CAC Dropped → Revenue Scaled → $30M Annual'. Specific to this speaker's actual argument — not a generic description of the topic.",
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
          .optional()
          .describe("Legacy field — superseded by verification_status and verification_reason."),
        why_it_matters: z
          .string()
          .describe(
            "2-3 sentences on the business implication. What does this data point mean for a founder, operator, or investor TODAY? Not a restatement — a genuine interpretation of market dynamics, competitive positioning, or business logic. Write like a McKinsey analyst briefing a client.",
          ),
        actionable_takeaway: z
          .string()
          .describe(
            "One specific action a founder or operator should take based on THIS data point. Start with a concrete verb. Never 'consider' or 'think about'. Example: 'Audit your current offer and test one change to value delivery before increasing ad spend this quarter.'",
          ),
        signal_strength: z
          .enum(["Very High", "High", "Medium", "Low"])
          .describe(
            "Evidence quality rating. High = first-person experience with specific numbers, or independently verified data from a named source. Medium = plausible claim from a credible speaker, but no external verification. Low = speculation, vague assertion, or opinion without supporting evidence.",
          ),
        signal_reason: z
          .string()
          .describe(
            "One sentence explaining the signal strength assignment. Reference the specific evidence type (e.g., 'First-person revenue figure stated by the speaker with no external source cited' or 'Cited academic study from a named institution').",
          ),
        verification_status: z
          .enum(["Verified", "Partially Verified", "Unverified", "Opinion", "Speculation"])
          .describe(
            "Verified = independently confirmable fact or data from a named external source. Partially Verified = specific claim that is plausible but not independently confirmed in this video. Unverified = assertion with no supporting evidence. Opinion = speaker's view presented as insight, not objectively verifiable. Speculation = forward-looking prediction.",
          ),
        verification_reason: z
          .string()
          .describe(
            "One sentence explaining the verification status. Be specific about what evidence exists or is missing.",
          ),

        viewer_blind_spot: z
          .string()
          .optional()
          .describe(
            "What most viewers will focus on vs. what is actually more important. Start with 'Most viewers will focus on...' then pivot: 'The more important insight is...' 2–3 sentences of insider intelligence — the non-obvious reading a sophisticated analyst would catch.",
          ),

        second_order_implications: z
          .string()
          .optional()
          .describe(
            "What happens next if this data point is true? Format: 'If [claim] is true, then [first-order consequence], which means [second-order consequence].' 2–3 sentences. Avoid generic phrasing — be specific to this speaker's argument.",
          ),

        contrarian_view: z
          .string()
          .optional()
          .describe(
            "One credible alternative explanation or counter-argument. Start with 'Alternative view:'. Return null if no credible counter-argument exists.",
          ),

        opportunity_potential: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .describe(
            "0–100 score for actionable business or investment opportunity this data point signals. 80–100 = high demand, low saturation, strong consensus, time-sensitive. 50–79 = moderate. 0–49 = speculative or generic.",
          ),

        opportunity_reason: z
          .string()
          .optional()
          .describe(
            "2–3 bullet factors explaining the score, joined with · (e.g. 'Growing creator consensus · Low market saturation · First-mover window open').",
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
    .min(5)
    .describe(
      "5–7 unexpected, high-value pieces of advice, personal anecdotes, or standalone golden nuggets the speaker drops that do NOT fit neatly within the primary thesis or hard data points — the off-the-cuff insights and mental models that are often the most memorable and immediately usable moments in the video. Each must be a complete, standalone sentence a viewer could quote or act on immediately.",
    ),

  who_should_care: z
    .object({
      most_relevant_for: z
        .array(z.string())
        .min(1)
        .max(4)
        .describe("Specific roles or contexts that get the most value (e.g. 'DTC brand founders', 'Early-stage SaaS operators', 'Crypto investors'). Be specific — not 'Entrepreneurs' but 'Founders scaling past $1M revenue'."),
      less_relevant_for: z
        .array(z.string())
        .max(3)
        .optional()
        .describe("Roles or contexts where this content adds limited value. Omit if broadly relevant."),
    })
    .optional()
    .describe("Audience relevance filter — who specifically gets the most from this content"),

  analysis_confidence: z
    .object({
      score: z
        .number()
        .int()
        .min(0)
        .max(100)
        .describe("0–100. 90+ = detailed transcript, specific verifiable claims. 70–89 = good with minor gaps. 50–69 = moderate uncertainty. Below 50 = significant gaps in transcript or evidence."),
      factors: z
        .string()
        .describe("2–3 factors joined with · explaining the score (e.g. 'Detailed transcript · Specific figures cited · No external source verification' or 'Sparse transcript · Vague claims · Speaker unnamed')."),
    })
    .optional()
    .describe("Analyst self-assessment of interpretation reliability"),

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
