import { config } from "@/lib/config";
import { investorIsFirmName, normText } from "./normalize";
import type { VcProfile } from "@/lib/types";

export interface PlannedQuery {
  id: "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7" | "Q8";
  provider: "langsearch" | "google_news_rss";
  query: string;
  /** LangSearch freshness window. The history search looks back a year; everything else one month. */
  freshness?: "oneMonth" | "oneYear";
}

const clean = (s: string) => s.replace(/["()]/g, " ").replace(/\s+/g, " ").trim();
/** "Z47 (Matrix Partners India)" -> "Z47" */
const firmShort = (firm: string) => clean(firm.replace(/\([^)]*\)/, ""));

export function sectorTerms(vc: VcProfile): string[] {
  const own = vc.sector_keywords.map(clean).filter(Boolean);
  return own.length ? own : ["logistics", "supply chain", "freight"];
}

/** Deterministic query templates (spec 7.3). Capped at MAX_QUERIES_PER_VC. */
export function buildQueries(vc: VcProfile, opts: { backfill?: boolean } = {}): PlannedQuery[] {
  const firm = firmShort(vc.firm_name);
  const terms = sectorTerms(vc);
  const kw = terms.slice(0, 3).join(" ");
  const personal = !investorIsFirmName(vc);
  const out: PlannedQuery[] = [];

  if (personal) out.push({ id: "Q1", provider: "langsearch", query: `"${clean(vc.investor_name)}" "${firm}" ${kw}` });
  out.push({ id: "Q2", provider: "langsearch", query: `${firm} investment funding ${kw} startup` });
  if (personal) {
    out.push({ id: "Q3", provider: "langsearch", query: `"${clean(vc.investor_name)}" interview podcast panel speaker conference` });
  } else {
    // Firm-only rows: use the third LangSearch slot for firm appearances instead of a partner query.
    out.push({ id: "Q3", provider: "langsearch", query: `"${firm}" partner interview podcast panel conference` });
  }
  const orTerms = terms.slice(0, 4).map((t) => (t.includes(" ") ? `"${t}"` : t)).join(" OR ");
  out.push({ id: "Q4", provider: "google_news_rss", query: `"${firm}" (${orTerms}) when:${config.lookbackDays}d` });
  if (personal) {
    out.push({ id: "Q5", provider: "google_news_rss", query: `"${clean(vc.investor_name)}" when:${config.lookbackDays}d` });
  } else {
    // Firm-only rows leave this slot empty. Q4 needs a sector word next to the firm name, which misses fund and portfolio news
    // that the classifier would still accept; this plain firm-news query (free, no search quota) widens recall.
    out.push({ id: "Q8", provider: "google_news_rss", query: `"${firm}" (raises OR invests OR "led by" OR "new fund" OR portfolio) when:${config.lookbackDays}d` });
  }
  const base = out.slice(0, config.maxQueriesPerVc);
  // Extra, bounded searches: associated partners (news, last 30 days) and, about monthly, a one-year history search for the time series.
  const others = (vc.people ?? []).filter((p) => normText(p.name) !== normText(vc.investor_name)).slice(0, 2).map((p) => `"${clean(p.name)}"`);
  if (others.length) base.push({ id: "Q6", provider: "google_news_rss", query: `(${others.join(" OR ")}) "${firm}" when:${config.lookbackDays}d` });
  if (opts.backfill) base.push({ id: "Q7", provider: "langsearch", freshness: "oneYear", query: `${firm} investment funding ${kw} startup announced` });
  return base;
}
