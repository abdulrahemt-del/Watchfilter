import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

const CONSENSUS_SYSTEM_PROMPT = `You are a private intelligence analyst preparing a daily briefing for a senior founder or investor. Your task is to synthesize what YouTube creators are actually discussing into specific, evidence-backed intelligence.

━━━ CORE RULE ━━━
Every claim must cite a specific number from the provided data (N creators, N videos, N references).
Every insight must be grounded in the actual creator discussions provided — not your general knowledge.
Never write anything that could appear in any generic AI newsletter or dashboard.

━━━ BANNED PHRASES — never use these, ever ━━━
"leverage opportunities" | "optimize outcomes" | "enhance decision-making" | "improve performance" |
"explore possibilities" | "consider exploring" | "may present opportunities" | "strategic approach" |
"stay informed" | "monitor trends" | "identify opportunities" | "valuable insights" |
"it is worth noting" | "in today's landscape" | "in the current landscape" | "it is important to" |
"the space is evolving" | "growing importance" | "increasingly relevant"

━━━ FIELD SPECIFICATIONS ━━━

mostImportantInsight — The most important specific finding that would surprise an intelligent founder or investor.
  If the top 2 themes are complementary or tell a unified story, synthesize them into a single cross-theme insight.
  If one theme dominates, use it exclusively. Choose whichever produces the most surprising and specific insight.
  • insight: 1–2 sentences. Must cite total creator count AND video count across the relevant themes. Must name what they specifically said — not just the topic.
    BAD: "Venture capital shows strong activity."
    SINGLE-THEME GOOD: "Four creators independently reported improving startup valuations for first-time fund managers, citing increased LP appetite for sub-$100M vehicles across 9 videos."
    CROSS-THEME GOOD: "Institutional interest in Bitcoin and startup funding conditions are both strengthening across 5 creators and 11 videos, suggesting increasing appetite for growth-oriented assets."
  • whyItMatters: 1 sentence. Must start with "Reveals", "Shows", "Confirms", or "Signals". State a concrete business implication.
    BAD: "This is relevant for investors."
    GOOD: "Signals that the denominator effect from 2022 is reversing, opening a deployment window before large funds re-enter."
  • creatorCount, videoCount, referenceCount: sum of relevant theme counts (if cross-theme, combine them)
  • topCreators: up to 4 creator names from input

executiveBrief — 4–6 bullets. Each bullet MUST:
  • Start with a specific number or named subject: "4 creators", "Across 3 videos", "Bitcoin ETF discussion"
  • State what creators specifically said — not a general topic
  • End with a concrete implication using "→" as separator
  • Be max 25 words
  BAD: "Monitor Bitcoin trends." | "Consider exploring AI." | "Stay informed about markets."
  GOOD: "4 creators cited ETF inflows as primary driver of institutional Bitcoin interest (11 videos) → suggests sustained demand, not a speculative spike."
  GOOD: "3 independent creators reported improving startup valuations for early-stage rounds → early deployment window may close within 2 quarters."

themes[].consensus — ONE sentence. The single most important field — quality here determines whether the dashboard feels like real intelligence or generic AI output.
  • Must start with a number: "N creators...", "Across N videos...", "N independent sources..."
  • Must describe a SPECIFIC ACTION, DISCOVERY, or FINDING — not an observation or opinion
  • Must include at least one concrete detail: a cost figure, specific role/workflow, timeframe, metric, or outcome
  • HEDGING IS BANNED. Never use: "may be", "could be", "might", "tends to", "appears to", "seems to", "potentially", "likely"
    These are weasel words. State what creators actually reported doing or finding.
  BAD: "Four creators argued traditional hiring may be ineffective." (hedging + vague, no concrete detail)
  BAD: "AI is growing." | "Venture Capital shows opportunity." | "Bitcoin may be worth considering."
  BAD: "Creators discussed the importance of AI in business operations." (no specifics at all)
  GOOD: "Four creators reported replacing junior administrative roles with AI workflows, citing 60–80% cost reduction and faster execution."
  GOOD: "Three founders described cutting planned headcount by 2–3 roles because AI tools eliminated repetitive operations work."
  GOOD: "Two creators independently reported generating $15k–$40k/month from AI-driven agency services with teams under 5 people."
  GOOD: "Three creators independently argued AI appointment-setting services require under $500 to launch with recurring SMB revenue from day one."

themes[].confidence — integer 0–100. Formula: 1 creator=40–55, 2=58–70, 3=71–82, 4+=83–95. Adjust up for consistent insights, down for contradictions.

themes[].trendDirection — "growing" | "stable" | "declining"

themes[].opportunitySignal — "High" | "Medium" | "Low"

themes[].whyItMatters — ONE sentence starting with "Reveals", "Shows", "Confirms", or "Signals". Must reference a specific market shift or business consequence — not a general topic description.
  BAD: "AI presents opportunities for businesses." | "This is important for founders." | "Shows that AI is changing hiring." (too generic)
  GOOD: "Reveals how solo operators are replacing 3-person sales teams with AI tools for under $300/month."
  GOOD: "Shows that businesses can maintain $2M+ revenue with teams under 5 by automating operational roles."
  GOOD: "Confirms that ETF inflows are the primary mechanism driving institutional Bitcoin demand, not speculative retail activity."

themes[].recommendedActions — Exactly 3 actions. Each must be specific enough to put on a task list for this week and directly reference the theme's evidence:
  BAD: "Review your hiring strategy." | "Consider AI tools." | "Improve your operations." | "Explore opportunities."
  GOOD: "Identify 2 roles currently performing repetitive admin work and test AI workflow replacement this sprint."
  GOOD: "Audit your lead generation process and identify one step AI appointment-setting could automate within 7 days."
  GOOD: "Review Bitcoin ETF inflow data from the last 30 days before your next portfolio allocation decision."
  GOOD: "Map comparable startup funding rounds from the last 90 days and update your valuation assumptions."

themes[].contrarianView — ONE sentence if a dissenting view is present in the insights. "" if none.

topOpportunity.reason — 2 sentences structured as an investment memo:
  Sentence 1: What the data shows (cite creator + video counts).
  Sentence 2: Why the timing matters now.
  BAD: "This is a growing opportunity in the market."
  GOOD: "Five creators independently reported growing SMB demand for AI-driven lead generation, citing reduced friction and lower CAC across 18 videos. The window is early: commoditization is 12–18 months away based on current creator consensus."

topRisk.reason — 2 sentences on the specific risk with evidence counts. null if no risk reached consensus.

actions — Exactly 3 specific actions a founder/operator can take TODAY. Same quality bar as recommendedActions above.

Be direct. Assume a sophisticated operator with zero tolerance for vague advice.`;

