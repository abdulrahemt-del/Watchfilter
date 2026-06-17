/**
 * Reddit Intelligence Skill — WatchFilter / StarIntel
 *
 * Self-contained. No internal imports — only "openai" is required from npm.
 * Copy-paste into any TypeScript project that has `openai` installed.
 *
 * Usage:
 *   import OpenAI from "openai";
 *   import { searchReddit, extractRedditClaims } from "./redditSkill";
 *
 *   const openai = new OpenAI({ apiKey: "..." });
 *   const posts   = await searchReddit("AI customer acquisition");
 *   const claims  = await extractRedditClaims(posts, "customer acquisition", openai);
 */

import OpenAI from "openai";

// ── Public types ──────────────────────────────────────────────────────────────

export type RedditComment = {
  text: string;
  score: number;
  author: string;
};

export type RedditPost = {
  id: string;
  subreddit: string;
  title: string;
  body: string;
  score: number;
  num_comments: number;
  created_at: string;
  url: string;
  top_comments: RedditComment[];
};

export type RedditClaim = {
  id: string;
  subreddit: string;
  post_score: number;
  text: string;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  claim_type: "pain_point" | "success" | "failure" | "opinion" | "statistic" | "recommendation";
  created_at: string;
  source_url: string;
  source_title: string;
};

export type RedditSearchOptions = {
  sort?: "relevance" | "hot" | "top" | "new";
  time?: "all" | "year" | "month" | "week";
  limit?: number;
  fetchComments?: boolean;
  commentLimit?: number;
  // Allowlist of subreddits — results from other subreddits are silently dropped.
  // Leave empty to accept all subreddits.
  allowedSubreddits?: string[];
};

// ── Default business-relevant subreddits ──────────────────────────────────────

export const BUSINESS_SUBREDDITS = new Set([
  "startups", "SaaS", "entrepreneur", "Entrepreneur",
  "marketing", "sales", "CustomerSuccess", "growmybusiness",
  "artificial", "MachineLearning", "ArtificialIntelligence",
  "ProductManagement", "smallbusiness", "businessintelligence",
  "ycombinator", "venturecapital", "indiehackers", "IndieHackers",
  "webdev", "technology", "programming", "software",
]);

// ── Internal raw API types ────────────────────────────────────────────────────

type RawChild<T> = { kind: string; data: T };
type RawListing<T> = { data: { children: Array<RawChild<T>> } };

type RawPost = {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  is_self: boolean;
};

type RawComment = {
  id: string;
  body: string;
  score: number;
  author: string;
  replies?: RawListing<RawComment> | "";
};

// ── Reddit API fetch helper ───────────────────────────────────────────────────

async function rfetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "WatchFilterIntelligence/1.0 (+automated-research)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Reddit ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Comment fetcher ───────────────────────────────────────────────────────────

async function fetchComments(permalink: string, limit: number): Promise<RedditComment[]> {
  try {
    const data = await rfetch<[RawListing<RawPost>, RawListing<RawComment>]>(
      `https://www.reddit.com${permalink}.json?limit=${limit}&depth=2&sort=top`
    );
    return (data[1]?.data?.children ?? [])
      .filter(c => c.data?.body && !["[deleted]", "[removed]"].includes(c.data.body))
      .slice(0, limit)
      .map(c => ({
        text: c.data.body.slice(0, 500),
        score: c.data.score,
        author: c.data.author,
      }));
  } catch {
    return [];
  }
}

// ── Main search function ──────────────────────────────────────────────────────

export async function searchReddit(
  query: string,
  options: RedditSearchOptions = {},
): Promise<RedditPost[]> {
  const {
    sort = "relevance",
    time = "year",
    limit = 25,
    fetchComments: doFetchComments = true,
    commentLimit = 8,
    allowedSubreddits = [...BUSINESS_SUBREDDITS],
  } = options;

  const allowSet = new Set(allowedSubreddits.map(s => s.toLowerCase()));
  const q = encodeURIComponent(query);
  const url = `https://www.reddit.com/search.json?q=${q}&sort=${sort}&t=${time}&limit=${limit}&type=link`;

  let rawPosts: RawPost[] = [];
  try {
    const data = await rfetch<RawListing<RawPost>>(url);
    rawPosts = (data.data?.children ?? [])
      .map(c => c.data)
      .filter(p =>
        p.selftext !== "[deleted]" &&
        p.selftext !== "[removed]" &&
        (allowSet.size === 0 || allowSet.has(p.subreddit.toLowerCase()))
      );
  } catch (err) {
    console.warn("[redditSkill] search failed:", err);
    return [];
  }

  // Fetch comments for top 5 posts concurrently; rest get no comments
  const top = rawPosts.slice(0, 5);
  const rest = rawPosts.slice(5);

  const commentResults = doFetchComments
    ? await Promise.allSettled(top.map(p => fetchComments(p.permalink, commentLimit)))
    : top.map((): PromiseFulfilledResult<RedditComment[]> => ({ status: "fulfilled", value: [] }));

  const topPosts: RedditPost[] = top.map((p, i) => ({
    id: p.id,
    subreddit: p.subreddit,
    title: p.title,
    body: p.selftext.slice(0, 2000),
    score: p.score,
    num_comments: p.num_comments,
    created_at: new Date(p.created_utc * 1000).toISOString(),
    url: `https://reddit.com${p.permalink}`,
    top_comments: commentResults[i].status === "fulfilled" ? commentResults[i].value : [],
  }));

  const restPosts: RedditPost[] = rest.map(p => ({
    id: p.id,
    subreddit: p.subreddit,
    title: p.title,
    body: p.selftext.slice(0, 800),
    score: p.score,
    num_comments: p.num_comments,
    created_at: new Date(p.created_utc * 1000).toISOString(),
    url: `https://reddit.com${p.permalink}`,
    top_comments: [],
  }));

  return [...topPosts, ...restPosts];
}

