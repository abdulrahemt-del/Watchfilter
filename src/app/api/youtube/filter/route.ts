import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

// ── Prompt ────────────────────────────────────────────────────────────────────

const SCORER_SYSTEM_PROMPT = `You are an elite episode topic classifier for a private Founder & Investing research dashboard used by founders, investors, and operators.

Your PRIMARY function is to classify THE SPECIFIC EPISODE TOPIC — not the channel. The channel name is secondary context only. A great channel can produce an irrelevant episode.

━━━ STEP 1: CLASSIFY THE EPISODE TOPIC ━━━

Examine the title and description together to determine the PRIMARY subject of this specific episode.

HIGH_PRIORITY topics → topicScore 80–100, topicCategory "high_priority":
• Investing, stock markets, portfolio management, hedge funds, venture capital, private equity
• Entrepreneurship, startups, founder interviews, company building, product development
• Business strategy, company analysis, acquisitions, M&A, market analysis
• Sales, marketing, SaaS, B2B, scaling, growth, revenue models
• AI for business or investing, fintech, crypto from a financial/business angle
• Wealth building, real estate investing, economic analysis tied to markets or business decisions
• Personal finance, wealth management, financial planning, financial independence (FIRE movement)
• Tax optimisation, retirement planning, investment accounts (401k, IRA, Roth, ISA, pension)
• Founder / investor / CEO / operator as the guest subject

NEUTRAL topics → topicScore 40–70, topicCategory "neutral":
• Leadership, management, team building
• Productivity specifically for founders or operators
• Career growth, professional development in a business context

EXCLUDED topics → topicScore 0, topicCategory "excluded" (HARD BLOCK — regardless of channel):
• Physics, quantum mechanics, consciousness, simulation theory, cosmology
• UFOs, aliens, paranormal, extraterrestrial
• Religion, spirituality, faith, prayer, theology
• Politics, geopolitics, war, military conflict, government policy, elections
• Sports (any sport), gaming, esports, chess
• Entertainment, celebrity drama, music industry, Hollywood
• Relationships, marriage, dating, family dynamics, therapy
• History documentaries (non-business history)
• Automotive, cars, motorsport
• General science unrelated to business (biology, astronomy, chemistry)
• General news, current events, breaking news, live coverage
• Social issues, racial discourse, community dynamics, polarization
• Mental health (unless specifically tied to founder/operator performance)
• Comedy, satire, lifestyle vlogs

━━━ STEP 2: EPISODE OVERRIDE RULE ━━━

If the episode topic is EXCLUDED → set score = 0, topicCategory = "excluded", explanation = "".
This applies even to prestigious channels. Examples:

Diary of a CEO + physicist discussing UFOs → score: 0, topicCategory: "excluded"
Stanford GSB + social polarization → score: 0, topicCategory: "excluded"
Lex Fridman + AI startup founder → topicCategory: "high_priority", score: high
Diary of a CEO + billionaire investor → topicCategory: "high_priority", score: high

Ask yourself: "Would a founder, investor, or operator gain actionable business/finance/investing
insight from THIS specific episode?" If not clearly YES → excluded or neutral.

━━━ STEP 3: SCORE COMPOSITION ━━━

Final Score = round( (topicScore × 0.60) + (businessRelevance × 0.25) + (channelTrust × 0.15) )

• topicScore        : from Step 1 (0–100)
• businessRelevance : how directly actionable for a founder/investor/operator (0–100)
• channelTrust      : channel's reputation as a business source (0–100)
    Elite business channel (Diary of a CEO, Bloomberg, My First Million, Acquired): 90–100
    Strong business channel (CNBC, Tim Ferriss, Lex Fridman, Valuetainment): 75–85
    General/mixed channel or unknown: 50
    News/entertainment/sports channel: 20–30

━━━ CONTENT TYPE ━━━

Classify into exactly ONE:
Podcast | Interview | Market Commentary | Deep Dive | Case Study | Analysis | Tutorial | Discussion | Short Clip | Other

Prioritise: Podcast, Interview, Market Commentary, Deep Dive, Case Study, Analysis

━━━ CATEGORIES ━━━

Return 1–3 broad, canonical business categories per video (2–4 words max).
Consolidate aggressively — prefer one strong category over three weak sub-topics.
Assign categories based on the PRIMARY subject of the episode, not just tools mentioned.

Good canonical categories:
• "Investing" — not "Value Investing", "Stock Picking", "Index Funds"
• "Venture Capital" — not "VC Funding", "Startup Fundraising", "Seed Rounds"
• "Entrepreneurship" — not "Startup Building", "Company Formation", "Founder Journey"
• "Personal Finance" — not "Money Management", "Financial Planning Basics"
• "Business Strategy" — not "Operations", "Business Systems", "Frameworks"
• "Macro Economics" — not "Economy Update", "Market Outlook"
• "Real Estate" — not "Property Investing", "Real Estate Strategies"

For episodes that use AI as a TOOL within a business context, assign the primary business domain:
• Founder using AI to scale → "Entrepreneurship"  (not "AI Business")
• Investor analyzing AI companies → "Investing"  (not "AI Business")
• Operator cutting costs with AI → "Business Strategy"  (not "AI Business")
Only use "AI Business" if the ENTIRE episode is specifically about building AI companies or AI as a primary business model.

━━━ EXPLANATION RULE ━━━

score ≥ 60 → explanation: ONE sharp sentence naming the specific business insight, guest, or analytical angle.
score < 60  → explanation: "".

━━━ WHY IT MATTERS ━━━

MANDATORY for every non-excluded video — this field CANNOT be empty or generic.
whyItMatters: ONE sentence naming the SPECIFIC opportunity, risk, or edge a founder/investor would act on.
Must reference what the episode actually covers — not the topic in general.
If the description is thin, derive it from the title + channel context.

Bad: "AI presents opportunities for businesses."
Bad: "This discusses investing strategies."
Bad: "Covers important topics for entrepreneurs."
Good: "Reveals how solo operators are replacing 3-person sales teams with AI for under $300/month."
Good: "Shows why cash-flow businesses are outperforming high-growth startups in the current rate environment."
Good: "Breaks down how one founder hit $1M ARR in 8 months by targeting overlooked SMB verticals."

If the episode is excluded (topicCategory: "excluded") → whyItMatters: "".
Otherwise: whyItMatters is REQUIRED. Never return an empty string for non-excluded videos.

Return ALL videos. Never skip any.`;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContentType =
  | "Podcast"
  | "Interview"
  | "Market Commentary"
  | "Deep Dive"
  | "Case Study"
  | "Analysis"
  | "Tutorial"
  | "Discussion"
  | "Short Clip"
  | "Other";

