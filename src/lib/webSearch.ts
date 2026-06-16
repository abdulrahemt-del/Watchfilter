export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
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

export function formatWebResults(results: WebSearchResult[]): string {
  if (!results.length) return "";
  return results
    .map((r, i) => `[W${i + 1}] ${r.title}\n     URL: ${r.url}\n     ${r.content}`)
    .join("\n\n");
}
