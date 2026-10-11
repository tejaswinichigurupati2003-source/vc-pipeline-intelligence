import { normalizeRow, type Mapping, type NormalizedRow, type RowIssue } from "./mapping";

/** What the planner needs to know about a VC that already exists. */
export interface ExistingVc {
  id: string;
  investor_name: string;
  firm_name: string;
  firm_domain: string | null;
  investment_thesis: string | null;
  sector_keywords: string[];
  contact_status: string;
  last_contact_at: string | null;
  contact_history: string | null;
  personal_notes: string | null;
  emails: string[];
  profile_urls: string[];
}

export type MatchBasis = "name_and_firm" | "email" | "profile_url";
export type FieldName = "firm_domain" | "investment_thesis" | "sector_keywords" | "contact_status" | "last_contact_at" | "contact_history" | "personal_notes";

export interface PlannedConflict { field: FieldName; existing: string; incoming: string }

export interface PlannedRow {
  index: number; // 1-based data row number
  action: "insert" | "merge" | "skip" | "invalid";
  matchBasis?: MatchBasis;
  vcId?: string;
  data?: NormalizedRow;
  fill: Partial<Record<FieldName, string | string[]>>; // blanks that will be filled (merge)
  conflicts: PlannedConflict[];
  issues: RowIssue[];
  /** Same firm already present under a different investor: inserted as a separate person, flagged for review. */
  possibleDuplicateOf?: { id: string; reason: string };
}

export interface ImportPlan {
  rows: PlannedRow[];
  summary: { total: number; insert: number; merge: number; skip: number; invalid: number; conflicts: number; ambiguous: number; filledFields: number };
}

const lc = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const nameKey = (investor: string, firm: string) => `${lc(investor)}|${lc(firm)}`;

const FIELDS: FieldName[] = ["firm_domain", "investment_thesis", "sector_keywords", "contact_status", "last_contact_at", "contact_history", "personal_notes"];

const asText = (v: string | string[] | null): string => (Array.isArray(v) ? v.join("|") : (v ?? ""));
const sameValue = (field: FieldName, a: string, b: string) =>
  field === "last_contact_at" ? a.slice(0, 10) === b.slice(0, 10)
    : field === "sector_keywords" ? lc(a.split("|").sort().join("|")) === lc(b.split("|").sort().join("|"))
    : lc(a) === lc(b);

/**
 * Dry-run planner. Merge rules (explicit, never silent overwrite):
 *  1. Match on investor+firm name, else email, else profile URL.
 *  2. Existing blank + incoming value -> FILL the blank.
 *  3. Both non-empty and different -> CONFLICT for the founder to resolve; existing value stays.
 *  4. Identical -> nothing.
 *  Same firm under a different investor is a separate row, flagged as a possible duplicate.
 */
export function planImport(rawRows: Record<string, string>[], mapping: Mapping, existing: ExistingVc[]): ImportPlan {
  const byName = new Map(existing.map((e) => [nameKey(e.investor_name, e.firm_name), e]));
  const byEmail = new Map<string, ExistingVc>();
  const byProfile = new Map<string, ExistingVc>();
  const byFirm = new Map<string, ExistingVc>();
  for (const e of existing) {
    e.emails.forEach((m) => byEmail.set(lc(m), e));
    e.profile_urls.forEach((p) => byProfile.set(lc(p), e));
    if (!byFirm.has(lc(e.firm_name))) byFirm.set(lc(e.firm_name), e);
  }
  const byDomain = new Map<string, ExistingVc>();
  for (const e of existing) if (e.firm_domain && !byDomain.has(lc(e.firm_domain))) byDomain.set(lc(e.firm_domain), e);

  const seenInFile = new Set<string>();
  const rows: PlannedRow[] = [];

  rawRows.forEach((raw, i) => {
    const index = i + 1;
    const { row, issues } = normalizeRow(raw, mapping);
    if (!row) return rows.push({ index, action: "invalid", fill: {}, conflicts: [], issues });

    const key = nameKey(row.investor_name, row.firm_name);
    if (seenInFile.has(key)) {
      issues.push({ level: "warning", message: "Duplicate of an earlier row in this file: skipped" });
      return rows.push({ index, action: "skip", data: row, fill: {}, conflicts: [], issues });
    }
    seenInFile.add(key);

    let match: ExistingVc | undefined = byName.get(key);
    let basis: MatchBasis | undefined = match ? "name_and_firm" : undefined;
    if (!match && row.email && byEmail.has(row.email)) { match = byEmail.get(row.email); basis = "email"; }
    if (!match && row.profile_url && byProfile.has(row.profile_url)) { match = byProfile.get(row.profile_url); basis = "profile_url"; }

    if (!match) {
      const firmHit = byFirm.get(lc(row.firm_name)) ?? (row.firm_domain ? byDomain.get(lc(row.firm_domain)) : undefined);
      const planned: PlannedRow = { index, action: "insert", data: row, fill: {}, conflicts: [], issues };
      if (firmHit) {
        planned.possibleDuplicateOf = { id: firmHit.id, reason: `Firm already tracked under "${firmHit.investor_name}"` };
        issues.push({ level: "warning", message: `Possible duplicate: ${firmHit.firm_name} is already tracked under "${firmHit.investor_name}". Added as a separate person; review.` });
      }
      return rows.push(planned);
    }

    const incoming: Record<FieldName, string | string[] | null> = {
      firm_domain: row.firm_domain, investment_thesis: row.investment_thesis, sector_keywords: row.sector_keywords.length ? row.sector_keywords : null,
      contact_status: row.contact_status, last_contact_at: row.last_contact_at, contact_history: row.contact_history, personal_notes: row.personal_notes,
    };
    const current: Record<FieldName, string> = {
      firm_domain: match.firm_domain ?? "", investment_thesis: match.investment_thesis ?? "", sector_keywords: match.sector_keywords.join("|"),
      contact_status: match.contact_status, last_contact_at: match.last_contact_at ?? "", contact_history: match.contact_history ?? "", personal_notes: match.personal_notes ?? "",
    };
    const fill: PlannedRow["fill"] = {};
    const conflicts: PlannedConflict[] = [];
    for (const f of FIELDS) {
      const inc = incoming[f];
      const incText = asText(inc);
      if (!incText) continue;
      const cur = current[f];
      // contact_status always has a value (default), so a differing import is a conflict, never a fill.
      if (!cur) fill[f] = inc as string | string[];
      else if (!sameValue(f, cur, incText)) conflicts.push({ field: f, existing: cur, incoming: incText });
    }
    const changed = Object.keys(fill).length > 0 || conflicts.length > 0 || !!(row.email && !match.emails.includes(row.email)) || !!(row.profile_url && !match.profile_urls.includes(row.profile_url));
    rows.push({ index, action: changed ? "merge" : "skip", matchBasis: basis, vcId: match.id, data: row, fill, conflicts, issues: changed ? issues : [...issues, { level: "warning", message: "Already up to date" }] });
  });

  const summary = {
    total: rows.length,
    insert: rows.filter((r) => r.action === "insert").length,
    merge: rows.filter((r) => r.action === "merge").length,
    skip: rows.filter((r) => r.action === "skip").length,
    invalid: rows.filter((r) => r.action === "invalid").length,
    conflicts: rows.reduce((n, r) => n + r.conflicts.length, 0),
    ambiguous: rows.filter((r) => r.possibleDuplicateOf).length,
    filledFields: rows.reduce((n, r) => n + Object.keys(r.fill).length, 0),
  };
  return { rows, summary };
}
