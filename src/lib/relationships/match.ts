/** Match email addresses to investor/firm records (spec 26.2/26.3). Pure. */

export interface MatchIndex {
  byEmail: Map<string, string>;     // exact email -> vc_id (founder-confirmed or imported)
  byDomain: Map<string, string>;    // firm_domain -> vc_id
  ambiguousDomains: Set<string>;    // domains shared by several VCs: never matched by domain alone
}

// Free-mail and platform domains say nothing about which firm someone works at.
export const GENERIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "live.com", "icloud.com", "proton.me",
  "protonmail.com", "rediffmail.com", "zoho.com", "calendar.google.com", "docs.google.com", "linkedin.com",
]);

export function buildMatchIndex(vcs: { id: string; firm_domain: string | null }[], contacts: { vc_id: string; email: string | null }[]): MatchIndex {
  const byEmail = new Map<string, string>();
  for (const c of contacts) if (c.email) byEmail.set(c.email.toLowerCase(), c.vc_id);
  const byDomain = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const v of vcs) {
    const d = v.firm_domain?.toLowerCase().replace(/^www\./, "");
    if (!d || GENERIC_DOMAINS.has(d)) continue;
    if (byDomain.has(d) && byDomain.get(d) !== v.id) ambiguous.add(d);
    else byDomain.set(d, v.id);
  }
  return { byEmail, byDomain, ambiguousDomains: ambiguous };
}

export function parseAddresses(header: string): string[] {
  return [...header.matchAll(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0].toLowerCase());
}

export interface Match { vcId: string; basis: "email" | "domain"; email: string }

/** Returns the first investor match among the given addresses. Exact email beats domain. Own addresses are skipped. */
export function matchAddresses(addresses: string[], idx: MatchIndex, ownEmails: string[] = []): Match | null {
  const own = new Set(ownEmails.map((e) => e.toLowerCase()));
  const cand = addresses.filter((a) => !own.has(a));
  for (const a of cand) {
    const v = idx.byEmail.get(a);
    if (v) return { vcId: v, basis: "email", email: a };
  }
  for (const a of cand) {
    const dom = a.split("@")[1];
    if (!dom || GENERIC_DOMAINS.has(dom) || idx.ambiguousDomains.has(dom)) continue;
    const v = idx.byDomain.get(dom) ?? [...idx.byDomain].find(([d]) => dom.endsWith("." + d))?.[1];
    if (v) return { vcId: v, basis: "domain", email: a };
  }
  return null;
}
