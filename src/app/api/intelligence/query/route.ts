import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { getDeepResearchEvidence, type DeepResearchRow } from "@/lib/db";
import { searchReddit, extractRedditClaims, type RedditClaim } from "@/lib/redditSkill";
import { intelligenceWebSearch, type IntelligenceArticle } from "@/lib/webSearch";

export const runtime = "nodejs";
export const maxDuration = 120;

const openai = new OpenAI();

// ── Public types (consumed by IntelligenceView) ───────────────────────────────

export type IntelligenceMemo = {
  query: string;
  generated_at: string;
  decision_summary: string;
  confidence_score: number;
  consensus: {
    agreement_score: number;
    shared_insights: string[];
    disagreements: string[];
  };
  source_breakdown: {
    youtube: { count: number; key_signals: string[] };
    reddit:  { count: number; key_signals: string[] };
    web:     { count: number; key_signals: string[] };
  };
  contradictions: Array<{
    claim_a: string;
    claim_b: string;
    why_it_matters: string;
  }>;
  decision_recommendation: {
    stage_based_actions: {
      pre_product:  string[];
      early_stage:  string[];
      growth_stage: string[];
    };
    priority_actions: string[];
  };
  insight_clusters: Array<{
    theme: string;
    insights: string[];
  }>;
  evidence_count: {
    youtube: number;
    reddit:  number;
    web:     number;
  };
};

// ── Internal structured claim (synthesizer input) ─────────────────────────────

type StructuredClaim = {
  type: string;
  claim: string;
  evidence: string;
  confidence: number;
};

// ── Keyword extractor ─────────────────────────────────────────────────────────

const STOP = new Set(["that","this","with","from","what","about","have","which","been","were","they","their","there","when","then","than","also","into","through","during","before","after","above","below","more","most","some","such","like","just","over","very","will","would","could","should","does","make","made","take","know","look","come","year","time","want","need","good","best","work","used","for","the","and","are","but","not","you","all","can","her","was","one","our","out","day","get","has","him","his","how","its","let","man","new","now","old","see","two","way","who","boy","did","put","say","she","too","use","why","your","have","that"]);

function extractKeywords(q: string): string[] {
  return [...new Set(
    q.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w))
  )].slice(0, 8);
}

// ── Evidence → structured claim converters ────────────────────────────────────

function ytToStructuredClaims(rows: DeepResearchRow[]): StructuredClaim[] {
  return rows.slice(0, 40)
    .map(r => ({
      type: r.type ?? "opinion",
      claim: String(r.insight ?? r.quote ?? "").slice(0, 220),
      evidence: `Creator: ${r.channel_name}${r.video_title ? ` | "${String(r.video_title).slice(0, 80)}"` : ""} | "${String(r.quote ?? "").slice(0, 140)}"`,
      confidence: r.signal_strength === "HIGH" ? 0.9 : r.signal_strength === "MEDIUM" ? 0.65 : 0.4,
    }))
    .filter(c => c.claim.length > 10);
}

function redditToStructuredClaims(claims: RedditClaim[]): StructuredClaim[] {
  return claims.map(c => ({
    type: c.claim_type,
    claim: c.text,
    evidence: `r/${c.subreddit} | "${c.source_title.slice(0, 80)}" (upvotes: ${c.post_score})`,
    confidence: Math.min(0.95, 0.35 + Math.log1p(Math.max(0, c.post_score)) / 10),
  }));
}

function webToStructuredClaims(articles: IntelligenceArticle[]): StructuredClaim[] {
  return articles
    .filter(a => a.content.length > 80)
    .map(a => ({
      type: "statistic",
      claim: a.content.slice(0, 220),
      evidence: `${a.domain} | "${a.title}"${a.published_date ? ` | ${a.published_date.slice(0, 10)}` : ""}`,
      confidence: Math.min(0.9, a.relevance_score ?? 0.65),
    }));
}

// ── Synthesizer ───────────────────────────────────────────────────────────────

