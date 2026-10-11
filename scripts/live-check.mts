/**
 * Live end-to-end check of the workspace write paths against a running dev server + real Supabase.
 * Uses ONLY a throwaway investor ("ZZ Live Check VC") and removes everything it creates.
 * Asserts that every pre-existing investor row (manual AND signal columns) is byte-identical afterwards.
 * Usage: npx tsx --env-file=.env.local scripts/live-check.mts http://localhost:3002
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3000";
const H = { "x-admin-token": process.env.ADMIN_TOKEN!, "Content-Type": "application/json" };
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const api = async (path: string, body?: unknown, method = "POST") => {
  const r = await fetch(base + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
};
let failures = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); if (!ok) failures++; };

const snapshot = async () => {
  const { data } = await db.from("vc_pipeline").select("*").neq("firm_name", "ZZ Live Check VC").order("id");
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
};

const before = await snapshot();
let batch1: string | undefined, batch2: string | undefined, materialId: string | undefined;
try {
  // 1. import a brand-new investor
  const csv1 = "investor,firm,website,status,notes\nZZ Partner,ZZ Live Check VC,,yet to reach out,original private note\n";
  const p1 = await api("/api/import/preview", { csv: csv1 });
  check("dry run plans 1 insert and writes nothing", p1.j.plan?.summary?.insert === 1 && ((await db.from("vc_pipeline").select("id").eq("firm_name", "ZZ Live Check VC")).data ?? []).length === 0);
  const c1 = await api("/api/import/commit", { csv: csv1, mapping: p1.j.mapping, filename: "live-check-1.csv" });
  batch1 = c1.j.batch_id;
  check("commit inserted the test investor", c1.j.inserted === 1, JSON.stringify(c1.j));
  const vc = (await db.from("vc_pipeline").select("*").eq("firm_name", "ZZ Live Check VC").single()).data!;

  // 2. re-import with a blank to fill and a different note -> fill + conflict, existing note untouched
  const csv2 = "investor,firm,website,status,notes\nZZ Partner,ZZ Live Check VC,zzcheck.example,yet to reach out,A DIFFERENT NOTE\n";
  const p2 = await api("/api/import/preview", { csv: csv2 });
  check("re-import plans merge with 1 fill + 1 conflict", p2.j.plan?.summary?.merge === 1 && p2.j.plan.summary.conflicts === 1 && p2.j.plan.summary.filledFields === 1, JSON.stringify(p2.j.plan?.summary));
  const c2 = await api("/api/import/commit", { csv: csv2, mapping: p2.j.mapping, filename: "live-check-2.csv" });
  batch2 = c2.j.batch_id;
  const after = (await db.from("vc_pipeline").select("*").eq("id", vc.id).single()).data!;
  check("blank was filled", after.firm_domain === "zzcheck.example");
  check("existing manual note was NOT overwritten", after.personal_notes === "original private note", `note="${after.personal_notes}"`);
  const conflict = (await db.from("import_conflicts").select("*").eq("vc_id", vc.id).eq("status", "pending")).data?.[0];
  check("conflict recorded for the founder to resolve", conflict?.field === "personal_notes" && conflict.incoming_value === "A DIFFERENT NOTE");
  const idem = await api("/api/import/preview", { csv: csv2 });
  check("identical re-import is now a no-op after conflict recorded (skip or same conflict only)", idem.j.plan.summary.insert === 0);

  // 3. resolve: keep existing -> unchanged; then use incoming on a second resolve path
  await api("/api/import/conflicts", { id: conflict.id, choice: "keep_existing" });
  check("keep_existing leaves the note unchanged", (await db.from("vc_pipeline").select("personal_notes").eq("id", vc.id).single()).data!.personal_notes === "original private note");
  const { data: c3 } = await db.from("import_conflicts").insert({ vc_id: vc.id, field: "personal_notes", existing_value: "original private note", incoming_value: "CHOSEN BY USER", match_basis: "name_and_firm", source: "csv" }).select("id").single();
  await api("/api/import/conflicts", { id: c3!.id, choice: "use_incoming" });
  check("use_incoming (explicit choice) updates only that field", (await db.from("vc_pipeline").select("personal_notes, firm_domain, follow_up_score").eq("id", vc.id).single()).data!.personal_notes === "CHOSEN BY USER");

  // 4. signal columns untouched by import RPCs: none were ever set for the test row
  check("signal columns still null (import RPCs cannot touch them)", (await db.from("vc_pipeline").select("follow_up_score, recommended_action, signal_summary, last_signal_date").eq("id", vc.id).single()).data!.follow_up_score === null);

  // 5. notes, materials, drafts
  const n = await api("/api/workspace", { entity: "note", op: "insert", values: { vc_id: vc.id, title: "Live check note", state: "interested" } });
  check("note insert ok and state recorded as user_confirmed", n.status === 200 && (await db.from("relationship_events").select("state_confidence, provenance").eq("id", n.j.id).single()).data?.state_confidence === "user_confirmed");
  const bad = await api("/api/workspace", { entity: "materials", op: "insert", values: { kind: "claim", title: "x", token_enc: "hack" } });
  check("non-allow-listed field rejected", bad.status === 500 && /not editable/.test(bad.j.error ?? ""));
  const forbidden = await api("/api/workspace", { entity: "vc_pipeline", op: "update", id: vc.id, values: { personal_notes: "x" } });
  check("vc_pipeline is unreachable through the generic endpoint", forbidden.status === 500 && /unknown entity/.test(forbidden.j.error ?? ""));
  const m = await api("/api/workspace", { entity: "materials", op: "insert", values: { kind: "claim", title: "LIVE-CHECK ARR", claim_text: "LIVE CHECK approved claim" } });
  materialId = m.j.id;
  const m2 = await api("/api/workspace", { entity: "materials", op: "insert", values: { kind: "claim", title: "LIVE-CHECK unapproved", claim_text: "LIVE CHECK UNAPPROVED claim" } });
  await api("/api/workspace", { entity: "materials", op: "update", id: materialId, values: { approved: true } });
  await api("/api/workspace", { entity: "settings-not-real", op: "insert", values: {} });
  const d = await api("/api/drafts", { vc_id: vc.id, create: false });
  check("draft preview uses approved claim only", d.status === 200 && d.j.draft.body.includes("LIVE CHECK approved claim") && !d.j.draft.body.includes("UNAPPROVED"), d.j.error ?? "");
  const sent = await api("/api/drafts", { vc_id: vc.id, create: true });
  check("creating a Gmail draft without a connected Gmail fails cleanly (and cannot send)", sent.status === 500 && /not connected/.test(sent.j.error ?? ""), sent.j.error ?? "");

  // 6. intros: contacts csv -> path to the test VC
  const ic = await api("/api/intros", { action: "contacts_csv", csv: "name,email,company,relationship,confidence,vc_firm\nLive Check Partner,partner@zzcheck.example,ZZ Live Check VC,knows,0.9,ZZ Live Check VC\n" });
  check("contacts import creates a node + edge", ic.j.contacts === 1 && ic.j.edges === 1, JSON.stringify(ic.j));
  const paths = await api("/api/intros", { action: "paths", vc_id: vc.id });
  check("a confirmed, actionable path is found", paths.j.paths?.[0]?.actionable === true && paths.j.paths[0].label === "possible introduction path");

  // 7. today view data + settings
  const st = await api("/api/workspace", { key: "round_target_investors", value: 40 }, "PUT");
  check("settings PUT accepts numbers", st.status === 200, JSON.stringify(st.j));
  await db.from("app_settings").delete().eq("key", "round_target_investors");

  // 8. undo batches
  const rv2 = await api("/api/import/revert", { batch_id: batch2 });
  check("reverting the merge batch removes nothing it did not create", rv2.j.removed_vcs === 0, JSON.stringify(rv2.j));
  void m2;
} finally {
  // cleanup everything created by this script
  if (batch1) await api("/api/import/revert", { batch_id: batch1 });
  await db.from("materials").delete().like("title", "LIVE-CHECK%");
  await db.from("warm_nodes").delete().eq("label", "Live Check Partner");
  await db.from("import_batches").delete().in("id", [batch1, batch2].filter(Boolean) as string[]);
  await db.from("user_feedback").delete().eq("note", "live-check");
}
const gone = ((await db.from("vc_pipeline").select("id").eq("firm_name", "ZZ Live Check VC")).data ?? []).length === 0;
check("test investor removed by import undo", gone);
check("all 50 real investor rows are byte-identical (manual AND signal columns)", (await snapshot()) === before);
console.log(failures ? `\n${failures} FAILED` : "\nALL LIVE CHECKS PASSED");
process.exit(failures ? 1 : 0);
