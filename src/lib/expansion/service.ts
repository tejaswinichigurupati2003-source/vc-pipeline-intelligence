import { getCompanyContext, sectorTerms } from "@/lib/company/context";
import { db } from "@/lib/db/client";
import { insertNewVcs } from "@/lib/db/user-writer";
import type { Evidence } from "./validate";

export interface SuggestionRow {
  id: string; firm_key: string; firm_name: string; firm_domain: string | null; investor_type: string | null; thesis_summary: string | null;
  why_fit: string | null; fit_score: number; stage_focus: string | null; geography: string | null; evidence: Evidence[]; times_seen: number;
  status: "new" | "added" | "dismissed"; vc_id: string | null; first_seen_at: string; last_seen_at: string;
}
export interface ExpansionRunRow {
  id: string; trigger_type: string; status: string; started_at: string; finished_at: string | null; queries: number; pages: number;
  suggestions_new: number; suggestions_updated: number; error: string | null;
}

export async function listSuggestions(): Promise<SuggestionRow[]> {
  const { data, error } = await db().from("investor_suggestions").select("*").order("fit_score", { ascending: false }).order("last_seen_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SuggestionRow[];
}

export async function lastRuns(n = 5): Promise<ExpansionRunRow[]> {
  const { data } = await db().from("expansion_runs").select("*").order("started_at", { ascending: false }).limit(n);
  return (data ?? []) as ExpansionRunRow[];
}

/** Add to the founder's list as a new, uncontacted investor. The only write to vc_pipeline is a NEW row. */
export async function addSuggestion(id: string): Promise<{ vcId: string }> {
  const { data: s } = await db().from("investor_suggestions").select("*").eq("id", id).maybeSingle();
  if (!s) throw new Error("Suggestion not found");
  if (s.status === "added" && s.vc_id) return { vcId: s.vc_id };
  const ctx = await getCompanyContext();
  const ev = ((s.evidence as Evidence[]) ?? [])[0];
  const [row] = await insertNewVcs([{
    investor_name: s.firm_name, firm_name: s.firm_name, firm_domain: s.firm_domain ?? null,
    investment_thesis: s.thesis_summary ?? null, sector_keywords: sectorTerms(ctx).slice(0, 8), contact_status: "yet_to_reach_out",
    last_contact_at: null, contact_history: null,
    personal_notes: `Found by investor discovery. ${s.why_fit ?? ""}${ev ? ` Source: ${ev.url}` : ""}`.trim(),
  }]);
  const { error } = await db().from("investor_suggestions").update({ status: "added", vc_id: row.id, decided_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  return { vcId: row.id };
}

export async function setSuggestionStatus(id: string, status: "dismissed" | "new"): Promise<void> {
  const { error } = await db().from("investor_suggestions").update({ status, decided_at: status === "new" ? null : new Date().toISOString() }).eq("id", id).neq("status", "added");
  if (error) throw new Error(error.message);
}
