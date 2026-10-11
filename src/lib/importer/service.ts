import { db } from "@/lib/db/client";
import { applyResolution, deleteVcByUser, fillBlanks, insertNewVcs } from "@/lib/db/user-writer";
import { parseCsv } from "@/lib/import-csv";
import { autoMap, type Mapping } from "./mapping";
import { planImport, type ExistingVc, type ImportPlan } from "./plan";

export async function loadExisting(): Promise<ExistingVc[]> {
  const { data: vcs, error } = await db()
    .from("vc_pipeline")
    .select("id, investor_name, firm_name, firm_domain, investment_thesis, sector_keywords, contact_status, last_contact_at, contact_history, personal_notes");
  if (error) throw new Error(error.message);
  const { data: contacts } = await db().from("vc_contacts").select("vc_id, email, profile_url");
  const emails = new Map<string, string[]>(), urls = new Map<string, string[]>();
  for (const c of contacts ?? []) {
    if (c.email) emails.set(c.vc_id, [...(emails.get(c.vc_id) ?? []), c.email]);
    if (c.profile_url) urls.set(c.vc_id, [...(urls.get(c.vc_id) ?? []), c.profile_url]);
  }
  return (vcs ?? []).map((v) => ({ ...v, sector_keywords: v.sector_keywords ?? [], emails: emails.get(v.id) ?? [], profile_urls: urls.get(v.id) ?? [] }));
}

export interface Preview { headers: string[]; mapping: Mapping; plan: ImportPlan; sample: Record<string, string>[] }

/** Dry run: nothing is written. */
export async function previewImport(csv: string, mapping?: Mapping): Promise<Preview> {
  const rows = parseCsv(csv);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const m = mapping && Object.keys(mapping).length ? mapping : autoMap(headers);
  return { headers, mapping: m, plan: planImport(rows, m, await loadExisting()), sample: rows.slice(0, 3) };
}

export async function commitImport(csv: string, mapping: Mapping, filename: string | null, source: "csv" | "hubspot" = "csv") {
  const rows = parseCsv(csv);
  const plan = planImport(rows, mapping, await loadExisting()); // re-plan against fresh state, never trust a stale preview
  const toInsert = plan.rows.filter((r) => r.action === "insert" && r.data);
  const merges = plan.rows.filter((r) => r.action === "merge" && r.vcId && r.data);

  const { data: batch, error: be } = await db()
    .from("import_batches").insert({ source, filename, mapping, summary: plan.summary }).select("id").single();
  if (be) throw new Error(be.message);

  const created = await insertNewVcs(
    toInsert.map((r) => ({
      investor_name: r.data!.investor_name, firm_name: r.data!.firm_name, firm_domain: r.data!.firm_domain,
      investment_thesis: r.data!.investment_thesis, sector_keywords: r.data!.sector_keywords,
      contact_status: r.data!.contact_status ?? "yet_to_reach_out", last_contact_at: r.data!.last_contact_at,
      contact_history: r.data!.contact_history, personal_notes: r.data!.personal_notes,
    })),
  );
  const idByKey = new Map(created.map((c) => [`${c.investor_name.toLowerCase()}|${c.firm_name.toLowerCase()}`, c.id]));

  const contactRows: { vc_id: string; person_name: string; email: string | null; profile_url: string | null; source: string }[] = [];
  for (const r of toInsert) {
    const id = idByKey.get(`${r.data!.investor_name.toLowerCase()}|${r.data!.firm_name.toLowerCase()}`);
    if (id && (r.data!.email || r.data!.profile_url)) contactRows.push({ vc_id: id, person_name: r.data!.investor_name, email: r.data!.email, profile_url: r.data!.profile_url, source });
  }

  const conflictRows: Record<string, unknown>[] = [];
  let filled = 0;
  for (const r of merges) {
    if (Object.keys(r.fill).length) { await fillBlanks(r.vcId!, r.fill); filled += Object.keys(r.fill).length; }
    if (r.data!.email || r.data!.profile_url) contactRows.push({ vc_id: r.vcId!, person_name: r.data!.investor_name, email: r.data!.email, profile_url: r.data!.profile_url, source });
    for (const c of r.conflicts) {
      conflictRows.push({ batch_id: batch.id, vc_id: r.vcId, field: c.field, existing_value: c.existing, incoming_value: c.incoming, match_basis: r.matchBasis, source });
    }
  }
  // Emails are unique: ignore ones already linked to someone (they were matched/flagged by the planner).
  for (const c of contactRows) await db().from("vc_contacts").insert(c);
  if (conflictRows.length) await db().from("import_conflicts").insert(conflictRows);
  await db().from("import_batches").update({ created_vc_ids: created.map((c) => c.id), summary: { ...plan.summary, filled } }).eq("id", batch.id);
  return { batch_id: batch.id, inserted: created.length, merged: merges.length, filled_blank_fields: filled, conflicts_to_review: conflictRows.length, skipped: plan.summary.skip, invalid: plan.summary.invalid, possible_duplicates: plan.summary.ambiguous };
}

export async function resolveConflict(id: string, choice: "keep_existing" | "use_incoming" | "ignore") {
  const { data: c, error } = await db().from("import_conflicts").select("*").eq("id", id).maybeSingle();
  if (error || !c) throw new Error("conflict not found");
  if (c.status !== "pending") return c.status;
  if (choice === "use_incoming") await applyResolution(c.vc_id, c.field, c.incoming_value ?? "");
  const status = choice === "use_incoming" ? "used_incoming" : choice === "keep_existing" ? "kept_existing" : "ignored";
  await db().from("import_conflicts").update({ status, resolved_at: new Date().toISOString() }).eq("id", id);
  return status;
}

/** Undo a batch: removes the VC rows it CREATED (cascades their evidence). Merged-into existing rows are untouched. */
export async function revertBatch(batchId: string) {
  const { data: b } = await db().from("import_batches").select("created_vc_ids, status").eq("id", batchId).maybeSingle();
  if (!b || b.status === "reverted") throw new Error("batch not found or already reverted");
  for (const id of b.created_vc_ids as string[]) await deleteVcByUser(id);
  await db().from("import_batches").update({ status: "reverted" }).eq("id", batchId);
  return (b.created_vc_ids as string[]).length;
}