export interface MostImportantInsight {
  insight: string;
  whyItMatters: string;
  creatorCount: number;
  videoCount: number;
  referenceCount: number;
  topCreators: string[];
}

export interface ConsensusTheme {
  topic: string;
  consensus: string;
  confidence: number;
  trendDirection: "growing" | "stable" | "declining";
  opportunitySignal: "High" | "Medium" | "Low";
  opportunityTopics: string[];
  whyItMatters: string;
  recommendedActions: string[];
  contrarianView: string;
}

export interface ConsensusResult {
  mostImportantInsight: MostImportantInsight | null;
  executiveBrief: string[];
  themes: ConsensusTheme[];
  topOpportunity: { topic: string; reason: string; confidence: number } | null;
  topRisk:        { topic: string; reason: string; confidence: number } | null;
  actions:        string[];
}

interface ThemeInput {
  topic: string;
  count: number;
  creators: string[];
  insights: string[];
  referenceCount: number;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { themes, topOpportunity, topRisk } = (await req.json()) as {
      themes: ThemeInput[];
      topOpportunity: ThemeInput | null;
      topRisk: ThemeInput | null;
    };

    if (!themes?.length) {
      return NextResponse.json({
        mostImportantInsight: null,
        executiveBrief: [], themes: [], topOpportunity: null, topRisk: null, actions: [],
      } satisfies ConsensusResult);
    }

    const themeList = themes.slice(0, 6).map((t, i) =>
      `Theme ${i + 1}: ${JSON.stringify(t.topic)}\nCreators (${t.creators.length}): ${t.creators.slice(0, 4).map((c) => JSON.stringify(c)).join(", ")}\nVideos: ${t.count} | References: ${t.referenceCount}\nKey insights:\n${
        t.insights.slice(0, 3).map((s) => `  - ${JSON.stringify(s)}`).join("\n") || "  - (no insights extracted)"
      }`
    ).join("\n\n");

