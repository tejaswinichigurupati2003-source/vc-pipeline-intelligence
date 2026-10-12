import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { db } from "@/lib/db/client";
import { disconnect } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

const Body = z.object({ provider: z.enum(["gmail", "calendar"]), deleteData: z.boolean().default(false) });

/**
 * Disconnect = revoke access + delete the stored token. With deleteData the data that integration brought in is removed too.
 * Founder-entered notes and confirmed items from other sources are never touched.
 */
export const POST = adminRoute(Body, async ({ provider, deleteData }) => {
  await disconnect(provider);
  const removed: Record<string, number> = {};
  if (deleteData) {
    if (provider === "gmail") {
      const { data: evs } = await db().from("relationship_events").select("id").eq("provenance", "gmail");
      const ids = (evs ?? []).map((e) => e.id);
      if (ids.length) await db().from("commitments").delete().in("event_id", ids);
      const { count } = await db().from("relationship_events").delete({ count: "exact" }).eq("provenance", "gmail");
      removed.relationship_events = count ?? 0;
    } else if (provider === "calendar") {
      const { count } = await db().from("calendar_events").delete({ count: "exact" }).gte("start_at", "1970-01-01");
      removed.calendar_events = count ?? 0;
      await db().from("warm_edges").delete().eq("provenance", "meeting");
      await db().from("warm_nodes").delete().eq("source", "calendar");
    }
  }
  return { ok: true, removed };
});
