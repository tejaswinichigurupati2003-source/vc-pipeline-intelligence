import { geographyTerms, sectorTerms, stageTerms, type CompanyContext } from "@/lib/company/context";

/**
 * Deterministic fit between a discovered investor and the company. The model never scores: it only extracts text; this
 * function reads that text. Sector 35 + stage 25 + geography 20 + recency 20.
 */
export const ACCEPT_MIN_FIT = 45;

export interface FitResult {
  score: number;
  parts: { sector: number; stage: number; geography: number; recency: number };
  matched: { sector: string[]; geography: string[]; stage: string[] };
}

const has = (text: string, term: string) => new RegExp(`(^|[^a-z0-9])${term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
const DAY = 86_400_000;

export function scoreFit(args: { text: string; stageFocus: string | null; dates: (string | null)[]; ctx: CompanyContext; now: Date }): FitResult {
  const text = args.text.toLowerCase();
  const stageText = `${args.stageFocus ?? ""} ${text}`.toLowerCase();

  const sectorMatched = sectorTerms(args.ctx).filter((t) => has(text, t));
  const sector = sectorMatched.length >= 2 ? 35 : sectorMatched.length === 1 ? 20 : 0;

  const myStages = stageTerms(args.ctx);
  const stageMatched = myStages.filter((s) => has(stageText, s));
  const growthOnly = /\b(growth|late[- ]stage|series [c-z]|pre-ipo|buyout)\b/.test(stageText) && !/\b(seed|early|pre-seed|series a)\b/.test(stageText);
  const stage = stageMatched.length ? 25 : growthOnly ? 0 : /\bearly\b/.test(stageText) ? 15 : 5;

  const geoMatched = geographyTerms(args.ctx).filter((g) => has(text, g));
  const geography = geoMatched.length ? 20 : /\bglobal\b/.test(text) ? 10 : 0;

  const times = args.dates.map((d) => (d ? new Date(d).getTime() : NaN)).filter((n) => !isNaN(n));
  const newest = times.length ? Math.max(...times) : null;
  const age = newest === null ? null : (args.now.getTime() - newest) / DAY;
  const recency = age === null ? 3 : age <= 30 ? 20 : age <= 90 ? 12 : age <= 180 ? 6 : 0;

  return { score: sector + stage + geography + recency, parts: { sector, stage, geography, recency }, matched: { sector: sectorMatched, geography: geoMatched, stage: stageMatched } };
}

/** One plain sentence on why this investor fits, built only from what matched. */
export function explainFit(fit: FitResult, role: string, ctx: CompanyContext): string {
  const bits: string[] = [];
  if (fit.matched.sector.length) bits.push(`works in ${fit.matched.sector.slice(0, 3).join(", ")}`);
  if (fit.matched.stage.length) bits.push(`invests at ${fit.matched.stage[0]}`);
  else if (fit.parts.stage >= 15) bits.push("invests early");
  if (fit.matched.geography.length) bits.push(`active in ${fit.matched.geography.slice(0, 2).join(" and ")}`);
  const recent = fit.parts.recency >= 12 ? "recent activity" : null;
  if (recent) bits.push(recent);
  const lead = role === "led_round" ? "Led a round" : role === "participated" ? "Took part in a round" : "States a focus";
  return `${lead} that fits ${ctx.name || "your company"}: ${bits.length ? bits.join(", ") : "a general match"}.`;
}
