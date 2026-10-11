import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { db } from "@/lib/db/client";
import { mutate } from "@/lib/workspace/entities";

export const dynamic = "force-dynamic";

const Body = z.object({
  entity: z.string(),
  op: z.enum(["insert", "update", "delete"]),
  id: z.string().uuid().optional(),
  values: z.record(z.string(), z.unknown()).optional(),
});

/** Generic allow-listed mutation (materials, diligence, commitments, notes, meetings, feedback, edges, nodes). */
export const POST = adminRoute(Body, async ({ entity, op, id, values }) => {
  const result = await mutate(entity, op, id, values);
  // Confirming/correcting a relationship state is the founder's word: record it as user_confirmed.
  if (entity === "note" && op === "update" && values && "state" in values) {
    await db().from("relationship_events").update({ state_confidence: "user_confirmed" }).eq("id", id!);
  }
  return result;
});

const Setting = z.object({ key: z.enum(["founder_name", "company_name", "company_one_liner", "round_target_investors", "round_target_conversations", "follow_up_after_days"]), value: z.coerce.string().max(500) });
export const PUT = adminRoute(Setting, async ({ key, value }) => {
  const { error } = await db().from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return { ok: true };
});
