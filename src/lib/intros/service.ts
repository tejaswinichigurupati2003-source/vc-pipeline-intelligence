import { db } from "@/lib/db/client";
import { parseCsv } from "@/lib/import-csv";
import { normText } from "@/lib/discovery/normalize";
import { findPaths, type GEdge, type GNode, type IntroPath } from "./paths";

export async function ensureFounderNode(label = "Founder"): Promise<string> {
  const { data } = await db().from("warm_nodes").select("id").eq("kind", "founder").maybeSingle();
  if (data) return data.id;
  const { data: n, error } = await db().from("warm_nodes").insert({ kind: "founder", label, source: "user" }).select("id").single();
  if (error) throw new Error(error.message);
  return n.id;
}

export async function ensureVcNode(vcId: string, label: string): Promise<string> {
  const { data } = await db().from("warm_nodes").select("id").eq("kind", "vc").eq("vc_id", vcId).maybeSingle();
  if (data) return data.id;
  const { data: n, error } = await db().from("warm_nodes").insert({ kind: "vc", label, vc_id: vcId, source: "system" }).select("id").single();
  if (error) throw new Error(error.message);
  return n.id;
}

export async function loadGraph(): Promise<{ nodes: GNode[]; edges: GEdge[] }> {
  const { data: nodes } = await db().from("warm_nodes").select("id, kind, label, vc_id");
  const { data: edges } = await db().from("warm_edges").select("*");
  return { nodes: (nodes ?? []) as GNode[], edges: (edges ?? []) as GEdge[] };
}

export async function pathsForVc(vcId: string): Promise<IntroPath[]> {
  const { data: vc } = await db().from("vc_pipeline").select("id, firm_name").eq("id", vcId).maybeSingle();
  if (!vc) return [];
  await ensureVcNode(vc.id, vc.firm_name);
  const g = await loadGraph();
  return findPaths(g.nodes, g.edges, vcId, new Date());
}

type Rel = "knows" | "worked_with" | "introduced" | "invested_in" | "spoke_with";
const REL: Rel[] = ["knows", "worked_with", "introduced", "invested_in", "spoke_with"];

export async function addEdge(e: {
  from_node: string; to_node: string; relation_type: Rel; provenance: GEdge["provenance"]; confidence: number;
  user_confirmed?: boolean; can_act?: boolean; last_observed_at?: string | null;
}) {
  if (e.from_node === e.to_node) throw new Error("An edge needs two different people");
  const { error } = await db().from("warm_edges").upsert({
    ...e, user_confirmed: e.user_confirmed ?? false, can_act: e.can_act ?? false, last_observed_at: e.last_observed_at ?? new Date().toISOString(),
  }, { onConflict: "from_node,to_node,relation_type" });
  if (error) throw new Error(error.message);
}

/**
 * Contacts export (the founder's own, user-selected file) -> graph. Columns:
 *   name (required), email, company, relationship (knows|worked_with|introduced), confidence (0-1),
 *   vc_firm (this person works at a tracked firm), portfolio_of (this person founded a company that firm backed), note.
 * Edges from a user-supplied export are user_supplied + confirmed + actionable: the founder is stating the relationship.
 */
export async function importContactsCsv(csv: string) {
  const rows = parseCsv(csv);
  const founder = await ensureFounderNode();
  const { data: vcs } = await db().from("vc_pipeline").select("id, firm_name");
  const byFirm = new Map((vcs ?? []).map((v) => [normText(v.firm_name), v]));
  const out = { contacts: 0, edges: 0, unmatchedFirms: [] as string[], skipped: 0 };

  for (const r of rows) {
    const name = (r.name ?? r.full_name ?? "").trim();
    if (!name) { out.skipped++; continue; }
    const firmKey = normText(r.vc_firm ?? ""), portKey = normText(r.portfolio_of ?? "");
    const workFirm = firmKey ? byFirm.get(firmKey) : undefined, portFirm = portKey ? byFirm.get(portKey) : undefined;
    if (firmKey && !workFirm) out.unmatchedFirms.push(r.vc_firm);
    if (portKey && !portFirm) out.unmatchedFirms.push(r.portfolio_of);
    const kind = workFirm ? "vc_partner" : portFirm ? "portfolio_founder" : "contact";
    const email = (r.email ?? "").trim().toLowerCase() || null;

    let nodeId: string | null = null;
    if (email) nodeId = (await db().from("warm_nodes").select("id").eq("email", email).maybeSingle()).data?.id ?? null;
    if (!nodeId) {
      const { data: n, error } = await db().from("warm_nodes")
        .insert({ kind, label: name, email, company: (r.company ?? "").trim() || null, vc_id: workFirm?.id ?? null, note: (r.note ?? "").trim() || null, source: "contacts_csv" })
        .select("id").single();
      if (error) { out.skipped++; continue; }
      nodeId = n.id;
    }
    out.contacts++;
    const rel = (REL as string[]).includes((r.relationship ?? "").trim()) ? ((r.relationship ?? "").trim() as Rel) : "knows";
    const conf = Math.min(1, Math.max(0, Number(r.confidence) || 0.6));
    await addEdge({ from_node: founder, to_node: nodeId!, relation_type: rel, provenance: "user_supplied", confidence: conf, user_confirmed: true, can_act: true });
    out.edges++;
    if (portFirm) {
      const vcNode = await ensureVcNode(portFirm.id, portFirm.firm_name);
      await addEdge({ from_node: nodeId!, to_node: vcNode, relation_type: "invested_in", provenance: "user_supplied", confidence: 0.7, user_confirmed: true, can_act: true });
      out.edges++;
    }
  }
  return out;
}

/** Opt-in only: a shared meeting is weak evidence of acquaintance. Stored unconfirmed, not actionable, confidence 0.3. */
export async function recordMeetingEdge(vcId: string, firmLabel: string, guestEmail: string, observedAt: string) {
  const founder = await ensureFounderNode();
  await ensureVcNode(vcId, firmLabel);
  let nodeId = (await db().from("warm_nodes").select("id").eq("email", guestEmail).maybeSingle()).data?.id as string | undefined;
  if (!nodeId) {
    const { data } = await db().from("warm_nodes").insert({ kind: "vc_partner", label: guestEmail.split("@")[0], email: guestEmail, vc_id: vcId, source: "calendar" }).select("id").single();
    nodeId = data?.id;
  }
  if (nodeId) await addEdge({ from_node: founder, to_node: nodeId, relation_type: "spoke_with", provenance: "meeting", confidence: 0.3, user_confirmed: false, can_act: false, last_observed_at: observedAt });
}
