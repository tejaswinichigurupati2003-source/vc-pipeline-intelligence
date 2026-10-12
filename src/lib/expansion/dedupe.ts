import { domainOf, firmNameForms, normText } from "@/lib/discovery/normalize";

/**
 * Same firm under different names must collapse to one key: "Accel", "Accel India" and "Accel Partners" are one investor.
 * Strips legal and generic suffixes after normalising accents and punctuation.
 */
const SUFFIX = new Set([
  "ventures", "venture", "partners", "partner", "capital", "fund", "funds", "vc", "management", "advisors", "advisory", "investments", "investment",
  "india", "group", "llp", "ltd", "pvt", "inc", "labs", "holdings", "the", "global", "asia", "us",
]);

export function firmKey(name: string): string {
  const words = normText(name).split(" ").filter(Boolean);
  const core = words.filter((w) => !SUFFIX.has(w));
  return (core.length ? core : words).join(" ");
}

/** Things a model might return that are categories, not firms. */
const GENERIC = new Set(["investors", "investor", "venture capital", "venture capital firms", "vc firms", "vcs", "angel investors", "existing investors", "new investors", "several investors", "a group of investors", "private equity", "family offices", "undisclosed investors"]);

export const isGenericName = (name: string) => {
  const n = normText(name);
  return n.length < 2 || GENERIC.has(n) || /^(a|an|the|other|several|various|existing|new|undisclosed)\b/.test(n);
};

export interface ExistingInvestor { investor_name: string; firm_name: string; firm_domain: string | null; aliases?: string[] }

export interface ExistingIndex { keys: Set<string>; domains: Set<string> }

export function buildExistingIndex(rows: ExistingInvestor[]): ExistingIndex {
  const keys = new Set<string>(), domains = new Set<string>();
  for (const r of rows) {
    for (const n of [...firmNameForms(r.firm_name), ...firmNameForms(r.investor_name), ...(r.aliases ?? [])]) {
      const k = firmKey(n);
      if (k) keys.add(k);
    }
    if (r.firm_domain) domains.add(domainOf(`https://${r.firm_domain}`) || r.firm_domain.toLowerCase());
  }
  return { keys, domains };
}

export function isExisting(name: string, domain: string | null, idx: ExistingIndex): boolean {
  if (idx.keys.has(firmKey(name))) return true;
  return !!domain && idx.domains.has(domain.toLowerCase().replace(/^www\./, ""));
}
