import { db } from "./client";

/**
 * USER-initiated writes to vc_pipeline (CSV/CRM import merge rules and undo). Each goes through an allow-listed
 * Postgres function or a plain INSERT of NEW rows. None can touch last_signal_date, signal_summary,
 * follow_up_score or recommended_action, and the scanner never imports this file.
 */

export interface NewVcRow {
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

export async function insertNewVcs(rows: NewVcRow[]): Promise<{ id: string; investor_name: string; firm_name: string }[]> {
  if (!rows.length) return [];
  const { data, error } = await db().from("vc_pipeline").insert(rows).select("id, investor_name, firm_name");
  if (error) throw new Error(`insertNewVcs: ${error.message}`);
  return data ?? [];
}

/** Merge rule: fills only fields that are currently blank in the database. */
export async function fillBlanks(vcId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db().rpc("import_fill_blanks", { p_vc_id: vcId, p_patch: patch });
  if (error) throw new Error(`import_fill_blanks: ${error.message}`);
}

/** Applies the single value the founder chose while resolving a conflict. */
export async function applyResolution(vcId: string, field: string, value: string): Promise<void> {
  const { error } = await db().rpc("import_apply_resolution", { p_vc_id: vcId, p_field: field, p_value: value });
  if (error) throw new Error(`import_apply_resolution: ${error.message}`);
}

export async function deleteVcByUser(vcId: string): Promise<void> {
  const { error } = await db().rpc("user_delete_vc", { p_vc_id: vcId });
  if (error) throw new Error(`user_delete_vc: ${error.message}`);
}
