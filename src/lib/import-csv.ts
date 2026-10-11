/** Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((c) => c !== "")) rows.push(row); }
  const [head, ...rest] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const STATUSES = ["yet_to_reach_out", "waiting_for_response", "in_conversation", "closed"];

export interface ImportRow {
  investor_name: string;
  firm_name: string;
  firm_domain: string | null;
  investment_thesis: string | null;
  sector_keywords: string[];
  contact_status: string;
  last_contact_at: string | null;
  contact_history: string | null;
  personal_notes: string | null;
}

export function toImportRows(raw: Record<string, string>[]): { rows: ImportRow[]; skipped: string[] } {
  const rows: ImportRow[] = [];
  const skipped: string[] = [];
  for (const r of raw) {
    if (!r.investor_name || !r.firm_name) { skipped.push(`missing name: ${JSON.stringify(r).slice(0, 80)}`); continue; }
    const status = STATUSES.includes(r.contact_status) ? r.contact_status : "yet_to_reach_out";
    const d = r.last_contact_at ? new Date(r.last_contact_at) : null;
    rows.push({
      investor_name: r.investor_name,
      firm_name: r.firm_name,
      firm_domain: r.firm_domain || null,
      investment_thesis: r.investment_thesis || null,
      sector_keywords: r.sector_keywords ? r.sector_keywords.split("|").map((k) => k.trim()).filter(Boolean) : [],
      contact_status: status,
      last_contact_at: d && !isNaN(d.getTime()) ? d.toISOString() : null,
      contact_history: r.contact_history || null,
      personal_notes: r.personal_notes || null,
    });
  }
  return { rows, skipped };
}
