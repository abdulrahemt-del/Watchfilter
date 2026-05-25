import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

const CONSENSUS_SYSTEM_PROMPT = `You are a private AI analyst preparing a daily executive intelligence briefing for a founder or investor. You synthesize YouTube creator consensus into actionable intelligence — not summaries, conclusions.

Given the top themes from today's creator content (with key insights), generate:

1. executiveBrief: 4–6 bullets (≤15 words each). These are the most important things the user needs to know TODAY. Start each with a concrete subject or action verb. Include a "no major risks" bullet if risks are absent. Cover opportunity, trend, and market signals.

2. themes[].consensus: ONE sentence stating WHAT creators collectively concluded — grounded in the actual insights provided. Reference creator count or specific evidence when available.
   BAD (reject these): "AI is growing." / "A structured approach improves outcomes." / "Planning helps success." / "AI may present opportunities."
   GOOD: "Three creators independently argue AI lead generation agencies require under $500 to launch and deliver recurring revenue from day one."
   GOOD: "Multiple creators emphasize cash-flow businesses are outperforming speculative growth plays in the current environment."
   If the input insights are thin, say what the creators SPECIFICALLY discussed — not a generic restatement of the topic name.

3. themes[].confidence: 0–100 based on creator count and insight consistency. 1 creator = 40–55, 2 = 58–70, 3 = 71–82, 4+ = 83–95.

4. themes[].trendDirection: "growing" | "stable" | "declining" based on creator activity volume and insight momentum.

5. themes[].opportunitySignal: "High" | "Medium" | "Low" — how actionable and time-sensitive this consensus is for a founder or operator.

6. themes[].opportunityTopics: array of 2–4 specific sub-topics or business opportunities emerging from this theme (e.g. "AI Agencies", "Personal Branding"). Short noun phrases only.

7. themes[].whyItMatters: ONE sentence explaining the concrete implication — why this consensus matters for a founder or investor RIGHT NOW. Start with a verb or outcome: "Reveals how...", "Shows why...", "Signals that...".

8. themes[].recommendedActions: Exactly 3 specific, verb-led action items a founder can take based on THIS theme. Be specific. (Bad: "Think about AI." Good: "Audit your lead generation pipeline for one task AI can automate this week.")

9. themes[].contrarianView: ONE sentence capturing any dissenting or nuanced counter-view if present in the data. Return "" if none.

10. topOpportunity.reason: 2 sentences. WHY it's an opportunity right now. Grounded in creator data. Not generic.

11. topRisk.reason: 2 sentences on the risk. Return null if none reached consensus.

12. actions: Exactly 3 specific, actionable tasks a founder or operator can do TODAY based on today's consensus. Start each with a verb. Be specific, not generic. (Bad: "Think about AI." Good: "Audit your lead generation pipeline for one task that AI can automate this week.")

Be direct. Assume the reader is a sophisticated operator with no time for vague advice.`;

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
        executiveBrief: [], themes: [], topOpportunity: null, topRisk: null, actions: [],
      } satisfies ConsensusResult);
    }

    const themeList = themes.slice(0, 6).map((t, i) =>
      `Theme ${i + 1}: ${JSON.stringify(t.topic)}\nCreators (${t.creators.length}): ${t.creators.slice(0, 4).map((c) => JSON.stringify(c)).join(", ")}\nVideos: ${t.count}\nKey insights:\n${
        t.insights.slice(0, 3).map((s) => `  - ${JSON.stringify(s)}`).join("\n") || "  - (no insights extracted)"
      }`
    ).join("\n\n");

    const oppSection = topOpportunity
      ? `\n\nTop Opportunity: ${JSON.stringify(topOpportunity.topic)}\nCreators: ${topOpportunity.creators.slice(0, 3).map((c) => JSON.stringify(c)).join(", ")}\nInsights:\n${
          topOpportunity.insights.slice(0, 3).map((s) => `  - ${JSON.stringify(s)}`).join("\n") || "  - (no insights)"
        }`
      : "\n\nTop Opportunity: none identified";

    const riskSection = topRisk
      ? `\n\nTop Risk: ${JSON.stringify(topRisk.topic)}\nCreators: ${topRisk.creators.slice(0, 3).map((c) => JSON.stringify(c)).join(", ")}\nInsights:\n${
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
            `Return JSON:\n` +
            `{"executiveBrief":["...","...","...","...","..."],` +
            `"themes":[{"topic":"...","consensus":"...","confidence":82,"trendDirection":"growing","opportunitySignal":"High",` +
            `"opportunityTopics":["AI Agencies","Personal Branding"],"whyItMatters":"Signals that...","recommendedActions":["Audit...","Build...","Test..."],"contrarianView":""}],` +
            `"topOpportunity":{"topic":"...","reason":"...","confidence":85},"topRisk":{"topic":"...","reason":"...","confidence":70},` +
            `"actions":["Audit your...","Review your...","Identify one..."]}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    const raw    = completion.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<ConsensusResult>;
    return NextResponse.json({
      executiveBrief: parsed.executiveBrief ?? [],
      themes:         parsed.themes         ?? [],
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
