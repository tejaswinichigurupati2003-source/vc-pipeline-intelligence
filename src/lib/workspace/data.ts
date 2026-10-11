import { db } from "@/lib/db/client";
import { getPipeline, type PipelineRow } from "@/lib/db/read";

export async function getSettings(): Promise<Record<string, string>> {
  const { data } = await db().from("app_settings").select("key, value");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

export async function getStates(): Promise<Record<string, { state: string; confirmed: boolean; at: string }>> {
  const { data } = await db().from("relationship_events").select("vc_id, state, state_confidence, occurred_at")
    .not("vc_id", "is", null).not("state", "is", null).order("occurred_at", { ascending: false });
  const out: Record<string, { state: string; confirmed: boolean; at: string }> = {};
  for (const r of data ?? []) if (!out[r.vc_id]) out[r.vc_id] = { state: r.state, confirmed: r.state_confidence === "user_confirmed", at: r.occurred_at };
  return out;
}

export type Row = PipelineRow;
export const pipeline = () => getPipeline(true); // workspace is admin-gated: private notes allowed

export async function topSignalUrls(): Promise<Record<string, string>> {
  const rows = await getPipeline(false);
  return Object.fromEntries(rows.filter((r) => r.top_signal).map((r) => [r.id, r.top_signal!.source_url]));
}
