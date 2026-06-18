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
  evidence: string;
  source_type: "comment" | "post";
  support_count: number;
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
  // How many posts (ranked by position) get comment threads fetched. Default 5.
  commentedPostsLimit?: number;
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

// ── OAuth token cache ─────────────────────────────────────────────────────────

const USER_AGENT = "WatchFilter/1.0 (startup intelligence platform)";

let _tokenCache: { value: string; expiresAt: number } | null = null;

async function getRedditToken(): Promise<string | null> {
  const clientId     = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (_tokenCache && Date.now() < _tokenCache.expiresAt) return _tokenCache.value;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    console.error(`[redditSkill] OAuth token fetch failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  _tokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  console.log("[redditSkill] OAuth token acquired, expires in", data.expires_in, "s");
  return _tokenCache.value;
}

// ── Reddit API fetch helper ───────────────────────────────────────────────────

async function rfetch<T>(url: string): Promise<T> {
  const token = await getRedditToken();

  // Use oauth.reddit.com when authenticated — higher rate limits, no 403s
  const fetchUrl = token
    ? url.replace("https://www.reddit.com", "https://oauth.reddit.com")
    : url;

  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(fetchUrl, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  console.log(`[redditSkill] rfetch ${fetchUrl.slice(0, 120)} → ${res.status} ${res.statusText}`);
  if (!res.ok) throw new Error(`Reddit ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Comment fetcher ───────────────────────────────────────────────────────────

async function fetchComments(permalink: string, limit: number): Promise<RedditComment[]> {
  try {
    const data = await rfetch<[RawListing<RawPost>, RawListing<RawComment>]>(
      `https://www.reddit.com${permalink}.json?limit=${limit}&depth=2&sort=top`
    );
    const comments = (data[1]?.data?.children ?? [])
      .filter(c => c.data?.body && !["[deleted]", "[removed]"].includes(c.data.body))
      .slice(0, limit)
      .map(c => ({
        text: c.data.body.slice(0, 500),
        score: c.data.score,
        author: c.data.author,
      }));
    console.log(`[redditSkill] fetchComments ${permalink}: ${comments.length} comments`);
    if (comments.length > 0) console.log(`  top comment preview: "${comments[0].text.slice(0, 100)}"`);
    return comments;
  } catch (err) {
    console.warn(`[redditSkill] fetchComments ${permalink} FAILED:`, err instanceof Error ? err.message : err);
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
    commentedPostsLimit = 5,
    allowedSubreddits = [...BUSINESS_SUBREDDITS],
  } = options;

  const allowSet = new Set(allowedSubreddits.map(s => s.toLowerCase()));
  const q = encodeURIComponent(query);
  const url = `https://www.reddit.com/search.json?q=${q}&sort=${sort}&t=${time}&limit=${limit}&type=link`;

  let rawPosts: RawPost[] = [];
  try {
    const data = await rfetch<RawListing<RawPost>>(url);
    const all = (data.data?.children ?? []).map(c => c.data);
    rawPosts = all.filter(p =>
      p.selftext !== "[deleted]" &&
      p.selftext !== "[removed]" &&
      (allowSet.size === 0 || allowSet.has(p.subreddit.toLowerCase()))
    );
    const dropped = all.length - rawPosts.length;
    console.log(`[redditSkill] searchReddit "${query}": ${all.length} raw → ${rawPosts.length} after filter (${dropped} dropped by subreddit/deleted)`);
    if (dropped > 0 && rawPosts.length === 0) {
      const subreddits = [...new Set(all.map(p => p.subreddit))];
      console.warn(`[redditSkill] ALL posts dropped. Subreddits in results: ${subreddits.join(", ")}`);
    }
  } catch (err) {
    console.warn("[redditSkill] search failed:", err);
    return [];
  }

  // Fetch comments for top N posts concurrently; rest get no comments
  const top = rawPosts.slice(0, commentedPostsLimit);
  const rest = rawPosts.slice(commentedPostsLimit);

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

  console.log(`[redditSkill] extractRedditClaims: ${posts.length} posts → evidence block ${evidenceBlock.length} chars`);
  console.log(`[redditSkill] evidence preview:\n${evidenceBlock.slice(0, 600)}`);

  const res = await openai.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a Reddit Intelligence Extractor. Your primary goal is to surface experiential knowledge — what real practitioners have tried, discovered, and reported.

PRIORITY: Extract from COMMENTS before post bodies. Comments contain first-person lived experience; post titles are usually questions or opinions.

Extract claims from:
- First-person experiences with outcomes ("We got X by doing Y")
- Founder and operator anecdotes with specific results
- Customer acquisition stories (channels, tactics, numbers)
- Failure post-mortems with identifiable root causes
- Lessons learned from people who have done the thing

MERGE RULE: If multiple commenters independently report the same outcome, merge into a single claim. Merged claims carry stronger signal than a single report — reflect this in the claim wording ("Multiple founders report…", "Several users confirm…").

EXTRACTION FILTER — A claim is only valid if it contains ALL THREE:
1. First-person experience ("we", "I", "our team", "my startup")
2. An action taken (what they did)
3. An outcome or lesson (what happened, what they learned)

Discard any claim that fails this test. Generic advice without evidence is noise.

Examples of VALID claims:
- "We got our first 20 customers through cold email." ✓ (person + action + outcome)
- "Our first users came from Reddit AMA posts." ✓
- "We manually onboarded every customer for the first 3 months." ✓

Examples of INVALID claims:
- "Cold email works for B2B." ✗ (no first-person, no outcome)
- "You should talk to your customers." ✗ (generic advice)
- "Building in public is good." ✗ (no evidence)

MERGE RULE: If multiple commenters independently describe the same action with the same outcome, merge into one claim. Preserve the count ("3 founders report…", "Multiple users confirm…").

RULES:
- Only extract what is directly stated — no inference beyond the text
- Prioritize by upvote score: higher score = more community-validated evidence
- Include verbatim or close-paraphrase as "evidence" (the actual words from the commenter)
- Source reference must match the [R#] index from evidence
- Extract at most 20 claims, prioritize specificity and uniqueness
- Exclude vague generalities ("hard work pays off", "it depends", "YMMV")

Additional fields:
- source_type: "comment" if evidence comes from a comment, "post" if from the post body or title
- support_count: number of distinct people reporting the same outcome (1 for single reports, 2+ for merged claims)

Return JSON:
{
  "claims": [
    {
      "source_ref": "R1",
      "source_type": "comment | post",
      "support_count": 1,
      "text": "normalized claim — one specific assertion, max 150 chars",
      "evidence": "verbatim or close paraphrase from the commenter, max 200 chars",
      "sentiment": "positive|negative|neutral|mixed",
      "claim_type": "pain_point|success|failure|opinion|statistic|recommendation"
    }
  ]
}`,
      },
      { role: "user", content: `Topic: ${topic}\n\nReddit Evidence:\n\n${evidenceBlock}` },
    ],
  });

  type RawExtracted = { source_ref?: string; source_type?: string; support_count?: number; text?: string; evidence?: string; sentiment?: string; claim_type?: string };
  let raw: RawExtracted[] = [];
  try {
    const content = res.choices[0]?.message?.content ?? "{}";
    console.log(`[redditSkill] extractRedditClaims LLM raw (${posts.length} posts):\n${content.slice(0, 1000)}`);
    const parsed = JSON.parse(content) as { claims?: unknown };
    raw = Array.isArray(parsed.claims) ? (parsed.claims as RawExtracted[]) : [];
    console.log(`[redditSkill] extractRedditClaims: ${raw.length} raw claims from LLM`);
    raw.forEach((c, i) => {
      const valid = !!(c.text && c.source_ref);
      console.log(`  [${i}] ${valid ? "PASS" : "REJECT"} source_ref=${c.source_ref ?? "missing"} text="${(c.text ?? "").slice(0, 80)}"`);
    });
  } catch (err) {
    console.warn("[redditSkill] extractRedditClaims parse failed:", err);
    return [];
  }

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
        evidence: (c.evidence ?? "").slice(0, 200),
        source_type: c.source_type === "post" ? "post" : "comment",
        support_count: Math.max(1, Math.round(c.support_count ?? 1)),
        sentiment: VALID_SENTIMENT.has(c.sentiment ?? "") ? c.sentiment as RedditClaim["sentiment"] : "neutral",
        claim_type: VALID_TYPE.has(c.claim_type ?? "") ? c.claim_type as RedditClaim["claim_type"] : "opinion",
        created_at: post?.created_at ?? new Date().toISOString(),
        source_url: post?.url ?? "",
        source_title: post?.title ?? "",
      };
    });
}
