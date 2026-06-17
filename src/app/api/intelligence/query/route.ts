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

export type SourceCitation = {
  text: string;
  source_type: "youtube" | "reddit" | "web";
  source_label: string;
  url?: string;
  timestamp?: string;
  score?: number;
};

export type IntelligenceMemo = {
  query: string;
  generated_at: string;
  executive_summary: string;
  confidence_score: number;
  consensus: {
    overall_score: number;
    main_finding: string;
    agreement_areas: string[];
    disagreement_areas: string[];
  };
  creator_perspective: {
    count: number;
    key_claims: SourceCitation[];
  };
  reddit_perspective: {
    count: number;
    subreddits: string[];
    pain_points: SourceCitation[];
    success_stories: SourceCitation[];
    key_opinions: SourceCitation[];
  };
  web_perspective: {
    count: number;
    key_claims: SourceCitation[];
    statistics: SourceCitation[];
  };
  contradictions: Array<{
    topic: string;
    claim_a: SourceCitation;
    claim_b: SourceCitation;
    description: string;
  }>;
  actionable_insights: string[];
  evidence_count: {
    youtube: number;
    reddit: number;
    web: number;
  };
};

// ── Keyword extractor ────────────────────────────────────────────────────────

const STOP = new Set(["that","this","with","from","what","about","have","which","been","were","they","their","there","when","then","than","also","into","through","during","before","after","above","below","more","most","some","such","like","just","over","very","will","would","could","should","does","make","made","take","know","look","come","year","time","want","need","good","best","work","used","for","the","and","are","but","not","you","all","can","her","was","one","our","out","day","get","has","him","his","how","its","let","man","new","now","old","see","two","way","who","boy","did","its","let","put","say","she","too","use","how","why","your","their","they","have","this","that","with","from","what"]);

function extractKeywords(q: string): string[] {
  return [...new Set(
    q.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w))
  )].slice(0, 8);
}

// ── Evidence formatters ───────────────────────────────────────────────────────

function formatYTEvidence(rows: DeepResearchRow[]): string {
  return rows.slice(0, 40).map((r, i) => {
    const lines = [`[Y${i + 1}] Creator: ${r.channel_name}`];
    if (r.video_title) lines.push(`Video: ${r.video_title}`);
    if (r.category) lines.push(`Topic: ${r.category}`);
    if (r.upload_date) lines.push(`Date: ${String(r.upload_date).slice(0, 10)}`);
    lines.push(`Quote: "${String(r.quote).slice(0, 250)}"`);
    if (r.insight) lines.push(`Insight: ${String(r.insight).slice(0, 120)}`);
    return lines.join("\n");
  }).join("\n\n---\n\n");
}

function formatRedditEvidence(claims: RedditClaim[]): string {
  return claims.map((c, i) =>
    `[R${i + 1}] r/${c.subreddit} | Score: ${c.post_score} | ${c.claim_type.toUpperCase()}\n"${c.text}"\nSource: ${c.source_title.slice(0, 80)}`
  ).join("\n\n");
}

function formatWebEvidence(articles: IntelligenceArticle[]): string {
  return articles.map((a, i) =>
    `[W${i + 1}] ${a.domain} | "${a.title}"\n${a.content.slice(0, 400)}\nURL: ${a.url}`
  ).join("\n\n---\n\n");
}

// ── Web claim extraction ──────────────────────────────────────────────────────

async function extractWebClaims(articles: IntelligenceArticle[], topic: string): Promise<SourceCitation[]> {
  if (!articles.length) return [];

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract concrete claims from web articles. Focus on statistics, trends, and expert assertions. Reference source by [W#] index. Max 15 claims. Return JSON: { "claims": [{ "source_ref": "W1", "text": "...", "is_statistic": true/false }] }`,
      },
      { role: "user", content: `Topic: ${topic}\n\n${formatWebEvidence(articles)}` },
    ],
  });

  type RawWebClaim = { source_ref?: string; text?: string; is_statistic?: boolean };
  let raw: RawWebClaim[] = [];
  try {
    const p = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { claims?: unknown };
    raw = Array.isArray(p.claims) ? p.claims as RawWebClaim[] : [];
  } catch { return []; }

  return raw.filter(c => c.text && c.source_ref).map(c => {
    const idx = parseInt((c.source_ref ?? "W1").replace(/[^0-9]/g, "")) - 1;
    const article = articles[Math.max(0, Math.min(idx, articles.length - 1))];
    return {
      text: c.text!,
      source_type: "web" as const,
      source_label: article?.domain ?? "web",
      url: article?.url,
    };
  });
}

// ── Synthesizer ───────────────────────────────────────────────────────────────

