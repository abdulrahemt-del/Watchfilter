export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type IntelligenceArticle = {
  title: string;
  url: string;
  domain: string;
  content: string;       // up to 2000 chars
  published_date?: string;
  relevance_score?: number;
};

// Tavily is purpose-built for AI search — clean JSON, no scraping, reliable citations.
// Set TAVILY_API_KEY in env. Without it, returns [] silently.
export async function webSearch(query: string, maxResults = 4): Promise<WebSearchResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ title: string; url: string; content: string; score?: number }> };
    return (data.results ?? []).map(r => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: (r.content ?? "").slice(0, 500),
      score: r.score,
    }));
  } catch {
    return [];
  }
}

// Advanced web search for the Intelligence pipeline — full content, higher result count.
export async function intelligenceWebSearch(
  query: string,
  maxResults = 8,
): Promise<IntelligenceArticle[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: maxResults,
        search_depth: "advanced",
        include_answer: false,
        include_raw_content: false,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        score?: number;
        published_date?: string;
      }>;
    };
    return (data.results ?? []).map(r => {
      let domain = "";
      try { domain = new URL(r.url ?? "").hostname.replace(/^www\./, ""); } catch { /* skip */ }
      return {
        title: r.title ?? "",
        url: r.url ?? "",
        domain,
        content: (r.content ?? "").slice(0, 2000),
        published_date: r.published_date,
        relevance_score: r.score,
      };
    }).filter(r => r.url && r.content);
  } catch {
    return [];
  }
}

export function formatWebResults(results: WebSearchResult[]): string {
  if (!results.length) return "";
  return results
    .map((r, i) => `[W${i + 1}] ${r.title}\n     URL: ${r.url}\n     ${r.content}`)
    .join("\n\n");
}
