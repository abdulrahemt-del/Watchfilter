import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { searchReddit, extractRedditClaims } from "@/lib/redditSkill";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI();

const HEADERS = { "User-Agent": "WatchFilter/1.0 (startup intelligence platform)" };

// ── Layer 1: raw Reddit connectivity ──────────────────────────────────────────

async function testConnectivity(): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  posts_in_response: number;
  sample_post: { title: string; subreddit: string; score: number } | null;
  error: string | null;
}> {
  try {
    const res = await fetch(
      "https://www.reddit.com/r/SaaS/hot.json?limit=5",
      { headers: HEADERS, signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) {
      return { ok: false, status: res.status, statusText: res.statusText, posts_in_response: 0, sample_post: null, error: `HTTP ${res.status}` };
    }
    const data = await res.json() as { data?: { children?: Array<{ data: { title: string; subreddit: string; score: number } }> } };
    const posts = data.data?.children ?? [];
    return {
      ok: true,
      status: res.status,
      statusText: res.statusText,
      posts_in_response: posts.length,
      sample_post: posts[0]?.data ?? null,
      error: null,
    };
  } catch (err) {
    return { ok: false, status: 0, statusText: "", posts_in_response: 0, sample_post: null, error: String(err) };
  }
}

// ── Layer 2: comment fetch for a known post ───────────────────────────────────

async function testCommentFetch(): Promise<{
  ok: boolean;
  post_permalink: string;
  comments_retrieved: number;
  top_comment_preview: string | null;
  error: string | null;
}> {
  // Known active SaaS thread — fetch hot to get a real post ID
  const permalink = "/r/SaaS/comments.json";
  try {
    const searchRes = await fetch(
      "https://www.reddit.com/r/SaaS/hot.json?limit=3",
      { headers: HEADERS, signal: AbortSignal.timeout(8_000) }
    );
    if (!searchRes.ok) {
      return { ok: false, post_permalink: "r/SaaS/hot", comments_retrieved: 0, top_comment_preview: null, error: `Search HTTP ${searchRes.status}` };
    }
    const searchData = await searchRes.json() as { data?: { children?: Array<{ data: { permalink: string } }> } };
    const firstPermalink = searchData.data?.children?.[0]?.data?.permalink;
    if (!firstPermalink) {
      return { ok: false, post_permalink: permalink, comments_retrieved: 0, top_comment_preview: null, error: "No posts in r/SaaS/hot — subreddit filter or API issue" };
    }

    const commentRes = await fetch(
      `https://www.reddit.com${firstPermalink}.json?limit=10&depth=2&sort=top`,
      { headers: HEADERS, signal: AbortSignal.timeout(8_000) }
    );
    if (!commentRes.ok) {
      return { ok: false, post_permalink: firstPermalink, comments_retrieved: 0, top_comment_preview: null, error: `Comment fetch HTTP ${commentRes.status}` };
    }
    const commentData = await commentRes.json() as [unknown, { data?: { children?: Array<{ data: { body: string; score: number } }> } }];
    const comments = (commentData[1]?.data?.children ?? [])
      .filter(c => c.data?.body && !["[deleted]", "[removed]"].includes(c.data.body));

    return {
      ok: true,
      post_permalink: firstPermalink,
      comments_retrieved: comments.length,
      top_comment_preview: comments[0]?.data?.body?.slice(0, 200) ?? null,
      error: null,
    };
  } catch (err) {
    return { ok: false, post_permalink: permalink, comments_retrieved: 0, top_comment_preview: null, error: String(err) };
  }
}

// ── Layer 3: full search pipeline for a known-good query ─────────────────────

async function testSearchPipeline(): Promise<{
  query: string;
  posts_retrieved: number;
  posts_dropped_by_filter: number;
  subreddits_seen: string[];
  subreddits_dropped: string[];
  comments_across_posts: number;
  posts_with_zero_comments: number;
  sample_posts: Array<{ title: string; subreddit: string; score: number; comments: number }>;
  error: string | null;
}> {
  const query = "how did you get your first customers SaaS startup";
  try {
    const res = await fetch(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&t=year&limit=25&type=link`,
      { headers: HEADERS, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) {
      return { query, posts_retrieved: 0, posts_dropped_by_filter: 0, subreddits_seen: [], subreddits_dropped: [], comments_across_posts: 0, posts_with_zero_comments: 0, sample_posts: [], error: `HTTP ${res.status}` };
    }
    const data = await res.json() as { data?: { children?: Array<{ data: { id: string; subreddit: string; title: string; selftext: string; score: number; permalink: string } }> } };
    const all = (data.data?.children ?? []).map(c => c.data);
    const ALLOWED = new Set(["startups", "saas", "entrepreneur", "marketing", "sales", "productmanagement", "smallbusiness", "ycombinator", "indiehackers", "webdev", "technology", "programming", "software", "artificial", "machinelearning", "artificialintelligence", "businessintelligence", "venturecapital", "customersuccess", "growmybusiness"]);
    const filtered = all.filter(p => p.selftext !== "[deleted]" && p.selftext !== "[removed]" && ALLOWED.has(p.subreddit.toLowerCase()));
    const dropped = all.filter(p => !ALLOWED.has(p.subreddit.toLowerCase()));
    const subredditsDropped = [...new Set(dropped.map(p => p.subreddit))];

    // Fetch comments for first 3 posts
    const topPosts = filtered.slice(0, 3);
    const commentResults = await Promise.allSettled(
      topPosts.map(p => fetch(
        `https://www.reddit.com${p.permalink}.json?limit=8&depth=2&sort=top`,
        { headers: HEADERS, signal: AbortSignal.timeout(8_000) }
      ).then(r => r.json() as Promise<[unknown, { data?: { children?: Array<{ data: { body: string } }> } }]>))
    );

    const postsWithCommentCounts = topPosts.map((p, i) => {
      const result = commentResults[i];
      const commentCount = result.status === "fulfilled"
        ? (result.value[1]?.data?.children ?? []).filter(c => c.data?.body && !["[deleted]", "[removed]"].includes(c.data.body)).length
        : 0;
      return { title: p.title.slice(0, 80), subreddit: p.subreddit, score: p.score, comments: commentCount };
    });

    const totalComments = postsWithCommentCounts.reduce((s, p) => s + p.comments, 0);
    const zeroCommentPosts = postsWithCommentCounts.filter(p => p.comments === 0).length;

    return {
      query,
      posts_retrieved: filtered.length,
      posts_dropped_by_filter: dropped.length,
      subreddits_seen: [...new Set(all.map(p => p.subreddit))],
      subreddits_dropped: subredditsDropped,
      comments_across_posts: totalComments,
      posts_with_zero_comments: zeroCommentPosts,
      sample_posts: postsWithCommentCounts,
      error: null,
    };
  } catch (err) {
    return { query, posts_retrieved: 0, posts_dropped_by_filter: 0, subreddits_seen: [], subreddits_dropped: [], comments_across_posts: 0, posts_with_zero_comments: 0, sample_posts: [], error: String(err) };
  }
}

