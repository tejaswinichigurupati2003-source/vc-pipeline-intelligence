import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: run } = await db.from("signal_runs").select("id").order("started_at", { ascending: false }).limit(1).single();
const { data } = await db.from("signal_run_items").select("status, error_code, error_message, started_at, finished_at").eq("run_id", run!.id).order("started_at");
console.table(data!.slice(0, 12));
