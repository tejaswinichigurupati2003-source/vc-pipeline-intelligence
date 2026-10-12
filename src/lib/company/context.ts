import { db } from "@/lib/db/client";

/** What the investor finder is allowed to know about the company: descriptors only. No metrics, notes or documents. */
export interface CompanyContext {
  name: string;
  sector: string;
  productSummary: string;
  targetCustomer: string;
  geography: string[];
  businessModel: string;
  stage: string;
  round: string;
  amount: number | null;
  currency: string;
  isSynthetic: boolean;
}

interface ProfileRow {
  name: string | null; sector: string | null; product_summary: string | null; target_customer: string | null; geography: string[] | null;
  business_model: string | null; stage: string | null; fundraising_round: string | null; fundraising_amount: number | null;
  fundraising_currency: string | null; is_synthetic: boolean;
}

export const EMPTY_CONTEXT: CompanyContext = {
  name: "", sector: "", productSummary: "", targetCustomer: "", geography: [], businessModel: "", stage: "", round: "", amount: null, currency: "USD", isSynthetic: false,
};

export function fromRow(r: ProfileRow | null): CompanyContext {
  if (!r) return { ...EMPTY_CONTEXT };
  return {
    name: r.name ?? "", sector: r.sector ?? "", productSummary: r.product_summary ?? "", targetCustomer: r.target_customer ?? "",
    geography: r.geography ?? [], businessModel: r.business_model ?? "", stage: r.stage ?? "", round: r.fundraising_round ?? "",
    amount: r.fundraising_amount, currency: r.fundraising_currency ?? "USD", isSynthetic: r.is_synthetic,
  };
}

export async function getCompanyContext(): Promise<CompanyContext> {
  const { data } = await db().from("company_profile").select("*").eq("id", "primary").maybeSingle();
  return fromRow(data as ProfileRow | null);
}

/** Enough to search with: a sector or a product description. */
export const isUsableContext = (c: CompanyContext) => !!(c.sector.trim() || c.productSummary.trim());

export async function saveCompanyContext(c: Partial<CompanyContext>): Promise<void> {
  const cur = await getCompanyContext();
  const m = { ...cur, ...c };
  const { error } = await db().from("company_profile").upsert({
    id: "primary", name: m.name || null, sector: m.sector || null, product_summary: m.productSummary || null, target_customer: m.targetCustomer || null,
    geography: m.geography, business_model: m.businessModel || null, stage: m.stage || null, fundraising_round: m.round || null,
    fundraising_amount: m.amount, fundraising_currency: m.currency || "USD", is_synthetic: m.isSynthetic, updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

// ---- turning the profile into search language (pure) ---------------------------------------------------------------

const STOP = new Set(["and", "the", "for", "with", "that", "this", "from", "into", "their", "your", "our", "its", "are", "has", "have", "can", "all", "one", "per", "between", "mid", "market", "companies", "company", "planned", "expansion", "ambition", "stage", "fundraising", "round", "software"]);

// Light synonym groups so a profile written in the founder's words still searches the way investors write.
const SYNONYMS: [RegExp, string[]][] = [
  [/logistic|freight|shipment|supply.?chain|forward/, ["logistics", "supply chain", "freight"]],
  [/saas|software|subscription/, ["B2B SaaS"]],
  [/fintech|payment|lending|banking/, ["fintech"]],
  [/health|medical|clinic|pharma/, ["healthtech"]],
  [/educat|learning|school/, ["edtech"]],
  [/\bai\b|machine learning|artificial/, ["AI"]],
  [/climate|energy|carbon|ev\b/, ["climate tech"]],
  [/agri|farm|food/, ["agritech"]],
];

export function sectorTerms(c: CompanyContext): string[] {
  const text = `${c.sector} ${c.productSummary} ${c.targetCustomer} ${c.businessModel}`.toLowerCase();
  const out: string[] = [];
  for (const [re, terms] of SYNONYMS) if (re.test(text)) for (const t of terms) if (!out.includes(t)) out.push(t);
  for (const w of text.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)) {
    if (w.length > 3 && !STOP.has(w) && !out.some((o) => o.toLowerCase().includes(w)) && out.length < 8) out.push(w);
  }
  return out.slice(0, 8);
}

const REGIONS = ["southeast asia", "south asia", "india", "asia", "united states", "usa", "europe", "uk", "middle east", "africa", "latin america", "singapore", "indonesia", "global"];

export function geographyTerms(c: CompanyContext): string[] {
  const text = c.geography.join(" ").toLowerCase();
  const out = REGIONS.filter((r) => new RegExp(`\\b${r}\\b`).test(text)).map((r) => (r === "usa" || r === "uk" ? r.toUpperCase() : r.replace(/\b\w/g, (m) => m.toUpperCase())));
  // "Asia" adds nothing when "Southeast Asia" is already present
  return out.filter((r) => !(r === "Asia" && out.includes("Southeast Asia")));
}

export function stageTerms(c: CompanyContext): string[] {
  const t = `${c.stage} ${c.round}`.toLowerCase();
  const out: string[] = [];
  if (/pre-?seed/.test(t)) out.push("pre-seed");
  if (/\bseed\b/.test(t)) out.push("seed");
  if (/series a/.test(t)) out.push("series A");
  if (/series b/.test(t)) out.push("series B");
  return out.length ? out : ["early-stage"];
}
