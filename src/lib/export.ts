import { db } from "@/lib/db/client";
import { scoreSignals, signalDate } from "@/lib/scoring/score";
import type { StoredSignal } from "@/lib/types";

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    let s = v == null ? "" : Array.isArray(v) ? v.join("|") : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection from web-sourced text
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

/** Same columns the importer understands, so an export can be re-imported (round trip). */
export async function exportPipeline(): Promise<string> {
  const { data } = await db().from("vc_pipeline").select("*").order("firm_name");
  const { data: contacts } = await db().from("vc_contacts").select("vc_id, email, profile_url");
  const first = new Map<string, { email: string | null; profile_url: string | null }>();
  for (const c of contacts ?? []) if (!first.has(c.vc_id)) first.set(c.vc_id, c);
  const rows = (data ?? []).map((v) => ({ ...v, email: first.get(v.id)?.email ?? "", profile_url: first.get(v.id)?.profile_url ?? "" }));
  return toCsv(rows, [
    "investor_name", "firm_name", "firm_domain", "investment_thesis", "sector_keywords", "contact_status", "last_contact_at",
    "contact_history", "personal_notes", "email", "profile_url", "last_signal_date", "signal_summary", "follow_up_score", "recommended_action",
  ]);
}

export async function exportEvidence(): Promise<string> {
  const { data: signals } = await db().from("vc_signals").select("*");
  const { data: vcs } = await db().from("vc_pipeline").select("id, investor_name, firm_name");
  const name = new Map((vcs ?? []).map((v) => [v.id, v]));
  const now = new Date();
  const byVc = new Map<string, StoredSignal[]>();
  for (const s of (signals ?? []) as (StoredSignal & { vc_id: string })[]) byVc.set(s.vc_id, [...(byVc.get(s.vc_id) ?? []), s]);
  const rows: Record<string, unknown>[] = [];
  for (const [vcId, list] of byVc) {
    const scored = scoreSignals(list, now);
    for (const it of scored.items) {
      const s = it.signal;
      rows.push({
        firm_name: name.get(vcId)?.firm_name, investor_name: name.get(vcId)?.investor_name, title: s.title, source_url: s.source_url,
        source_domain: s.source_domain, source_tier: s.source_tier, signal_type: s.signal_type, date: signalDate(s)?.toISOString().slice(0, 10),
        confidence: s.confidence, evidence_basis: s.evidence_basis, relevance: s.relevance_score, verification_status: s.verification_status,
        points: it.counted ? it.contribution.toFixed(1) : 0, evidence_summary: s.evidence_summary, evidence_quote: s.evidence_quote,
      });
    }
  }
  return toCsv(rows, ["firm_name", "investor_name", "title", "source_url", "source_domain", "source_tier", "signal_type", "date", "confidence", "evidence_basis", "relevance", "verification_status", "points", "evidence_summary", "evidence_quote"]);
}
