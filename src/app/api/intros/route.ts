import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { addEdge, ensureFounderNode, importContactsCsv, pathsForVc } from "@/lib/intros/service";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("contacts_csv"), csv: z.string().min(1).max(1_000_000) }),
  z.object({ action: z.literal("paths"), vc_id: z.string().uuid() }),
  z.object({
    action: z.literal("edge"), from_node: z.string().uuid().optional(), to_node: z.string().uuid(),
    relation_type: z.enum(["knows", "worked_with", "introduced", "invested_in", "spoke_with"]),
    provenance: z.enum(["user_supplied", "contact_match", "meeting", "communications"]).default("user_supplied"),
    confidence: z.number().min(0).max(1).default(0.6), can_act: z.boolean().default(true),
  }),
  z.object({ action: z.literal("set_founder"), label: z.string().min(1).max(100) }),
]);

export const POST = adminRoute(Body, async (b) => {
  switch (b.action) {
    case "contacts_csv": return importContactsCsv(b.csv);
    case "paths": return { paths: await pathsForVc(b.vc_id) };
    case "edge": {
      const from = b.from_node ?? (await ensureFounderNode());
      await addEdge({ from_node: from, to_node: b.to_node, relation_type: b.relation_type, provenance: b.provenance, confidence: b.confidence, user_confirmed: b.provenance === "user_supplied", can_act: b.can_act });
      return { ok: true };
    }
    case "set_founder": {
      const { db } = await import("@/lib/db/client");
      const id = await ensureFounderNode(b.label);
      await db().from("warm_nodes").update({ label: b.label }).eq("id", id);
      return { ok: true };
    }
  }
});