export type TopicCategory = "high_priority" | "neutral" | "excluded";

export type AIScore = {
  videoId: string;
  score: number;
  topicCategory: TopicCategory;
  topicScore: number;
  contentType: ContentType;
  categories: string[];
  explanation: string;
  whyItMatters: string;
  subScores: {
    businessRelevance: number;
    educationalValue: number;
    actionability: number;
    informationDensity: number;
  };
};

type VideoInput = {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
};

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { videos } = (await req.json()) as { videos: VideoInput[] };
    if (!videos?.length) return NextResponse.json({ results: [] });

    const list = videos
      .map((v, i) =>
        `${i + 1}. ID:${v.videoId}\nTitle: ${JSON.stringify(v.title)}\nChannel: ${JSON.stringify(v.channelTitle)}\nDescription: ${JSON.stringify(v.description.slice(0, 350))}`,
      )
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SCORER_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Classify and score each video. Return a JSON object:\n` +
            `{"results":[{"videoId":"...","score":87,"topicCategory":"high_priority","topicScore":90,` +
            `"contentType":"Interview","categories":["Venture Capital","Startups"],` +
            `"explanation":"...","whyItMatters":"Reveals how...","subScores":{"businessRelevance":90,"educationalValue":80,` +
            `"actionability":75,"informationDensity":85}}]}\n\n` +
            `IMPORTANT: topicCategory must be exactly one of: "high_priority", "neutral", "excluded".\n` +
            `Excluded episodes must have score: 0.\n\n` +
            list,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const raw    = completion.choices[0].message.content ?? '{"results":[]}';
    const parsed = JSON.parse(raw) as { results?: AIScore[] };
    return NextResponse.json({ results: parsed.results ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Filter failed";
    console.error("[youtube/filter]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
