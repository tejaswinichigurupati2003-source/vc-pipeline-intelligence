import { geographyTerms, sectorTerms, stageTerms, type CompanyContext } from "@/lib/company/context";

export interface ExpansionQuery {
  id: string;
  provider: "langsearch" | "google_news_rss";
  query: string;
  /** LangSearch freshness window. Funding news is recent; thesis and fund pages are evergreen. */
  freshness?: "oneMonth" | "oneYear";
}

/**
 * Deterministic search plan from the company's descriptors. Two angles: who has recently BACKED companies like this
 * (funding news shows active investors), and which funds state a focus that matches (thesis pages). Never includes
 * metrics, notes, documents or anything else about the company beyond its public-style description.
 */
export function buildExpansionQueries(c: CompanyContext): ExpansionQuery[] {
  const sector = sectorTerms(c);
  const S = sector.slice(0, 3).join(" ");
  const S1 = sector[0] ?? c.sector;
  const S2 = sector[1] ?? S1;
  const G = geographyTerms(c)[0] ?? "";
  const stage = stageTerms(c)[0];
  const q = (parts: (string | undefined)[]) => parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const plan: ExpansionQuery[] = [
    { id: "E1", provider: "langsearch", freshness: "oneMonth", query: q([stage, "funding round", S, "startup", G, "led by venture capital"]) },
    { id: "E2", provider: "langsearch", freshness: "oneMonth", query: q(["venture capital firm invests in", S, G, "startups", stage, "round announced"]) },
    { id: "E3", provider: "langsearch", freshness: "oneYear", query: q([G, "venture capital funds", S, "investment thesis", "early stage"]) },
    { id: "E4", provider: "langsearch", freshness: "oneYear", query: q(["top", stage, "investors", S, G]) },
    { id: "E5", provider: "google_news_rss", query: q([`(${[S1, `"${S2}"`].filter((v, i, a) => a.indexOf(v) === i).join(" OR ")})`, `("raises" OR "funding" OR "${stage} round")`, G, "when:60d"]) },
    { id: "E6", provider: "google_news_rss", query: q([G, "venture fund", S1, "investors announce when:60d"]) },
  ];
  const seen = new Set<string>();
  return plan.filter((p) => (seen.has(p.query) ? false : (seen.add(p.query), true)));
}
