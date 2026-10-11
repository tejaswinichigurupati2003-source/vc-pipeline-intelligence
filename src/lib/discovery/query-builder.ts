import { config } from "@/lib/config";
import { investorIsFirmName } from "./normalize";
import type { VcProfile } from "@/lib/types";

export interface PlannedQuery {
  id: "Q1" | "Q2" | "Q3" | "Q4" | "Q5";
  provider: "langsearch" | "google_news_rss";
  query: string;
}

const clean = (s: string) => s.replace(/["()]/g, " ").replace(/\s+/g, " ").trim();
/** "Z47 (Matrix Partners India)" -> "Z47" */
const firmShort = (firm: string) => clean(firm.replace(/\([^)]*\)/, ""));

export function sectorTerms(vc: VcProfile): string[] {
  const own = vc.sector_keywords.map(clean).filter(Boolean);
  return own.length ? own : ["logistics", "supply chain", "freight"];
}

/** Deterministic query templates (spec 7.3). Capped at MAX_QUERIES_PER_VC. */
export function buildQueries(vc: VcProfile): PlannedQuery[] {
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
  }
  return out.slice(0, config.maxQueriesPerVc);
}
