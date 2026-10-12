/** Column mapping + validation for CSV import (spec 26.1). Pure functions. */

export const TARGET_FIELDS = [
  "investor_name", "firm_name", "firm_domain", "investment_thesis", "sector_keywords",
  "contact_status", "last_contact_at", "contact_history", "personal_notes", "email", "profile_url",
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];
/** Plain-language names for the fields shown in the import screens. */
export const FIELD_LABEL: Record<string, string> = {
  investor_name: "Investor name", firm_name: "Firm", firm_domain: "Website", investment_thesis: "Thesis", sector_keywords: "Sectors",
  contact_status: "Stage", last_contact_at: "Last contact", contact_history: "Contact history", personal_notes: "Notes", email: "Email", profile_url: "Profile link",
};
export type Mapping = Partial<Record<TargetField, string>>; // target field -> CSV header

const SYNONYMS: Record<TargetField, string[]> = {
  investor_name: ["investor_name", "investor", "partner", "partner_name", "contact_name", "person", "name"],
  firm_name: ["firm_name", "firm", "fund", "fund_name", "vc", "vc_firm", "company", "organisation", "organization"],
  firm_domain: ["firm_domain", "domain", "website", "site", "url", "firm_website"],
  investment_thesis: ["investment_thesis", "thesis", "focus", "investment_focus", "description"],
  sector_keywords: ["sector_keywords", "sectors", "keywords", "tags", "industries"],
  contact_status: ["contact_status", "status", "stage", "pipeline_status", "relationship"],
  last_contact_at: ["last_contact_at", "last_contact", "last_contacted", "last_contacted_on", "last_touch"],
  contact_history: ["contact_history", "history", "interactions", "activity"],
  personal_notes: ["personal_notes", "notes", "note", "comments", "remarks"],
  email: ["email", "email_address", "e_mail", "contact_email"],
  profile_url: ["profile_url", "linkedin", "linkedin_url", "profile", "twitter", "x_profile"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Suggest a mapping from CSV headers. Exact synonym match wins; each header is used once. */
export function autoMap(headers: string[]): Mapping {
  const used = new Set<string>();
  const out: Mapping = {};
  for (const field of TARGET_FIELDS) {
    for (const syn of SYNONYMS[field]) {
      const h = headers.find((x) => norm(x) === syn && !used.has(x));
      if (h) { out[field] = h; used.add(h); break; }
    }
  }
  return out;
}

export interface NormalizedRow {
  investor_name: string;
  firm_name: string;
  firm_domain: string | null;
  investment_thesis: string | null;
  sector_keywords: string[];
  contact_status: string | null; // null = not provided
  last_contact_at: string | null;
  contact_history: string | null;
  personal_notes: string | null;
  email: string | null;
  profile_url: string | null;
}

export interface RowIssue { level: "error" | "warning"; message: string }

const STATUS_MAP: Record<string, string> = {
  yet_to_reach_out: "yet_to_reach_out", not_contacted: "yet_to_reach_out", new: "yet_to_reach_out", todo: "yet_to_reach_out", to_contact: "yet_to_reach_out",
  waiting_for_response: "waiting_for_response", waiting: "waiting_for_response", contacted: "waiting_for_response", reached_out: "waiting_for_response", awaiting_reply: "waiting_for_response",
  in_conversation: "in_conversation", in_talks: "in_conversation", meeting: "in_conversation", active: "in_conversation", diligence: "in_conversation",
  closed: "closed", passed: "closed", declined: "closed", dead: "closed", invested: "closed",
};

export function normalizeStatus(raw: string): string | null {
  return STATUS_MAP[norm(raw)] ?? null;
}

export function normalizeDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!u.hostname.includes(".")) return null;
    u.hash = ""; u.search = "";
    return (u.hostname.replace(/^www\./, "").toLowerCase() + u.pathname.replace(/\/$/, "")).toLowerCase();
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseDateLoose(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])).toISOString();
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // day-first (India)
  if (dmy) return new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1])).toISOString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
}

export function normalizeRow(raw: Record<string, string>, mapping: Mapping): { row: NormalizedRow | null; issues: RowIssue[] } {
  const get = (f: TargetField) => (mapping[f] ? (raw[mapping[f]!] ?? "").trim() : "");
  const issues: RowIssue[] = [];
  let investor = get("investor_name");
  let firm = get("firm_name");
  if (!investor && !firm) return { row: null, issues: [{ level: "error", message: "No investor or firm name" }] };
  if (!firm) { firm = investor; issues.push({ level: "warning", message: "No firm name: using investor name as firm" }); }
  if (!investor) investor = firm; // same convention as the seed file when the partner is unknown

  const statusRaw = get("contact_status");
  let status: string | null = null;
  if (statusRaw) {
    status = normalizeStatus(statusRaw);
    if (!status) issues.push({ level: "warning", message: `Unrecognised status "${statusRaw}" ignored` });
  }
  const dateRaw = get("last_contact_at");
  const date = dateRaw ? parseDateLoose(dateRaw) : null;
  if (dateRaw && !date) issues.push({ level: "warning", message: `Unreadable date "${dateRaw}" ignored` });

  const domainRaw = get("firm_domain");
  const domain = domainRaw ? normalizeDomain(domainRaw) : null;
  if (domainRaw && !domain) issues.push({ level: "warning", message: `Invalid website "${domainRaw}" ignored` });

  const emailRaw = get("email").toLowerCase();
  const email = emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw : null;
  if (emailRaw && !email) issues.push({ level: "warning", message: `Invalid email "${emailRaw}" ignored` });

  const urlRaw = get("profile_url");
  const profile = urlRaw ? normalizeUrl(urlRaw) : null;
  if (urlRaw && !profile) issues.push({ level: "warning", message: `Invalid profile URL "${urlRaw}" ignored` });

  const kw = get("sector_keywords");
  return {
    row: {
      investor_name: investor, firm_name: firm, firm_domain: domain,
      investment_thesis: get("investment_thesis") || null,
      sector_keywords: kw ? kw.split(/[|;,]/).map((k) => k.trim()).filter(Boolean) : [],
      contact_status: status, last_contact_at: date,
      contact_history: get("contact_history") || null, personal_notes: get("personal_notes") || null,
      email, profile_url: profile,
    },
    issues,
  };
}
