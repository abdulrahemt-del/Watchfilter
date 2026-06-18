/**
 * Hacker News Intelligence Skill — WatchFilter
 *
 * Uses the free Algolia HN search API. No authentication required.
 * Drop-in replacement for redditSkill — HNClaim is structurally compatible.
 */

import OpenAI from "openai";

// ── Public types ──────────────────────────────────────────────────────────────

export type HNComment = {
  text: string;
  score: number;
  author: string;
};

export type HNPost = {
  id: string;
  title: string;
  body: string;
  score: number;
  num_comments: number;
  created_at: string;
  url: string;
  top_comments: HNComment[];
};

// Structurally compatible with RedditClaim for route drop-in
export type HNClaim = {
  id: string;
  subreddit: string;       // always "HN"
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

export type HNSearchOptions = {
  limit?: number;
  fetchComments?: boolean;
  commentLimit?: number;
  commentedPostsLimit?: number;
  minPoints?: number;
};

// ── Internal Algolia API types ────────────────────────────────────────────────

type AlgoliaStoryHit = {
  objectID: string;
  title: string | null;
  story_text: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string | null;
  author: string | null;
};

type AlgoliaCommentHit = {
  objectID: string;
  comment_text: string | null;
  story_id: number | null;
  story_title: string | null;
  points: number | null;
  author: string | null;
  created_at: string | null;
};

type HNItem = {
  id: number;
  title: string | null;
  text: string | null;
  points: number | null;
  author: string | null;
  created_at: string | null;
  children: HNItemChild[];
};

type HNItemChild = {
  id: number;
  text: string | null;
  points: number | null;
  author: string | null;
  created_at: string | null;
  children: HNItemChild[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHTML(html: string): string {
  return html
    .replace(/<p>/gi, "\n").replace(/<\/p>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#x2F;/g, "/")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function flattenComments(children: HNItemChild[], limit: number): HNComment[] {
  const result: HNComment[] = [];
  const walk = (nodes: HNItemChild[]) => {
    for (const n of nodes) {
      if (result.length >= limit) return;
      if (n.text && n.author && n.author !== "dang") {
        result.push({
          text: stripHTML(n.text).slice(0, 500),
          score: n.points ?? 0,
          author: n.author,
        });
      }
      if (n.children?.length) walk(n.children);
    }
  };
  walk(children);
  return result;
}

async function fetchHNItem(id: string): Promise<HNItem | null> {
  try {
    const res = await fetch(`https://hn.algolia.com/api/v1/items/${id}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`[hnSkill] fetchHNItem ${id}: ${res.status}`);
      return null;
    }
    const item = await res.json() as HNItem;
    const commentCount = flattenComments(item.children ?? [], 999).length;
    console.log(`[hnSkill] fetchHNItem ${id} "${item.title?.slice(0, 60)}": ${commentCount} comments`);
    return item;
  } catch (err) {
    console.warn(`[hnSkill] fetchHNItem ${id} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Main search function ──────────────────────────────────────────────────────

export async function searchHN(
  query: string,
  options: HNSearchOptions = {},
): Promise<HNPost[]> {
  const {
    limit = 15,
    fetchComments: doFetch = true,
    commentLimit = 10,
    commentedPostsLimit = 5,
    minPoints = 3,
  } = options;

  const q = encodeURIComponent(query);

  // Parallel: story search + direct comment search
  const [storyRes, commentRes] = await Promise.allSettled([
    fetch(
      `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&hitsPerPage=${limit}&numericFilters=points>${minPoints}`,
      { signal: AbortSignal.timeout(8_000) }
    ),
    fetch(
      `https://hn.algolia.com/api/v1/search?query=${q}&tags=comment&hitsPerPage=40&numericFilters=points>1`,
      { signal: AbortSignal.timeout(8_000) }
    ),
  ]);

  let storyHits: AlgoliaStoryHit[] = [];
  let commentHits: AlgoliaCommentHit[] = [];

  if (storyRes.status === "fulfilled" && storyRes.value.ok) {
    const data = await storyRes.value.json() as { hits: AlgoliaStoryHit[] };
    storyHits = data.hits ?? [];
    console.log(`[hnSkill] searchHN "${query}": ${storyHits.length} stories`);
  } else {
    console.warn(`[hnSkill] story search failed for "${query}"`);
  }

  if (commentRes.status === "fulfilled" && commentRes.value.ok) {
    const data = await commentRes.value.json() as { hits: AlgoliaCommentHit[] };
    commentHits = data.hits ?? [];
    console.log(`[hnSkill] searchHN "${query}": ${commentHits.length} direct comment hits`);
  }

  // Fetch full item details for top stories to get their comment threads
  const topStories = storyHits.slice(0, commentedPostsLimit);
  const itemResults = doFetch
    ? await Promise.allSettled(topStories.map(s => fetchHNItem(s.objectID)))
    : topStories.map((): PromiseFulfilledResult<HNItem | null> => ({ status: "fulfilled", value: null }));

  const posts: HNPost[] = topStories.map((story, i) => {
    const item = itemResults[i].status === "fulfilled" ? itemResults[i].value : null;
    const fetchedComments = item ? flattenComments(item.children ?? [], commentLimit) : [];
    return {
      id: story.objectID,
      title: story.title ?? "",
      body: story.story_text ? stripHTML(story.story_text).slice(0, 2000) : "",
      score: story.points ?? 0,
      num_comments: story.num_comments ?? 0,
      created_at: story.created_at ?? new Date().toISOString(),
      url: `https://news.ycombinator.com/item?id=${story.objectID}`,
      top_comments: fetchedComments,
    };
  });

  // Add posts derived from direct comment hits (stories not already fetched)
  const existingIds = new Set(posts.map(p => p.id));
  const storyGroups = new Map<string, AlgoliaCommentHit[]>();
  commentHits.forEach(c => {
    const sid = String(c.story_id ?? "unknown");
    if (!storyGroups.has(sid)) storyGroups.set(sid, []);
    storyGroups.get(sid)!.push(c);
  });

  storyGroups.forEach((comments, storyId) => {
    if (existingIds.has(storyId)) return;
    const first = comments[0];
    posts.push({
      id: storyId,
      title: first.story_title ?? "",
      body: "",
      score: 0,
      num_comments: comments.length,
      created_at: first.created_at ?? new Date().toISOString(),
      url: `https://news.ycombinator.com/item?id=${storyId}`,
      top_comments: comments.slice(0, commentLimit).map(c => ({
        text: stripHTML(c.comment_text ?? "").slice(0, 500),
        score: c.points ?? 0,
        author: c.author ?? "",
      })),
    });
  });

  const totalComments = posts.reduce((s, p) => s + p.top_comments.length, 0);
  console.log(`[hnSkill] searchHN total: ${posts.length} posts | ${totalComments} comments`);
  return posts;
}

// ── Claim extraction ──────────────────────────────────────────────────────────

export async function extractHNClaims(
  posts: HNPost[],
  topic: string,
  openai: OpenAI,
  model = "gpt-4o-mini",
): Promise<HNClaim[]> {
  if (posts.length === 0) return [];

  const evidenceBlock = posts.map((p, i) => {
    const lines = [
      `[H${i + 1}] "${p.title}" | Score: ${p.score} | ${p.created_at.slice(0, 10)}`,
    ];
    if (p.body.trim()) lines.push(`Body: ${p.body.slice(0, 600)}`);
    if (p.top_comments.length > 0) {
      lines.push(`Top comments:`);
      p.top_comments.slice(0, 6).forEach(c =>
        lines.push(`  [+${c.score}] ${c.text.slice(0, 250)}`)
      );
    }
    lines.push(`URL: ${p.url}`);
    return lines.join("\n");
  }).join("\n\n---\n\n");

  console.log(`[hnSkill] extractHNClaims: ${posts.length} posts → evidence ${evidenceBlock.length} chars`);
  console.log(`[hnSkill] evidence preview:\n${evidenceBlock.slice(0, 600)}`);

  const res = await openai.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a Hacker News Intelligence Extractor. Your goal is to surface experiential knowledge from technical founders, operators, and practitioners who have done the thing.

PRIORITY: Extract from COMMENTS before post bodies. Comments contain first-person lived experience; post titles are usually questions.

Extract claims from:
- First-person experiences with outcomes ("We got X by doing Y")
- Founder and operator anecdotes with specific results
- Customer acquisition stories (channels, tactics, numbers)
- Failure post-mortems with identifiable root causes
- Lessons learned from people who have done the thing

EXTRACTION FILTER — A claim is only valid if it contains ALL THREE:
1. First-person experience ("we", "I", "our team", "my startup")
2. An action taken (what they did)
3. An outcome or lesson (what happened, what they learned)

Discard any claim that fails this test. Generic advice without evidence is noise.

MERGE RULE: If multiple commenters independently describe the same action with the same outcome, merge into one claim. Preserve the count ("3 founders report…").

RULES:
- Only extract what is directly stated — no inference
- Source reference must match the [H#] index from evidence
- Extract at most 20 claims, prioritize specificity
- Exclude vague generalities

source_type: "comment" if from a comment, "post" if from post body
support_count: number of distinct people reporting the same outcome

Return JSON:
{
  "claims": [
    {
      "source_ref": "H1",
      "source_type": "comment | post",
      "support_count": 1,
      "text": "normalized claim — one specific assertion, max 150 chars",
      "evidence": "verbatim or close paraphrase, max 200 chars",
      "sentiment": "positive|negative|neutral|mixed",
      "claim_type": "pain_point|success|failure|opinion|statistic|recommendation"
    }
  ]
}`,
      },
      { role: "user", content: `Topic: ${topic}\n\nHacker News Evidence:\n\n${evidenceBlock}` },
    ],
  });

  type RawExtracted = { source_ref?: string; source_type?: string; support_count?: number; text?: string; evidence?: string; sentiment?: string; claim_type?: string };
  let raw: RawExtracted[] = [];
  try {
    const content = res.choices[0]?.message?.content ?? "{}";
    console.log(`[hnSkill] extractHNClaims LLM raw:\n${content.slice(0, 800)}`);
    const parsed = JSON.parse(content) as { claims?: unknown };
    raw = Array.isArray(parsed.claims) ? (parsed.claims as RawExtracted[]) : [];
    console.log(`[hnSkill] extractHNClaims: ${raw.length} raw → ${raw.filter(c => c.text && c.source_ref).length} valid`);
  } catch { return []; }

  const VALID_SENTIMENT = new Set(["positive", "negative", "neutral", "mixed"]);
  const VALID_TYPE = new Set(["pain_point", "success", "failure", "opinion", "statistic", "recommendation"]);

  return raw
    .filter(c => c.text && c.source_ref)
    .map((c, i): HNClaim => {
      const refIdx = parseInt((c.source_ref ?? "H1").replace(/[^0-9]/g, "")) - 1;
      const post = posts[Math.max(0, Math.min(refIdx, posts.length - 1))];
      return {
        id: `hn_${Date.now()}_${i}`,
        subreddit: "HN",
        post_score: post?.score ?? 0,
        text: c.text!,
        evidence: (c.evidence ?? "").slice(0, 200),
        source_type: c.source_type === "post" ? "post" : "comment",
        support_count: Math.max(1, Math.round(c.support_count ?? 1)),
        sentiment: VALID_SENTIMENT.has(c.sentiment ?? "") ? c.sentiment as HNClaim["sentiment"] : "neutral",
        claim_type: VALID_TYPE.has(c.claim_type ?? "") ? c.claim_type as HNClaim["claim_type"] : "opinion",
        created_at: post?.created_at ?? new Date().toISOString(),
        source_url: post?.url ?? "",
        source_title: post?.title ?? "",
      };
    });
}
