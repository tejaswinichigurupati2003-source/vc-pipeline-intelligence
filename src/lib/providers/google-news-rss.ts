import type { Candidate } from "@/lib/types";
import { fetchWithRetry, ProviderError } from "./http";
import { parseFeed } from "./feed";

/** Query must already contain `when:30d`. Item links are Google redirect URLs; page fetch may fail (headline-only fallback). */
export async function googleNews(query: string): Promise<Omit<Candidate, "id">[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; VCPipelineBot/1.0)" } });
  if (!res.ok) throw new ProviderError("search_error", `Google News RSS HTTP ${res.status}`, res.status);
  return parseFeed(await res.text(), "google_news_rss", false);
}
