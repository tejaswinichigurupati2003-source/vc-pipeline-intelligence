/**
 * Thesis fit (0-100): a transparent keyword heuristic over the founder's OWN thesis notes, not a prediction of interest.
 * Assumptions are shown on the dashboard. Stage 40 + geography 30 + sector 30.
 */
export interface FitInput {
  investment_thesis: string | null;
  sector_keywords: string[];
  firm_name: string;
}

export const FIT_ASSUMPTIONS = [
  "Founder: B2B logistics / supply-chain SaaS, Seed stage, India.",
  "Stage (40 pts): thesis mentions seed, pre-seed or early stage.",
  "Geography (30 pts): thesis mentions India or Asia.",
  "Sector (30 pts): thesis mentions logistics, supply chain, freight, warehouse or B2B SaaS terms (15 pts each, max 2).",
  "Based only on the thesis text in your tracker. A generic thesis scores low even if the firm is a good fit: improve the notes to improve this score.",
];

const SECTOR_TERMS = ["logistics", "supply chain", "freight", "warehouse", "fleet", "b2b saas", "enterprise", "saas", "mobility"];

export function fitScore(v: FitInput): { score: number; parts: { stage: number; geography: number; sector: number } } {
  const t = ` ${(v.investment_thesis ?? "").toLowerCase()} `;
  const stage = /\b(pre-?seed|seed|early[- ]stage|early)\b/.test(t) ? 40 : 0;
  const geography = /\b(india|asia|southeast asia|bharat)\b/.test(t) ? 30 : 0;
  const hits = SECTOR_TERMS.filter((k) => t.includes(k)).length;
  const sector = Math.min(30, hits * 15);
  return { score: stage + geography + sector, parts: { stage, geography, sector } };
}