// ── Layer 4: full redditSkill end-to-end ─────────────────────────────────────

async function testSkillEndToEnd(): Promise<{
  query: string;
  posts_from_skill: number;
  comments_total: number;
  claims_raw_from_llm: number;
  claims_after_filter: number;
  claim_samples: Array<{ text: string; source_type: string; support_count: number }>;
  error: string | null;
}> {
  const query = "how did you get your first customers";
  try {
    const posts = await searchReddit(query, { limit: 10, fetchComments: true, commentLimit: 5, commentedPostsLimit: 5 });
    const totalComments = posts.reduce((s, p) => s + p.top_comments.length, 0);
    const claims = await extractRedditClaims(posts, query, openai);
    return {
      query,
      posts_from_skill: posts.length,
      comments_total: totalComments,
      claims_raw_from_llm: claims.length,
      claims_after_filter: claims.length,
      claim_samples: claims.slice(0, 5).map(c => ({ text: c.text.slice(0, 120), source_type: c.source_type, support_count: c.support_count })),
      error: null,
    };
  } catch (err) {
    return { query, posts_from_skill: 0, comments_total: 0, claims_raw_from_llm: 0, claims_after_filter: 0, claim_samples: [], error: String(err) };
  }
}

// ── Layer 5: extraction bypass — hardcoded comment, tests LLM only ───────────

