import type { CompanyContext } from "@/lib/company/context";
import { normText } from "@/lib/discovery/normalize";
import { quoteInSource } from "@/lib/verification/validate";
import { type ExistingIndex, isExisting, isGenericName, firmKey } from "./dedupe";
import type { ExtractedInvestor, ExtractionPage } from "./extract";
import { ACCEPT_MIN_FIT, explainFit, scoreFit } from "./fit";

export interface Evidence { url: string; title: string; domain: string; date: string | null; quote: string; role: string }

export interface AcceptedSuggestion {
  firmKey: string;
  firmName: string;
  investorType: string;
  thesisSummary: string | null;
  stageFocus: string | null;
  geography: string | null;
  fitScore: number;
  whyFit: string;
  evidence: Evidence;
}

export type Rejection = "mentioned_only" | "not_in_page" | "no_quote" | "generic" | "is_company" | "already_listed" | "low_fit" | "other_type";

/**
 * Code, not the model, decides. The investor must be named in the page, the quote must be verbatim and contain the name,
 * and the deterministic fit score must clear the bar. Anything else is dropped with a reason.
 */
export function validateInvestor(
  inv: ExtractedInvestor, page: ExtractionPage, ctx: CompanyContext, existing: ExistingIndex, now: Date,
): { ok: true; suggestion: AcceptedSuggestion } | { ok: false; reason: Rejection } {
  const name = inv.name.trim();
  if (inv.role === "mentioned_only") return { ok: false, reason: "mentioned_only" };
  if (inv.investor_type === "other") return { ok: false, reason: "other_type" };
  if (isGenericName(name)) return { ok: false, reason: "generic" };
  if (ctx.name && firmKey(name) === firmKey(ctx.name)) return { ok: false, reason: "is_company" };
  if (!normText(page.text).includes(normText(name))) return { ok: false, reason: "not_in_page" };
  const quote = inv.evidence_quote?.trim() ?? "";
  if (!quoteInSource(quote, page.text) || !normText(quote).includes(normText(name))) return { ok: false, reason: "no_quote" };
  if (isExisting(name, null, existing)) return { ok: false, reason: "already_listed" };

  const fit = scoreFit({ text: `${page.title} ${page.text}`, stageFocus: inv.stage_focus ?? null, dates: [page.date], ctx, now });
  if (fit.score < ACCEPT_MIN_FIT || fit.parts.sector === 0) return { ok: false, reason: "low_fit" };

  return {
    ok: true,
    suggestion: {
      firmKey: firmKey(name), firmName: name, investorType: inv.investor_type,
      thesisSummary: inv.thesis_summary?.trim() || null, stageFocus: inv.stage_focus?.trim() || null, geography: inv.geography?.trim() || null,
      fitScore: fit.score, whyFit: explainFit(fit, inv.role, ctx),
      evidence: { url: page.url, title: page.title, domain: page.domain, date: page.date, quote, role: inv.role },
    },
  };
}

/** Same firm seen on several pages: keep the strongest fit, merge distinct evidence (max 4 links). */
export function mergeSuggestions(list: AcceptedSuggestion[]): (AcceptedSuggestion & { evidenceAll: Evidence[] })[] {
  const by = new Map<string, AcceptedSuggestion & { evidenceAll: Evidence[] }>();
  for (const s of list) {
    const cur = by.get(s.firmKey);
    if (!cur) { by.set(s.firmKey, { ...s, evidenceAll: [s.evidence] }); continue; }
    if (!cur.evidenceAll.some((e) => e.url === s.evidence.url) && cur.evidenceAll.length < 4) cur.evidenceAll.push(s.evidence);
    if (s.fitScore > cur.fitScore) Object.assign(cur, { fitScore: s.fitScore, whyFit: s.whyFit, thesisSummary: s.thesisSummary ?? cur.thesisSummary, stageFocus: s.stageFocus ?? cur.stageFocus });
  }
  return [...by.values()].sort((a, b) => b.fitScore - a.fitScore);
}
