/**
 * Possible warm-introduction paths (spec 26.5). Pure graph search over the FOUNDER'S OWN graph (single tenant).
 * Presented as "possible introduction path" until edges are confirmed. Nothing here reads emails or other customers' data.
 */

export interface GNode { id: string; kind: "founder" | "contact" | "portfolio_founder" | "vc_partner" | "vc"; label: string; vc_id: string | null }
export interface GEdge {
  id: string; from_node: string; to_node: string;
  relation_type: "knows" | "worked_with" | "introduced" | "invested_in" | "spoke_with";
  provenance: "user_supplied" | "contact_match" | "meeting" | "communications";
  confidence: number; last_observed_at: string | null; user_confirmed: boolean; can_act: boolean; visibility: "founder_only" | "team";
}

export interface PathEdge extends GEdge { effectiveConfidence: number; stale: boolean; from: GNode; to: GNode }
export interface IntroPath {
  nodes: GNode[];
  edges: PathEdge[];
  confidence: number;
  hops: number;
  /** Every edge is confirmed by the founder AND marked as something the founder can legitimately act on. */
  actionable: boolean;
  needsConfirmation: PathEdge[];
  label: "possible introduction path";
}

const UNCONFIRMED_CAP = 0.4;
const STALE_DAYS = 365;

export function effectiveConfidence(e: GEdge, now: Date): { value: number; stale: boolean } {
  let v = e.user_confirmed ? e.confidence : Math.min(e.confidence, UNCONFIRMED_CAP);
  const stale = !!e.last_observed_at && (now.getTime() - new Date(e.last_observed_at).getTime()) / 86_400_000 > STALE_DAYS;
  if (stale) v *= 0.7;
  return { value: Math.round(v * 1000) / 1000, stale };
}

export function findPaths(nodes: GNode[], edges: GEdge[], targetVcId: string, now: Date, opts: { maxHops?: number; maxPaths?: number } = {}): IntroPath[] {
  const maxHops = opts.maxHops ?? 4;
  const founder = nodes.find((n) => n.kind === "founder");
  if (!founder) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isTarget = (n: GNode) => n.vc_id === targetVcId;
  const adj = new Map<string, GEdge[]>();
  for (const e of edges) {
    if (e.visibility !== "founder_only" && e.visibility !== "team") continue;
    for (const k of [e.from_node, e.to_node]) adj.set(k, [...(adj.get(k) ?? []), e]);
  }

  const results: IntroPath[] = [];
  const walk = (cur: GNode, seen: Set<string>, pathNodes: GNode[], pathEdges: PathEdge[]) => {
    if (pathEdges.length >= maxHops || results.length > 200) return;
    for (const e of adj.get(cur.id) ?? []) {
      const nextId = e.from_node === cur.id ? e.to_node : e.from_node;
      const next = byId.get(nextId);
      if (!next || seen.has(next.id)) continue;
      const eff = effectiveConfidence(e, now);
      const pe: PathEdge = { ...e, effectiveConfidence: eff.value, stale: eff.stale, from: cur, to: next };
      const ne = [...pathEdges, pe], nn = [...pathNodes, next];
      if (isTarget(next)) {
        const confidence = Math.round(ne.reduce((p, x) => p * x.effectiveConfidence, 1) * 1000) / 1000;
        results.push({
          nodes: nn, edges: ne, confidence, hops: ne.length, actionable: ne.every((x) => x.user_confirmed && x.can_act),
          needsConfirmation: ne.filter((x) => !x.user_confirmed || !x.can_act), label: "possible introduction path",
        });
        continue; // a path ends at the first target node
      }
      walk(next, new Set([...seen, next.id]), nn, ne);
    }
  };
  walk(founder, new Set([founder.id]), [founder], []);

  return results
    .sort((a, b) => Number(b.actionable) - Number(a.actionable) || b.confidence - a.confidence || a.hops - b.hops)
    .slice(0, opts.maxPaths ?? 3);
}
