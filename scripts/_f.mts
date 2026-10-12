import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: run } = await db.from("signal_runs").select("id").order("started_at", { ascending: false }).limit(1).single();
const { data } = await db.from("signal_run_items").select("status, scan_mode, error_code, error_message, started_at, finished_at, vc_id").eq("run_id", run!.id).in("status", ["failed", "partial"]);
const { data: vcs } = await db.from("vc_pipeline").select("id, firm_name");
const n = new Map((vcs ?? []).map((v) => [v.id, v.firm_name]));
for (const r of data ?? []) console.log(`${(n.get(r.vc_id) ?? "").padEnd(26)} ${r.status.padEnd(8)} ${String(r.error_code).padEnd(13)} ${(r.error_message ?? "").slice(0, 150)}`);
const { data: all } = await db.from("signal_run_items").select("scan_mode").eq("run_id", run!.id);
console.log("rules_only items:", (all ?? []).filter((x) => x.scan_mode === "rules_only").length, "of", all?.length);