async function testExtractionBypass(): Promise<{
  hardcoded_comments: string[];
  claims_extracted: number;
  claim_samples: Array<{ text: string; source_type: string; support_count: number }>;
  diagnosis: string;
  error: string | null;
}> {
  const HARDCODED_COMMENTS = [
    "Cold email got us our first 20 paying customers. We manually outreached 500 founders in our ICP.",
    "We built in public on Twitter and Reddit. Our first 100 users came from r/SaaS posts and Twitter threads.",
    "We manually onboarded every customer for the first 3 months — hopped on Zoom calls, did setup for them.",
    "Founder networks worked for us. We posted in YC alumni Slack and got 15 early customers that way.",
    "Content marketing eventually worked but took 9 months before we saw any organic signups from it.",
  ];

  const fakePosts = [{
    id: "debug_bypass_001",
    subreddit: "SaaS",
    title: "How did you get your first customers?",
    body: "",
    score: 245,
    num_comments: 87,
    created_at: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
    url: "https://reddit.com/r/SaaS/debug_bypass",
    top_comments: HARDCODED_COMMENTS.map((text, i) => ({ text, score: 50 - i * 5, author: `founder_${i}` })),
  }];

  try {
    const claims = await extractRedditClaims(fakePosts, "how did you get your first customers", openai);
    const diagnosis = claims.length === 0
      ? "EXTRACTION BUG: hardcoded valid comments returned 0 claims — LLM filter is broken"
      : `EXTRACTION OK: ${claims.length} claims from hardcoded input — retrieval is the problem`;
    return {
      hardcoded_comments: HARDCODED_COMMENTS,
      claims_extracted: claims.length,
      claim_samples: claims.slice(0, 5).map(c => ({ text: c.text.slice(0, 120), source_type: c.source_type, support_count: c.support_count })),
      diagnosis,
      error: null,
    };
  } catch (err) {
    return { hardcoded_comments: HARDCODED_COMMENTS, claims_extracted: 0, claim_samples: [], diagnosis: "ERROR during extraction", error: String(err) };
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const layer = new URL(req.url).searchParams.get("layer") ?? "all";

  const result: Record<string, unknown> = { timestamp: new Date().toISOString(), layer };

  if (layer === "all" || layer === "connectivity") {
    result.layer_1_connectivity = await testConnectivity();
  }
  if (layer === "all" || layer === "comments") {
    result.layer_2_comment_fetch = await testCommentFetch();
  }
  if (layer === "all" || layer === "search") {
    result.layer_3_search_pipeline = await testSearchPipeline();
  }
  if (layer === "all" || layer === "skill") {
    result.layer_4_skill_end_to_end = await testSkillEndToEnd();
  }
  if (layer === "all" || layer === "bypass") {
    result.layer_5_extraction_bypass = await testExtractionBypass();
  }

  // Summary diagnosis
  if (layer === "all") {
    const l1 = result.layer_1_connectivity as Awaited<ReturnType<typeof testConnectivity>>;
    const l2 = result.layer_2_comment_fetch as Awaited<ReturnType<typeof testCommentFetch>>;
    const l3 = result.layer_3_search_pipeline as Awaited<ReturnType<typeof testSearchPipeline>>;
    const l4 = result.layer_4_skill_end_to_end as Awaited<ReturnType<typeof testSkillEndToEnd>>;
    const l5 = result.layer_5_extraction_bypass as Awaited<ReturnType<typeof testExtractionBypass>>;

    const diagnosis: string[] = [];
    if (!l1.ok)
      diagnosis.push(`INFRA BROKEN: Reddit API unreachable (${l1.error})`);
    else if (l5.claims_extracted === 0)
      diagnosis.push("EXTRACTION BUG: hardcoded valid comments → 0 claims. LLM filter is broken regardless of retrieval.");
    else if (l2.comments_retrieved === 0)
      diagnosis.push("COMMENT FETCH BROKEN: posts retrieved but 0 comments returned");
    else if (l3.posts_retrieved === 0)
      diagnosis.push(`SUBREDDIT FILTER TOO STRICT: ${l3.posts_dropped_by_filter} posts dropped — blocked subreddits: ${l3.subreddits_dropped.join(", ")}`);
    else if (l4.claims_after_filter === 0 && l4.posts_from_skill > 0)
      diagnosis.push("RETRIEVAL OK, EXTRACTION FAILING: posts and comments fetched but real queries yield 0 claims — check extraction prompt vs. bypass which works");
    else if (l4.claims_after_filter > 0)
      diagnosis.push(`PIPELINE OK: ${l4.claims_after_filter} claims extracted end-to-end`);
    else
      diagnosis.push("UNKNOWN: check layer details above");

    result.diagnosis = diagnosis;
  }

  return NextResponse.json(result, { status: 200 });
}