// ── Claim extraction ──────────────────────────────────────────────────────────

export async function extractRedditClaims(
  posts: RedditPost[],
  topic: string,
  openai: OpenAI,
  model = "gpt-4o-mini",
): Promise<RedditClaim[]> {
  if (posts.length === 0) return [];

  const evidenceBlock = posts.map((p, i) => {
    const lines = [
      `[R${i + 1}] r/${p.subreddit} | Score: ${p.score} | ${p.created_at.slice(0, 10)}`,
      `Title: "${p.title}"`,
    ];
    if (p.body.trim()) lines.push(`Body: ${p.body.slice(0, 600)}`);
    if (p.top_comments.length > 0) {
      lines.push(`Top comments:`);
      p.top_comments.slice(0, 5).forEach(c =>
        lines.push(`  [+${c.score}] ${c.text.slice(0, 200)}`)
      );
    }
    lines.push(`URL: ${p.url}`);
    return lines.join("\n");
  }).join("\n\n---\n\n");

  const res = await openai.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a Reddit Intelligence Extractor. Extract concrete, actionable claims from Reddit discussions.

Focus on:
- Pain points practitioners describe (with specifics)
- Verified success stories (actual results, not aspirational)
- Failure reports with identifiable root causes
- High-upvote opinions (proxy for community consensus)
- Benchmarks or statistics mentioned
- Practical recommendations from experience

RULES:
- Only extract what is directly stated or clearly implied — no inference beyond the text
- Prioritize posts and comments with higher scores (more upvoted = more community-validated)
- Source reference must match the [R#] index from evidence
- Extract at most 20 claims total, prioritize specificity and uniqueness
- Exclude vague generalities ("hard work pays off")

Return JSON:
{
  "claims": [
    {
      "source_ref": "R1",
      "text": "normalized claim — one specific assertion, max 150 chars",
      "sentiment": "positive|negative|neutral|mixed",
      "claim_type": "pain_point|success|failure|opinion|statistic|recommendation"
    }
  ]
}`,
      },
      { role: "user", content: `Topic: ${topic}\n\nReddit Evidence:\n\n${evidenceBlock}` },
    ],
  });

  type RawExtracted = { source_ref?: string; text?: string; sentiment?: string; claim_type?: string };
  let raw: RawExtracted[] = [];
  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { claims?: unknown };
    raw = Array.isArray(parsed.claims) ? (parsed.claims as RawExtracted[]) : [];
  } catch { return []; }

  const VALID_SENTIMENT = new Set(["positive", "negative", "neutral", "mixed"]);
  const VALID_TYPE = new Set(["pain_point", "success", "failure", "opinion", "statistic", "recommendation"]);

  return raw
    .filter(c => c.text && c.source_ref)
    .map((c, i): RedditClaim => {
      const refIdx = parseInt((c.source_ref ?? "R1").replace(/[^0-9]/g, "")) - 1;
      const post = posts[Math.max(0, Math.min(refIdx, posts.length - 1))];
      return {
        id: `reddit_${Date.now()}_${i}`,
        subreddit: post?.subreddit ?? "unknown",
        post_score: post?.score ?? 0,
        text: c.text!,
        sentiment: VALID_SENTIMENT.has(c.sentiment ?? "") ? c.sentiment as RedditClaim["sentiment"] : "neutral",
        claim_type: VALID_TYPE.has(c.claim_type ?? "") ? c.claim_type as RedditClaim["claim_type"] : "opinion",
        created_at: post?.created_at ?? new Date().toISOString(),
        source_url: post?.url ?? "",
        source_title: post?.title ?? "",
      };
    });
}