async function synthesize(
  query: string,
  ytRows: DeepResearchRow[],
  redditClaims: RedditClaim[],
  articles: IntelligenceArticle[],
): Promise<IntelligenceMemo> {
  const ytClaims     = ytToStructuredClaims(ytRows);
  const redditInput  = redditToStructuredClaims(redditClaims);
  const webInput     = webToStructuredClaims(articles);

  const inputPayload = JSON.stringify({
    query,
    youtube: ytClaims,
    reddit:  redditInput,
    web:     webInput,
  }, null, 0);

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are WatchFilter Intelligence Synthesizer.

You transform multi-source research data into structured decision intelligence for startups and builders.

You will receive structured inputs from up to 3 sources:
1. YouTube creators (behavioral + opinion signals)
2. Reddit (real user + founder experiences)
3. Web articles (general industry + statistical claims)

Your job is NOT to summarize. Your job is to generate decision-grade intelligence.

---

## CORE OBJECTIVE

Given a query, produce a structured IntelligenceMemo that answers:
→ What is true?
→ What is disputed?
→ What should the user do next?

You must prioritize:
- real-world experience (Reddit) — strongest for real-world constraints
- then creator insights (YouTube) — strongest for heuristics and tactics
- then web consensus — strongest for statistics

---

## RULES

### 1. No generic advice
Do NOT output vague statements like:
- "use AI tools" / "focus on marketing" / "analyze customers"

All outputs must be specific, actionable, and behavior-driven.

BAD: "Use referrals to grow"
GOOD: "Implement post-purchase referral email with 10–20% incentive and track CAC reduction per cohort"

### 2. Contradictions are REQUIRED
If sources disagree, explicitly list both sides and explain why the disagreement matters.
Never hide conflicts. Never manufacture fake tension.

### 3. Confidence scoring rules
confidence_score must reflect:
- agreement across sources (higher agreement → higher score)
- strength of individual evidence items
- diversity of sources (single-source → cap at 55)
Do NOT output arbitrary numbers.

### 4. Stage-aware reasoning
Always segment decision_recommendation into:
- pre_product (0–10 customers)
- early_stage (10–100 customers)
- growth_stage (100+ customers)

### 5. Insight clustering
Group insights into meaningful themes: acquisition channels, pricing, conversion, retention, positioning.
Do not mix unrelated ideas in one cluster.

### 6. No hallucination
Only use evidence explicitly provided in input data.
If missing data → state uncertainty in shared_insights / disagreements fields.
Do not invent evidence.

---

## REQUIRED OUTPUT FORMAT (STRICT JSON)

Return ONLY valid JSON matching this exact structure:

{
  "decision_summary": "2-3 sentences. Answer the query directly. What is true, what is disputed, what matters most for decision-making.",
  "confidence_score": 0-100,

  "consensus": {
    "agreement_score": 0-100,
    "shared_insights": ["specific finding all/most sources agree on", "..."],
    "disagreements": ["specific claim source A makes that source B disputes", "..."]
  },

  "source_breakdown": {
    "youtube": { "count": 0, "key_signals": ["signal 1", "signal 2", "signal 3"] },
    "reddit":  { "count": 0, "key_signals": ["signal 1", "signal 2", "signal 3"] },
    "web":     { "count": 0, "key_signals": ["signal 1", "signal 2", "signal 3"] }
  },

  "contradictions": [
    {
      "claim_a": "specific claim from one source",
      "claim_b": "specific opposing claim from another source",
      "why_it_matters": "Why this disagreement matters for the decision at hand."
    }
  ],

  "decision_recommendation": {
    "stage_based_actions": {
      "pre_product":  ["specific action 1", "specific action 2"],
      "early_stage":  ["specific action 1", "specific action 2"],
      "growth_stage": ["specific action 1", "specific action 2"]
    },
    "priority_actions": ["#1 highest-leverage action", "#2", "#3"]
  },

  "insight_clusters": [
    {
      "theme": "Acquisition Channels",
      "insights": ["specific insight 1", "specific insight 2"]
    }
  ]
}

Limits: key_signals max 4 per source, shared_insights max 4, disagreements max 3, contradictions max 3, insight_clusters max 5 with max 4 insights each, stage actions max 3 each, priority_actions max 5.`,
      },
      { role: "user", content: inputPayload },
    ],
  });

  type RawMemo = Omit<IntelligenceMemo, "query" | "generated_at" | "evidence_count">;
  let raw: Partial<RawMemo> = {};
  try {
    raw = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<RawMemo>;
  } catch { /* fall through to defaults */ }

  const sb = raw.source_breakdown;
  const dr = raw.decision_recommendation;

  return {
    query,
    generated_at: new Date().toISOString(),
    decision_summary: raw.decision_summary ?? "Insufficient evidence to synthesize an answer.",
    confidence_score: Math.max(0, Math.min(100, raw.confidence_score ?? 50)),
    consensus: {
      agreement_score: Math.max(0, Math.min(100, raw.consensus?.agreement_score ?? 50)),
      shared_insights: raw.consensus?.shared_insights ?? [],
      disagreements: raw.consensus?.disagreements ?? [],
    },
    source_breakdown: {
      youtube: { count: ytRows.length,     key_signals: sb?.youtube?.key_signals ?? [] },
      reddit:  { count: redditClaims.length, key_signals: sb?.reddit?.key_signals ?? [] },
      web:     { count: articles.length,   key_signals: sb?.web?.key_signals ?? [] },
    },
    contradictions: (raw.contradictions ?? []).map(c => ({
      claim_a: c.claim_a ?? "",
      claim_b: c.claim_b ?? "",
      why_it_matters: c.why_it_matters ?? "",
    })),
    decision_recommendation: {
      stage_based_actions: {
        pre_product:  dr?.stage_based_actions?.pre_product ?? [],
        early_stage:  dr?.stage_based_actions?.early_stage ?? [],
        growth_stage: dr?.stage_based_actions?.growth_stage ?? [],
      },
      priority_actions: dr?.priority_actions ?? [],
    },
    insight_clusters: (raw.insight_clusters ?? []).map(c => ({
      theme: c.theme ?? "",
      insights: c.insights ?? [],
    })),
    evidence_count: {
      youtube: ytRows.length,
      reddit:  redditClaims.length,
      web:     articles.length,
    },
  };
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

type SSEPayload =
  | { type: "stage"; source?: string; agent?: string; message: string; count?: number }
  | { type: "complete"; memo: IntelligenceMemo }
  | { type: "error"; message: string };

function makeStream() {
  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } });
  const emit = (payload: SSEPayload) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
  const close = () => ctrl.close();
  return { stream, emit, close };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  let query = "";
  try {
    const body = await req.json() as { query?: string };
    query = (body.query ?? "").trim();
  } catch { /* ignore */ }

  if (!query) return new Response(JSON.stringify({ error: "query required" }), { status: 400 });

  const { stream, emit, close } = makeStream();

  void (async () => {
    try {
      const keywords = extractKeywords(query);

      // Stage 1: YouTube library
      emit({ type: "stage", source: "youtube", message: "Searching creator library…" });
      const ytRows = await getDeepResearchEvidence(keywords, 50);
      emit({ type: "stage", source: "youtube", message: `Found ${ytRows.length} creator evidence points`, count: ytRows.length });

      // Stage 2: Reddit
      emit({ type: "stage", source: "reddit", message: "Searching Reddit discussions…" });
      let redditClaims: RedditClaim[] = [];
      try {
        const posts = await searchReddit(query, { limit: 20, fetchComments: true, commentLimit: 6 });
        emit({ type: "stage", source: "reddit", message: `Found ${posts.length} Reddit posts — extracting claims…` });
        redditClaims = await extractRedditClaims(posts, query, openai);
        emit({ type: "stage", source: "reddit", message: `Extracted ${redditClaims.length} Reddit claims`, count: redditClaims.length });
      } catch (err) {
        emit({ type: "stage", source: "reddit", message: `Reddit unavailable: ${err instanceof Error ? err.message : "error"}` });
      }

      // Stage 3: Web (Tavily)
      emit({ type: "stage", source: "web", message: "Searching web articles…" });
      let articles: IntelligenceArticle[] = [];
      try {
        articles = await intelligenceWebSearch(query, 8);
        emit({ type: "stage", source: "web", message: `Retrieved ${articles.length} articles`, count: articles.length });
      } catch (err) {
        emit({ type: "stage", source: "web", message: `Web search unavailable: ${err instanceof Error ? err.message : "error"}` });
      }

      const totalEvidence = ytRows.length + redditClaims.length + articles.length;
      if (totalEvidence === 0) {
        emit({ type: "error", message: "No evidence found. Try a more specific query or analyze relevant videos first." });
        close();
        return;
      }

      // Stage 4: Synthesis
      emit({ type: "stage", agent: "Synthesizer", message: `Synthesizing ${totalEvidence} evidence points into decision intelligence…` });
      const memo = await synthesize(query, ytRows, redditClaims, articles);
      emit({ type: "complete", memo });

    } catch (err) {
      emit({ type: "error", message: err instanceof Error ? err.message : "Pipeline failed" });
    } finally {
      close();
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
