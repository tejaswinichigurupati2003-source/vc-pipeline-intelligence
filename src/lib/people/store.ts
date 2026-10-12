import { db } from "@/lib/db/client";
import { normText } from "@/lib/discovery/normalize";
import type { FoundPerson } from "./extract";

/** Associated people live in their own table. The scanner and the founder both write here; vc_pipeline is never touched. */
export interface PersonRow { id: string; vc_id: string; name: string; role: string | null; source: "investor_row" | "signal" | "manual"; source_url: string | null; source_quote: string | null }

const MAX_PEOPLE_PER_VC = 8;

export async function peopleByVc(): Promise<Map<string, { name: string; role: string | null }[]>> {
  const { data } = await db().from("vc_people").select("vc_id, name, role, source").eq("active", true).order("created_at");
  const m = new Map<string, { name: string; role: string | null }[]>();
  for (const r of data ?? []) m.set(r.vc_id, [...(m.get(r.vc_id) ?? []), { name: r.name, role: r.role }]);
  return m;
}

export async function listPeople(vcId: string): Promise<PersonRow[]> {
  const { data } = await db().from("vc_people").select("*").eq("vc_id", vcId).eq("active", true).order("created_at");
  return (data ?? []) as PersonRow[];
}

/** Insert people not already known for this investor (ignores duplicates, keeps the list short). */
export async function addPeople(vcId: string, people: (FoundPerson | { name: string; role: string | null; quote?: string })[], source: PersonRow["source"], sourceUrl: string | null) {
  if (!people.length) return;
  const { count } = await db().from("vc_people").select("id", { count: "exact", head: true }).eq("vc_id", vcId).eq("active", true);
  const room = Math.max(0, MAX_PEOPLE_PER_VC - (count ?? 0));
  if (source !== "manual" && room === 0) return;
  const rows = people.slice(0, source === "manual" ? people.length : room).map((p) => ({
    vc_id: vcId, name: p.name, name_key: normText(p.name), role: p.role || null, source, source_url: sourceUrl, source_quote: "quote" in p ? p.quote ?? null : null,
  }));
  const { error } = await db().from("vc_people").upsert(rows, { onConflict: "vc_id,name_key", ignoreDuplicates: true });
  if (error) throw new Error(`addPeople: ${error.message}`);
}

export async function removePerson(id: string): Promise<void> {
  const { error } = await db().from("vc_people").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
