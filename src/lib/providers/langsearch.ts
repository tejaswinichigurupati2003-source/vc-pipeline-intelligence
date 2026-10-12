import pLimit from "p-limit";
import { requireEnv } from "@/lib/config";
import { canonicalizeUrl, domainOf } from "@/lib/discovery/normalize";
import type { Candidate } from "@/lib/types";
import { fetchWithRetry, ProviderError } from "./http";

interface LangSearchItem {
  id?: string;
  name?: string;
  url?: string;
  snippet?: string;
  text?: string;
  datePublished?: string | null;
}

/** Verified against https://docs.langsearch.com/api/openapi.json : data.webPages.value[]{name,url,snippet,datePublished}. */
export function parseLangSearch(json: unknown): Omit<Candidate, "id">[] {
  const items = ((json as { data?: { webPages?: { value?: LangSearchItem[] } } })?.data?.webPages?.value) ?? [];
  const out: Omit<Candidate, "id">[] = [];
  for (const it of items) {
    if (!it.url) continue;
    out.push({
      url: it.url,
      canonicalUrl: canonicalizeUrl(it.url),
      title: it.name ?? "",
      snippet: it.snippet ?? it.text?.slice(0, 500) ?? "",
      provider: "langsearch",
      sourceDomain: domainOf(it.url),
      providerDate: it.datePublished ?? null,
      isFeedItem: false,
    });
  }
  return out;
}

/** Errors and 429s throw. They are failed queries, never "zero results". */
// All investors scanned in parallel share this cap, so bursts stay inside the provider's rate limit.
const searchSlots = pLimit(5);

export function langSearch(query: string, count = 10, freshness: "oneMonth" | "oneYear" = "oneMonth") {
  return searchSlots(() => langSearchOnce(query, count, freshness));
}

async function langSearchOnce(query: string, count: number, freshness: string): Promise<Omit<Candidate, "id">[]> {
  const res = await fetchWithRetry("https://api.langsearch.com/v1/web-search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("LANGSEARCH_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, freshness, count }),
  });
  if (!res.ok) {
    throw new ProviderError(res.status === 429 ? "search_quota" : "search_error", `LangSearch HTTP ${res.status}`, res.status);
  }
  const json = await res.json().catch(() => {
    throw new ProviderError("search_error", "LangSearch returned invalid JSON");
  });
  return parseLangSearch(json);
}