    const oppSection = topOpportunity
      ? `\n\nTop Opportunity: ${JSON.stringify(topOpportunity.topic)}\nCreators (${topOpportunity.creators.length}): ${topOpportunity.creators.slice(0, 3).map((c) => JSON.stringify(c)).join(", ")}\nVideos: ${topOpportunity.count} | References: ${topOpportunity.referenceCount}\nInsights:\n${
          topOpportunity.insights.slice(0, 3).map((s) => `  - ${JSON.stringify(s)}`).join("\n") || "  - (no insights)"
        }`
      : "\n\nTop Opportunity: none identified";

    const riskSection = topRisk
      ? `\n\nTop Risk: ${JSON.stringify(topRisk.topic)}\nCreators (${topRisk.creators.length}): ${topRisk.creators.slice(0, 3).map((c) => JSON.stringify(c)).join(", ")}\nVideos: ${topRisk.count} | References: ${topRisk.referenceCount}\nInsights:\n${
          topRisk.insights.slice(0, 3).map((s) => `  - ${JSON.stringify(s)}`).join("\n") || "  - (no insights)"
        }`
      : "\n\nTop Risk: none identified";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CONSENSUS_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Today's creator intelligence:\n\n${themeList}${oppSection}${riskSection}\n\n` +
            `CRITICAL: The "topic" field in each themes[] entry MUST be copied EXACTLY from the input theme name above (e.g. "VENTURE CAPITAL", "STARTUPS"). Do NOT rename, abbreviate, rephrase, or modify any topic name. The topic string must match character-for-character.\n\n` +
            `Return JSON:\n` +
            `{"mostImportantInsight":{"insight":"4 creators independently reported...","whyItMatters":"Reveals...","creatorCount":4,"videoCount":11,"referenceCount":29,"topCreators":["Creator A","Creator B"]},` +
            `"executiveBrief":["4 creators cited ETF inflows → sustained demand, not speculative","3 creators reported startup valuations improving → early window closing"],` +
            `"themes":[{"topic":"<EXACT topic string from input, e.g. VENTURE CAPITAL>","consensus":"N creators independently argued...","confidence":82,"trendDirection":"growing","opportunitySignal":"High",` +
            `"opportunityTopics":["AI Agencies","Lead Generation"],"whyItMatters":"Reveals how...","recommendedActions":["Audit your...","Review...","Test..."],"contrarianView":""}],` +
            `"topOpportunity":{"topic":"<EXACT topic string>","reason":"Five creators reported... The window is early...","confidence":85},` +
            `"topRisk":{"topic":"<EXACT topic string>","reason":"...","confidence":70},` +
            `"actions":["Audit your lead generation for...","Review Bitcoin ETF inflow data...","Test AI appointment-setting with..."]}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const raw    = completion.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<ConsensusResult>;

    // Normalize AI-returned topic names back to exact input topic strings.
    // The AI sometimes renames topics despite instructions. We fix this server-side
    // so the client can always match by exact string without fuzzy logic.
    const inputTopics = themes.map(t => t.topic);
    const normalizedThemes = (parsed.themes ?? []).map((rt, idx) => {
      const needle = rt.topic?.toLowerCase() ?? "";
      // 1. Exact case-insensitive match
      const exact = inputTopics.find(it => it.toLowerCase() === needle);
      if (exact) return { ...rt, topic: exact };
      // 2. Substring match (one contains the other)
      const partial = inputTopics.find(it => {
        const h = it.toLowerCase();
        return h.includes(needle) || needle.includes(h);
      });
      if (partial) return { ...rt, topic: partial };
      // 3. Positional fallback — same index as input order
      return { ...rt, topic: inputTopics[idx] ?? rt.topic };
    });

    return NextResponse.json({
      mostImportantInsight: parsed.mostImportantInsight ?? null,
      executiveBrief: parsed.executiveBrief ?? [],
      themes:         normalizedThemes,
      topOpportunity: parsed.topOpportunity ?? null,
      topRisk:        parsed.topRisk        ?? null,
      actions:        parsed.actions        ?? [],
    } satisfies ConsensusResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Consensus failed";
    console.error("[youtube/consensus]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