async function synthesize(
  query: string,
  ytRows: DeepResearchRow[],
  redditClaims: RedditClaim[],
  articles: IntelligenceArticle[],
  webCitations: SourceCitation[],
): Promise<IntelligenceMemo> {
  const ytBlock  = ytRows.length    ? formatYTEvidence(ytRows) : "No YouTube creator evidence found.";
  const redBlock = redditClaims.length ? formatRedditEvidence(redditClaims) : "No Reddit evidence found.";
  const webBlock = articles.length  ? formatWebEvidence(articles) : "No web article evidence found.";

  const ytCitations: SourceCitation[] = ytRows.slice(0, 20).map(r => ({
    text: r.insight ?? r.quote ?? "",
    source_type: "youtube",
    source_label: r.channel_name ?? "Creator",
    timestamp: r.timestamp_str ?? undefined,
  }));

  const redditCitations: SourceCitation[] = redditClaims.slice(0, 20).map(c => ({
    text: c.text,
    source_type: "reddit",
    source_label: `r/${c.subreddit}`,
    url: c.source_url,
    score: c.post_score,
  }));

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the WatchFilter Decision Intelligence Synthesizer.

Your job: synthesize evidence from creators, Reddit practitioners, and web articles into decision intelligence.

CRITICAL RULES:
- This is NOT summarization. Produce DECISION INTELLIGENCE.
- Every claim must be traceable to evidence. No fabrication.
- Contradictions must be real — opposing specific claims, not invented tension.
- confidence_score: 0–100 based on evidence breadth and consistency.
- consensus.overall_score: % of sources that broadly agree on the main finding.
- Use [Y#], [R#], [W#] references from evidence in your analysis but do NOT include them in output text.
- Prioritize practitioner evidence (Reddit) over theoretical claims.
- Flag if only one source type has evidence (lower confidence).

Output JSON matching this exact structure:
{
  "executive_summary": "2-3 sentence decision-oriented synthesis. Answer the question. State what the evidence says, what it agrees on, where it diverges.",
  "confidence_score": 0-100,
  "consensus": {
    "overall_score": 0-100,
    "main_finding": "One sentence: what do all sources primarily agree on?",
    "agreement_areas": ["area 1", "area 2"],
    "disagreement_areas": ["area 1"]
  },
  "creator_perspective": {
    "count": ${ytRows.length},
    "key_claims": [
      { "text": "...", "source_label": "Creator Name", "timestamp": "optional" }
    ]
  },
  "reddit_perspective": {
    "count": ${redditClaims.length},
    "subreddits": ["r/startups"],
    "pain_points": [
      { "text": "...", "source_label": "r/subreddit", "score": 0 }
    ],
    "success_stories": [
      { "text": "...", "source_label": "r/subreddit", "score": 0 }
    ],
    "key_opinions": [
      { "text": "...", "source_label": "r/subreddit", "score": 0 }
    ]
  },
  "web_perspective": {
    "count": ${articles.length},
    "key_claims": [
      { "text": "...", "source_label": "domain.com", "url": "https://..." }
    ],
    "statistics": [
      { "text": "...", "source_label": "domain.com", "url": "https://..." }
    ]
  },
  "contradictions": [
    {
      "topic": "topic of disagreement",
      "claim_a": { "text": "...", "source_label": "...", "source_type": "youtube|reddit|web" },
      "claim_b": { "text": "...", "source_label": "...", "source_type": "youtube|reddit|web" },
      "description": "Why these contradict and what the tension means for decision-making."
    }
  ],
  "actionable_insights": [
    "Specific, decision-relevant insight 1",
    "Specific, decision-relevant insight 2"
  ]
}

IMPORTANT: In all "source_type" fields use exactly "youtube", "reddit", or "web".
Limit: max 6 key_claims per perspective, max 4 pain_points, max 3 success_stories, max 3 contradictions, max 5 insights.`,
      },
      {
        role: "user",
        content: [
          `Query: "${query}"`,
          ``,
          `=== CREATOR EVIDENCE (YouTube) ===`,
          ytBlock,
          ``,
          `=== REDDIT PRACTITIONER EVIDENCE ===`,
          redBlock,
          ``,
          `=== WEB ARTICLE EVIDENCE ===`,
          webBlock,
        ].join("\n"),
      },
    ],
  });

  type RawMemo = Omit<IntelligenceMemo, "query" | "generated_at" | "evidence_count">;

  let raw: Partial<RawMemo> = {};
  try {
    raw = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<RawMemo>;
  } catch { /* return defaults below */ }

  // Inject source_type fields that LLM might have omitted
  const injectType = (items: Partial<SourceCitation>[], type: SourceCitation["source_type"]): SourceCitation[] =>
    (items ?? []).map(c => ({ ...c, source_type: (c.source_type ?? type), text: c.text ?? "" } as SourceCitation));

  const cp = raw.creator_perspective ?? { count: ytRows.length, key_claims: [] };
  const rp = raw.reddit_perspective ?? { count: redditClaims.length, subreddits: [], pain_points: [], success_stories: [], key_opinions: [] };
  const wp = raw.web_perspective ?? { count: articles.length, key_claims: [], statistics: [] };

  return {
    query,
    generated_at: new Date().toISOString(),
    executive_summary: raw.executive_summary ?? "Insufficient evidence to synthesize an answer.",
    confidence_score: Math.max(0, Math.min(100, raw.confidence_score ?? 50)),
    consensus: raw.consensus ?? { overall_score: 50, main_finding: "", agreement_areas: [], disagreement_areas: [] },
    creator_perspective: {
      count: cp.count ?? ytRows.length,
      key_claims: injectType(cp.key_claims ?? [], "youtube"),
    },
    reddit_perspective: {
      count: rp.count ?? redditClaims.length,
      subreddits: rp.subreddits ?? [],
      pain_points: injectType(rp.pain_points ?? [], "reddit"),
      success_stories: injectType(rp.success_stories ?? [], "reddit"),
      key_opinions: injectType(rp.key_opinions ?? [], "reddit"),
    },
    web_perspective: {
      count: wp.count ?? articles.length,
      key_claims: injectType(wp.key_claims ?? [], "web"),
      statistics: injectType(wp.statistics ?? [], "web"),
    },
    contradictions: (raw.contradictions ?? []).map(c => ({
      topic: c.topic ?? "",
      claim_a: { ...c.claim_a, source_type: c.claim_a?.source_type ?? "youtube", text: c.claim_a?.text ?? "" } as SourceCitation,
      claim_b: { ...c.claim_b, source_type: c.claim_b?.source_type ?? "reddit", text: c.claim_b?.text ?? "" } as SourceCitation,
      description: c.description ?? "",
    })),
    actionable_insights: raw.actionable_insights ?? [],
    evidence_count: {
      youtube: ytRows.length,
      reddit: redditClaims.length,
      web: articles.length,
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

  const stream = new ReadableStream<Uint8Array>({
    start(c) { ctrl = c; },
  });

  function emit(payload: SSEPayload) {
    ctrl.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
  }

  function close() { ctrl.close(); }

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

      // ── Stage 1: YouTube library ────────────────────────────────────────────
      emit({ type: "stage", source: "youtube", message: "Searching creator library…" });
      const ytRows = await getDeepResearchEvidence(keywords, 50);
      emit({ type: "stage", source: "youtube", message: `Found ${ytRows.length} creator evidence points`, count: ytRows.length });

      // ── Stage 2: Reddit ─────────────────────────────────────────────────────
      emit({ type: "stage", source: "reddit", message: "Searching Reddit discussions…" });
      let redditClaims: RedditClaim[] = [];
      try {
        const posts = await searchReddit(query, { limit: 20, fetchComments: true, commentLimit: 6 });
        emit({ type: "stage", source: "reddit", message: `Found ${posts.length} Reddit posts — extracting claims…` });
        redditClaims = await extractRedditClaims(posts, query, openai);
        emit({ type: "stage", source: "reddit", message: `Extracted ${redditClaims.length} Reddit claims`, count: redditClaims.length });
      } catch (err) {
        emit({ type: "stage", source: "reddit", message: `Reddit search failed: ${err instanceof Error ? err.message : "unknown error"}` });
      }

      // ── Stage 3: Web articles (Tavily) ──────────────────────────────────────
      emit({ type: "stage", source: "web", message: "Searching web articles…" });
      let articles: IntelligenceArticle[] = [];
      let webCitations: SourceCitation[] = [];
      try {
        articles = await intelligenceWebSearch(query, 8);
        emit({ type: "stage", source: "web", message: `Found ${articles.length} articles — extracting claims…` });
        webCitations = await extractWebClaims(articles, query);
        emit({ type: "stage", source: "web", message: `Extracted ${webCitations.length} web claims`, count: webCitations.length });
      } catch (err) {
        emit({ type: "stage", source: "web", message: `Web search failed: ${err instanceof Error ? err.message : "unknown error"}` });
      }

      // ── Stage 4: Synthesis ──────────────────────────────────────────────────
      const totalEvidence = ytRows.length + redditClaims.length + articles.length;
      if (totalEvidence === 0) {
        emit({ type: "error", message: "No evidence found across any source. Try a more specific query." });
        close();
        return;
      }

      emit({ type: "stage", agent: "Synthesizer", message: `Synthesizing ${totalEvidence} evidence points into decision intelligence…` });
      const memo = await synthesize(query, ytRows, redditClaims, articles, webCitations);
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
